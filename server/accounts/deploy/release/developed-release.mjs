#!/usr/bin/env node
// developed-release — build, seal and switch isolated DevelopED app releases, per app,
// manually or on push to main (poll). See README.md beside this file.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, HOME, releaseNameFor, releaseSides } from './lib/build.mjs';
import { listApps, loadApp, sideOrder } from './lib/config.mjs';
import { decide } from './lib/gates.mjs';
import * as git from './lib/git.mjs';
import { probe } from './lib/live.mjs';
import { log, ReleaseError, run, sudo, sudoTest } from './lib/sh.mjs';
import { switchSides } from './lib/switch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const STATE = `${HOME}/.local/state/developed-release`;
const toolVersion = existsSync(join(here, 'VERSION')) ? readFileSync(join(here, 'VERSION'), 'utf8').trim() : 'dev';
mkdirSync(STATE, { recursive: true });

const record = (app, line) => appendFileSync(join(STATE, 'history.log'), `${new Date().toISOString()} ${app} ${line}\n`);
const readState = (app) => { try { return JSON.parse(readFileSync(join(STATE, `${app}.json`), 'utf8')); } catch { return {}; } };
const writeState = (app, state) => writeFileSync(join(STATE, `${app}.json`), `${JSON.stringify(state, null, 2)}\n`);
const short = (sha) => sha?.slice(0, 12) ?? '?';

// Phone notification for automatic runs (ntfy on loopback; topic overridable).
function notify(title, message, priority = 'default') {
  const topic = process.env.DEVELOPED_RELEASE_NTFY ?? 'http://127.0.0.1:8080/claude-sessions';
  run('curl', ['-s', '-m', '5', '-o', '/dev/null', '-H', `Title: ${title}`, '-H', `Priority: ${priority}`,
    '-H', 'Tags: rocket', '-d', message, topic], { allowFail: true });
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (const arg of argv) {
    const match = arg.match(/^--([a-z-]+)(?:=(.*))?$/);
    if (match) flags[match[1]] = match[2] ?? true;
    else flags._.push(arg);
  }
  return flags;
}

// Everything decide() needs, computed read-only.
function assess(config, { commit, auto = false, flags = {} }) {
  git.fetchBranch(config.repo, config.branch);
  const head = git.resolve(config.repo, `origin/${config.branch}`);
  const target = commit ? git.resolve(config.repo, commit) : head;
  if (!target) throw new ReleaseError(`cannot resolve ${commit}`);
  if (!git.isAncestor(config.repo, target, head)) throw new ReleaseError(`${short(target)} is not on origin/${config.branch}`);
  const live = probe(config);
  const sides = {};
  let migrationsChanged = false;
  for (const [name, side] of Object.entries(config.sides)) {
    const liveSource = live[name].source;
    const contained = Boolean(liveSource) && git.isAncestor(config.repo, liveSource, target);
    sides[name] = {
      liveSource,
      liveContained: contained,
      liveIsTarget: liveSource === target,
      changed: contained && git.changed(config.repo, liveSource, target, side.paths),
      manual: side.switch.type === 'manual',
    };
    if (contained && git.changed(config.repo, liveSource, target, config.migrationPaths ?? [])) migrationsChanged = true;
  }
  const state = readState(config.app);
  const decision = decide({
    auto,
    subject: git.subject(config.repo, target),
    migrationsChanged,
    migrationsApplied: Boolean(flags['migrations-applied']),
    force: Boolean(flags.force),
    heldAttempts: state.target === target ? state.attempts ?? 0 : 0,
    sides,
  });
  return { target, head, live, sides, decision };
}

async function deploy(app, { commit, auto = false, flags = {} }) {
  const config = loadApp(app);
  if (!config.onboarded) throw new ReleaseError(`${app} is not onboarded:\n  - ${config.blockers.join('\n  - ')}`);
  if (auto && !config.auto) return;
  const { target, live, decision } = assess(config, { commit, auto, flags });
  if (decision.action !== 'deploy') {
    const state = readState(app);
    if (state.lastReason !== decision.reason || !auto) log(`${app}: ${decision.action}: ${decision.reason}`);
    if (auto && decision.action === 'block' && state.lastReason !== decision.reason) {
      notify(`${app}: deploy blocked`, `${short(target)}: ${decision.reason}`, 'high');
    }
    writeState(app, { ...state, lastReason: decision.reason });
    if (decision.action === 'block' && !auto) process.exitCode = 1;
    return;
  }
  if (flags['dry-run']) { log(`${app}: would ${decision.reason} at ${short(target)}`); return; }

  const state = readState(app);
  const attempts = state.target === target ? (state.attempts ?? 0) + 1 : 1;
  writeState(app, { target, attempts, lastReason: decision.reason, at: new Date().toISOString() });
  try {
    const release = releaseNameFor(target);
    const existing = releaseSides(config, release);
    if (existing) {
      if (existing.sourceCommit !== target || decision.sides.some((s) => !existing.sides.includes(s))) {
        throw new ReleaseError(`release ${release} exists but does not cover ${decision.sides.join(', ')} from ${short(target)} — remove it first`);
      }
      log(`${app}: reusing sealed release ${release}`);
    } else {
      build(config, { sha: target, sides: decision.sides, live, toolVersion });
      record(app, `build ${release} ok (${decision.sides.join('+')})`);
    }
    const switched = await switchSides(config, { release, sha: target, sides: decision.sides, live, order: sideOrder(config) });
    record(app, `live ${release} (${switched.join('+') || 'no change'}) from ${short(target)}`);
    writeState(app, { target, attempts: 0, deployed: target, lastReason: 'deployed', at: new Date().toISOString() });
    log(`${app}: ${short(target)} is live (${switched.join(' + ')})`);
    if (auto) notify(`${app}: deployed`, `${short(target)} live (${switched.join(' + ')}): ${git.subject(config.repo, target)}`);
  } catch (error) {
    record(app, `FAILED ${short(target)} attempt ${attempts}: ${error.message.split('\n')[0]}`);
    if (auto) notify(`${app}: deploy FAILED (${attempts})`, `${short(target)}: ${error.message.slice(0, 500)}`, 'high');
    throw error;
  }
}

// Build and seal without switching (verification, or staging a release ahead of time).
function buildOnly(app, flags) {
  const config = loadApp(app);
  if (!config.onboarded) throw new ReleaseError(`${app} is not onboarded`);
  git.fetchBranch(config.repo, config.branch);
  const sha = git.resolve(config.repo, flags._[1] ?? `origin/${config.branch}`);
  if (!sha || !git.isAncestor(config.repo, sha, `origin/${config.branch}`)) throw new ReleaseError('commit must be on the branch');
  const sides = flags.sides ? String(flags.sides).split(',') : Object.keys(config.sides);
  const { dest } = build(config, { sha, sides, live: probe(config), toolVersion });
  record(app, `build ${releaseNameFor(sha)} ok (${sides.join('+')}, not switched)`);
  log(`${app}: sealed ${dest} — switch with: developed-release switch ${app} ${releaseNameFor(sha)}`);
}

function status(apps) {
  for (const app of apps) {
    let config;
    try { config = loadApp(app); } catch (error) { console.log(`${app}: CONFIG ERROR ${error.message}`); continue; }
    try {
      const { target, live, sides, decision } = assess(config, {});
      const mode = config.auto ? 'auto' : config.onboarded ? 'manual' : 'not onboarded';
      console.log(`\n${app}  [${mode}]  origin/${config.branch} ${short(target)}`);
      for (const [name, info] of Object.entries(sides)) {
        const l = live[name];
        if (l.error) { console.log(`  ${name.padEnd(4)} ? ${l.error}`); continue; }
        const behind = info.liveSource && info.liveContained ? git.countBetween(config.repo, info.liveSource, target) : null;
        const ahead = info.liveSource && !info.liveContained ? git.countBetween(config.repo, target, info.liveSource) : 0;
        const where = behind === null ? `live-only commits: ${ahead}` : `${behind} behind`;
        console.log(`  ${name.padEnd(4)} ${l.release} (${short(info.liveSource)}) ${l.unit ?? ''} — ${where}`);
      }
      console.log(`  next: ${decision.action} — ${decision.reason}`);
      if (!config.onboarded) for (const b of config.blockers) console.log(`  blocker: ${b}`);
    } catch (error) {
      console.log(`\n${app}: ERROR ${error.message}`);
    }
  }
}

async function poll() {
  for (const app of listApps()) {
    let config;
    try { config = loadApp(app); } catch (error) { log(`${app}: ${error.message}`); continue; }
    if (!config.auto) continue;
    try { await deploy(app, { auto: true }); }
    catch (error) { log(`${app}: FAILED: ${error.message}`); process.exitCode = 1; }
  }
}

function prune(app, flags) {
  const config = loadApp(app);
  const keep = Number(flags.keep ?? 3);
  const live = probe(config);
  if (Object.values(live).some((l) => l.error)) throw new ReleaseError('cannot determine every live release — not pruning');
  const releases = sudo('bash', ['-c', 'cd "$1" && ls -1dt -- */ | sed "s#/##"', 'ls', config.releaseRoot]).out.split('\n').filter(Boolean);
  // Protect: live releases, configured pins, and each side's rollback target (the previous
  // live source recorded in the live release's manifest).
  const protect = new Set([...(config.protect ?? []), ...Object.values(live).map((l) => l.release)]);
  const sourceToRelease = (sha) => releases.find((r) => r === sha.slice(0, 12)) ??
    Object.entries(config.knownSources ?? {}).find(([, s]) => sha.startsWith(s) || s.startsWith(sha))?.[0];
  for (const [name, l] of Object.entries(live)) {
    const manifestPath = `${l.dir}/release-manifest.json`;
    if (!sudoTest('-f', manifestPath)) continue;
    const manifest = JSON.parse(sudo('cat', [manifestPath]).out);
    const previous = manifest.previous?.[name] ?? (name === 'api' ? manifest.previousApiSource : null);
    const release = previous && sourceToRelease(previous);
    if (release) protect.add(release);
  }
  const candidates = releases.filter((r) => !protect.has(r)).slice(Math.max(0, keep - protect.size));
  for (const release of candidates) {
    const size = sudo('du', ['-sh', `${config.releaseRoot}/${release}`]).out.split(/\s/)[0];
    console.log(`${flags.apply ? 'removing' : 'would remove'} ${config.releaseRoot}/${release} (${size})`);
    if (flags.apply) {
      sudo('rm', ['-rf', '--', `${config.releaseRoot}/${release}`]);
      record(app, `pruned ${release}`);
    }
  }
  console.log(`kept: ${releases.filter((r) => !candidates.includes(r)).join(' ')}`);
}

const usage = `developed-release <command>
  status [app...]                     live vs origin/main and the next decision, per app
  deploy <app> [commit] [--dry-run] [--migrations-applied] [--force]
  build <app> [commit] [--sides=web,api]   build + seal only, no switch
  switch <app> <release> [--migrations-applied]   switch an already sealed release
  poll                                deploy every app with "auto": true (timer entry point)
  prune <app> [--keep=3] [--apply]    remove old releases (never live/protected ones)`;

const [command, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
try {
  if (command === 'status') status(flags._.length ? flags._ : listApps());
  else if (command === 'deploy' && flags._[0]) await deploy(flags._[0], { commit: flags._[1], flags });
  else if (command === 'build' && flags._[0]) buildOnly(flags._[0], flags);
  else if (command === 'switch' && flags._[1]) {
    const config = loadApp(flags._[0]);
    const sides = releaseSides(config, flags._[1]);
    if (!sides) throw new ReleaseError(`no sealed release ${flags._[1]}`);
    await deploy(flags._[0], { commit: sides.sourceCommit, flags });
  } else if (command === 'poll') await poll();
  else if (command === 'prune' && flags._[0]) prune(flags._[0], flags);
  else { console.error(usage); process.exitCode = 2; }
} catch (error) {
  log(`ERROR: ${error.message}`);
  process.exitCode = 1;
}
