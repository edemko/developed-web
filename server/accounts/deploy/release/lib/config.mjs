// Per-app release configs live in ../apps/<app>.json. See ../README.md for the schema.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReleaseError } from './sh.mjs';

export const appsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps');

const SWITCH_TYPES = new Set(['web-symlink', 'instance-swap', 'symlink-restart', 'manual']);
const LIVE_KINDS = new Set(['symlink', 'units', 'caddy-root', 'unit-path']);

export function validate(config) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(/^[a-z0-9-]+$/.test(config.app ?? ''), 'app must be a lowercase slug');
  need(typeof config.repo === 'string' && config.repo.startsWith('/'), 'repo must be an absolute path');
  need(typeof config.branch === 'string', 'branch is required');
  need(typeof config.releaseRoot === 'string' && config.releaseRoot.startsWith('/opt/'), 'releaseRoot must live under /opt');
  need(config.sides && Object.keys(config.sides).length > 0, 'at least one side is required');
  need(!config.auto || config.onboarded, 'auto requires onboarded');
  need(config.onboarded || (Array.isArray(config.blockers) && config.blockers.length > 0),
    'a non-onboarded app must list its blockers');
  for (const [name, side] of Object.entries(config.sides ?? {})) {
    const where = `sides.${name}`;
    need(Array.isArray(side.paths) && side.paths.length > 0, `${where}.paths is required`);
    need(SWITCH_TYPES.has(side.switch?.type), `${where}.switch.type must be one of ${[...SWITCH_TYPES]}`);
    need(LIVE_KINDS.has(liveSpec(side).kind), `${where}.live.kind is invalid`);
    if (config.onboarded && side.switch?.type !== 'manual') {
      need(Array.isArray(side.steps) && side.steps.length > 0, `${where}.steps is required`);
      need(Array.isArray(side.artifacts) && side.artifacts.length > 0, `${where}.artifacts is required`);
      need(Array.isArray(side.health) && side.health.length > 0, `${where}.health is required`);
      for (const artifact of side.artifacts ?? []) {
        need(!artifact.to.includes('..') && !artifact.to.startsWith('/'), `${where} artifact target must be relative`);
      }
    }
    if (side.switch?.type === 'instance-swap') {
      need(side.switch.unit?.includes('@{release}.service'), `${where}.switch.unit must contain @{release}.service`);
    }
  }
  if (config.onboarded && config.auto && Object.values(config.sides ?? {}).some((s) => s.switch?.type === 'manual')) {
    errors.push('auto deploy cannot include a manual side');
  }
  if (errors.length) throw new ReleaseError(`${config.app ?? '?'} config invalid:\n  ${errors.join('\n  ')}`);
  return config;
}

// The live-state probe can be derived from the switch for the common cases.
export function liveSpec(side) {
  if (side.live) return side.live;
  if (side.switch?.type === 'web-symlink' || side.switch?.type === 'symlink-restart') {
    return { kind: 'symlink', path: side.switch.link };
  }
  if (side.switch?.type === 'instance-swap') {
    return { kind: 'units', pattern: side.switch.unit.replace('{release}', '*') };
  }
  return {};
}

export function sideOrder(config) {
  return config.switchOrder ?? Object.keys(config.sides);
}

export function loadApp(app) {
  if (!/^[a-z0-9-]+$/.test(app)) throw new ReleaseError(`invalid app name ${app}`);
  let raw;
  try { raw = readFileSync(join(appsDir, `${app}.json`), 'utf8'); }
  catch { throw new ReleaseError(`no config for app ${app} in ${appsDir}`); }
  return validate(JSON.parse(raw));
}

export const listApps = () =>
  readdirSync(appsDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
