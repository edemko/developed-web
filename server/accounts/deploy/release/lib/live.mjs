// Discover what is live for each side of an app, read-only.
import { basename, relative } from 'node:path';
import { liveSpec } from './config.mjs';
import { sourceCandidates } from './gates.mjs';
import * as git from './git.mjs';
import { ReleaseError, run, sudo, sudoRead, sudoTest } from './sh.mjs';

const readJson = (path) => {
  if (!sudoTest('-f', path)) return null;
  try { return JSON.parse(sudoRead(path)); } catch { return null; }
};

// Release name for a path inside releaseRoot (first segment), else the directory basename.
export function releaseNameOf(config, path) {
  const rel = relative(config.releaseRoot, path);
  if (rel && !rel.startsWith('..')) return rel.split('/')[0];
  return basename(path.replace(/\/+$/, ''));
}

export function releaseDirOf(config, path) {
  const rel = relative(config.releaseRoot, path);
  if (rel && !rel.startsWith('..')) return `${config.releaseRoot}/${rel.split('/')[0]}`;
  return path.replace(/\/+$/, '');
}

export function sourceOf(config, name, dir) {
  const candidates = sourceCandidates({
    name,
    manifest: readJson(`${dir}/release-manifest.json`),
    deployment: readJson(`${dir}/DEPLOYMENT.json`),
    revisionFile: sudoTest('-f', `${dir}/REVISION`) ? sudoRead(`${dir}/REVISION`)
      : sudoTest('-f', `${dir}/RELEASE_REVISION`) ? sudoRead(`${dir}/RELEASE_REVISION`) : null,
    knownSources: config.knownSources,
  });
  for (const candidate of candidates) {
    const sha = git.resolve(config.repo, candidate);
    if (sha) return sha;
  }
  return null;
}

function activeUnits(pattern) {
  return run('systemctl', ['list-units', pattern, '--state=active', '--no-legend', '--plain'])
    .out.split('\n').map((line) => line.split(/\s+/)[0]).filter(Boolean);
}

function caddyRoot(prefix) {
  const caddy = sudoRead('/etc/caddy/Caddyfile');
  const hits = caddy.split('\n').map((l) => l.trim().match(/^root \* (\S+)$/)?.[1]).filter((p) => p?.startsWith(prefix));
  if (hits.length !== 1) throw new ReleaseError(`expected one Caddy root starting ${prefix}, found ${hits.length}`);
  return hits[0];
}

// Returns { unit?, path, release, dir, source } for one side.
export function probeSide(config, side) {
  const spec = liveSpec(side);
  let path;
  let unit;
  if (spec.kind === 'symlink') {
    const target = sudo('readlink', ['-f', spec.path], { allowFail: true }).out;
    if (!target) throw new ReleaseError(`${spec.path} does not resolve`);
    path = target;
  } else if (spec.kind === 'units') {
    const units = activeUnits(spec.pattern);
    if (units.length !== 1) throw new ReleaseError(`expected exactly one active ${spec.pattern}, found ${units.length}: ${units.join(' ')}`);
    unit = units[0];
    const instance = unit.slice(unit.indexOf('@') + 1, -'.service'.length);
    path = `${config.releaseRoot}/${instance}`;
  } else if (spec.kind === 'unit-path') {
    unit = spec.unit;
    const props = run('systemctl', ['show', unit, '-p', 'WorkingDirectory', '-p', 'ExecStart', '-p', 'ActiveState']).out;
    if (!/ActiveState=active/.test(props)) throw new ReleaseError(`${unit} is not active`);
    const hit = props.match(new RegExp(`${config.releaseRoot.replace(/[/.]/g, '\\$&')}/[^\\s;/]+`));
    if (!hit) throw new ReleaseError(`${unit} does not run from ${config.releaseRoot}`);
    path = hit[0];
  } else if (spec.kind === 'caddy-root') {
    path = caddyRoot(spec.prefix);
  } else {
    throw new ReleaseError(`unknown live kind ${spec.kind}`);
  }
  const release = releaseNameOf(config, path);
  const dir = releaseDirOf(config, path);
  return { unit, path, release, dir, source: sourceOf(config, release, dir) };
}

export function probe(config) {
  const out = {};
  for (const [name, side] of Object.entries(config.sides)) {
    try { out[name] = probeSide(config, side); }
    catch (error) { out[name] = { error: error.message, source: null }; }
  }
  return out;
}
