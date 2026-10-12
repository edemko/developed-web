// Node runtime per app ("node" in apps/<app>.json, default DEFAULT_NODE). Builds put the
// operator's nvm copy first in PATH; services run the root-owned /opt/developed-runtimes copy
// their unit files name. This tool never edits unit files: an app moves to a new runtime by
// hand (README "Node runtime"), and deploys refuse while a unit disagrees with the config.
import { existsSync } from 'node:fs';
import { ReleaseError, sudo } from './sh.mjs';

export const DEFAULT_NODE = '22.23.2';
export const NODE_VERSION = /^\d+\.\d+\.\d+$/;
const RUNTIME = /\/opt\/developed-runtimes\/node-v[0-9.]+\/bin\/node/g;

export const nodeVersion = (config) => config.node ?? DEFAULT_NODE;
export const buildNodeBin = (config) => `/home/openclaw/.nvm/versions/node/v${nodeVersion(config)}/bin`;
export const runtimeNode = (config) => `/opt/developed-runtimes/node-v${nodeVersion(config)}/bin/node`;

// The unit a side's switch starts or restarts (a template without instance), if any.
export function switchUnit(side) {
  if (side.switch?.type === 'instance-swap') return side.switch.unit.replace('{release}', '');
  if (side.switch?.type === 'symlink-restart') return side.switch.unit;
  if (side.switch?.type === 'central-accounts') return side.switch.unit;
  return null;
}

// Why `systemctl cat` text of a unit does not run exactly `expected`, or null when it does.
export function runtimeProblem(unitText, expected) {
  const named = [...new Set(unitText.match(RUNTIME) ?? [])];
  if (!named.includes(expected)) return `does not name ${expected}`;
  const others = named.filter((path) => path !== expected);
  return others.length ? `also names ${others.join(', ')}` : null;
}

export function assertRuntime(config, sides) {
  const build = `${buildNodeBin(config)}/node`;
  if (!existsSync(build)) throw new ReleaseError(`${config.app}: build Node ${build} is missing (nvm install ${nodeVersion(config)})`);
  const runtime = runtimeNode(config);
  if (!existsSync(runtime)) throw new ReleaseError(`${config.app}: runtime ${runtime} is missing`);
  for (const name of sides) {
    const unit = switchUnit(config.sides[name]);
    if (!unit) continue;
    const problem = runtimeProblem(sudo('systemctl', ['cat', '--', unit]).out, runtime);
    if (problem) throw new ReleaseError(`${config.app}: ${unit} ${problem}; switch its unit files by hand first or fix "node" (README "Node runtime")`);
  }
}
