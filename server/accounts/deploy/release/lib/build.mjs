// Build a release unprivileged from a commit archive, then seal it root-owned.
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { HASHED_ASSET } from './gates.mjs';
import * as git from './git.mjs';
import { log, ReleaseError, run, sudo, sudoRead, sudoTest } from './sh.mjs';

export const HOME = '/home/openclaw';
export const BUILD_NODE_BIN = `${HOME}/.nvm/versions/node/v22.23.2/bin`;
export const BUILD_LOCK = `${HOME}/.cache/developed-ecosystem-build.lock`;
export const WORK = `${HOME}/.cache/developed-release`;
const MIN_MEM_MB = 2048;

export const releaseNameFor = (sha) => sha.slice(0, 12);

function memAvailableMb() {
  const line = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+)/m);
  return line ? Math.floor(Number(line[1]) / 1024) : 0;
}

// Allowlisted public build values: KEY=VALUE file (repo-relative = read from the operator's
// checkout, absolute = root-owned file read via sudo). Only the named keys are passed on.
export function publicEnv(config, spec) {
  if (!spec) return {};
  const text = spec.file.startsWith('/') ? sudoRead(spec.file) : readFileSync(join(config.repo, spec.file), 'utf8');
  const values = {};
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || !spec.keys.includes(match[1])) continue;
    values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  const missing = spec.keys.filter((key) => !values[key]);
  if (missing.length) throw new ReleaseError(`public build env missing ${missing.join(', ')} in ${spec.file}`);
  return { ...values, ...(spec.set ?? {}) };
}

function baseEnv() {
  return {
    PATH: `${BUILD_NODE_BIN}:/usr/local/bin:/usr/bin:/bin`,
    HOME,
    LANG: 'C.UTF-8',
    CI: 'true',
    NG_CLI_ANALYTICS: 'false',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

function hashTree(root) {
  const files = {};
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files[relative(root, full)] = createHash('sha256').update(readFileSync(full)).digest('hex');
    }
  };
  walk(root);
  return files;
}

export const hashedAssets = (dir) => (existsSync(dir) ? readdirSync(dir).filter((n) => HASHED_ASSET.test(n)) : []);

// Copy the live release's hashed bundles that the new build no longer has, so tabs opened
// before the switch can still lazy-load their chunks. Only the live build's OWN bundles
// (recorded as builtAssets in its manifest) are carried, so the set never accumulates
// beyond one previous release. Releases without that record carry everything once.
export function carryForward(stageDir, liveDir, liveBuilt) {
  if (!liveDir || !existsSync(liveDir)) return [];
  const carried = [];
  for (const name of liveBuilt ?? hashedAssets(liveDir)) {
    if (existsSync(join(stageDir, name)) || !existsSync(join(liveDir, name))) continue;
    cpSync(join(liveDir, name), join(stageDir, name)); // published assets are world-readable
    carried.push(name);
  }
  return carried;
}

function liveBuiltAssets(live, name) {
  if (!live?.dir) return null;
  try {
    const manifest = JSON.parse(sudoRead(`${live.dir}/release-manifest.json`));
    return manifest.builtAssets?.[name] ?? null;
  } catch { return null; }
}

export function build(config, { sha, sides, live, toolVersion }) {
  const release = releaseNameFor(sha);
  const dest = `${config.releaseRoot}/${release}`;
  if (sudoTest('-e', dest)) throw new ReleaseError(`release ${dest} already exists`);
  const mem = memAvailableMb();
  if (mem < MIN_MEM_MB) throw new ReleaseError(`only ${mem} MB available (< ${MIN_MEM_MB}) — not building`);

  const work = join(WORK, `${config.app}-${release}`);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(join(work, 'src'), { recursive: true });
  const src = join(work, 'src');
  log(`${config.app}: archiving ${release} (${config.archivePaths.join(' ')})`);
  git.archive(config.repo, sha, config.archivePaths, src);
  const leaked = run('find', [src, '-name', '.env*', '-print', '-quit']).out;
  if (leaked) throw new ReleaseError(`.env file leaked into the archive: ${leaked}`);

  const patches = [];
  for (const patch of config.patches ?? []) {
    const file = join(src, patch.path);
    patches.push({ path: patch.path, sha256: createHash('sha256').update(readFileSync(file)).digest('hex') });
    run('patch', ['-p1', '-F0', '--no-backup-if-mismatch', '-i', file], { cwd: src });
    if (patch.verify && !readFileSync(join(src, patch.verify.file), 'utf8').includes(patch.verify.contains)) {
      throw new ReleaseError(`patch ${patch.path} did not produce the expected result`);
    }
  }

  // One locked bash per side so concurrent ecosystem builds never overlap on this small host.
  for (const name of sides) {
    const side = config.sides[name];
    log(`${config.app}: building ${name} (waiting for the shared build lock)`);
    const env = { ...baseEnv(), ...(side.env ?? {}), ...publicEnv(config, side.publicEnv) };
    run('flock', ['-w', '1800', BUILD_LOCK, 'bash', '-o', 'pipefail', '-ec', side.steps.join('\n')],
      { cwd: src, env, stream: true });
  }

  const stage = join(work, 'stage');
  mkdirSync(stage);
  let carried = 0;
  const builtAssets = {};
  for (const name of sides) {
    const side = config.sides[name];
    for (const artifact of side.artifacts) {
      const from = join(src, artifact.from);
      if (!existsSync(from)) throw new ReleaseError(`artifact ${artifact.from} was not produced`);
      cpSync(from, join(stage, artifact.to), { recursive: true, verbatimSymlinks: true });
    }
    for (const prune of side.pruneGlobs ?? []) {
      run('find', [stage, '-path', join(stage, prune.dir, '*'), '-name', prune.name, '-delete']);
    }
    if (side.carryForwardAssets) {
      const dir = join(stage, side.carryForwardAssets);
      builtAssets[name] = hashedAssets(dir);
      carried += carryForward(dir, live[name]?.path, liveBuiltAssets(live[name], name)).length;
    }
    for (const path of side.verify ?? []) {
      if (!existsSync(join(stage, path))) throw new ReleaseError(`expected ${path} in the release`);
    }
  }

  const files = hashTree(stage);
  const manifest = {
    version: 2,
    app: config.app,
    release,
    sourceCommit: sha,
    sides,
    previous: Object.fromEntries(sides.map((s) => [s, live[s]?.source ?? null])),
    builtBy: `developed-release ${toolVersion}`,
    source: `git archive of ${config.archivePaths.join(', ')}; all .env* excluded`,
    patches,
    carriedForwardAssets: carried,
    builtAssets,
    createdAt: new Date().toISOString(),
    checkedFiles: Object.keys(files).length,
    files,
  };
  writeFileSync(join(stage, 'release-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  log(`${config.app}: sealing ${dest} (${manifest.checkedFiles} files, ${carried} carried-forward assets)`);
  const staging = `${config.releaseRoot}/.staging-${release}`;
  sudo('rm', ['-rf', staging]);
  sudo('cp', ['-a', stage, staging]);
  sudo('chown', ['-R', 'root:root', staging]);
  sudo('chmod', ['-R', 'u=rwX,go=rX', staging]);
  sudo('chmod', ['0444', `${staging}/release-manifest.json`]);
  sudo('mv', ['-T', staging, dest]);
  for (const path of config.sides[sides[0]].verify ?? []) {
    if (sudo('-u', [config.runtimeUser, 'test', '-r', `${dest}/${path}`], { allowFail: true }).status !== 0) {
      throw new ReleaseError(`${config.runtimeUser} cannot read ${dest}/${path}`);
    }
  }
  rmSync(work, { recursive: true, force: true });
  return { release, dest, manifest };
}

export function releaseSides(config, release) {
  const path = `${config.releaseRoot}/${release}/release-manifest.json`;
  if (!sudoTest('-f', path)) return null;
  const manifest = JSON.parse(sudoRead(path));
  return { sourceCommit: manifest.sourceCommit, sides: manifest.sides ?? Object.keys(config.sides) };
}

export const dirSizeMb = (path) => Number(sudo('du', ['-sm', path]).out.split(/\s/)[0]);
