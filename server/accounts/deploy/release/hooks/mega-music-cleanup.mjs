// Mega Music's hourly session-cleanup job runs a root ExecStartPre owner guard pinned to the
// exact API unit, and a cleanup module pinned to its own path (mega-media-player repo:
// server/accounts/deploy/session-cleanup{-owner-check,}.mjs). Every API switch installs both
// into a new control directory, points the job at them with a drop-in, and runs the job once:
// it only succeeds when the guard accepts the new API as the sole owner. The guard and the
// drop-in are pinned to the app's Node runtime (config.node), which the guard also requires
// of the API process.
import { showFile } from '../lib/git.mjs';
import { runtimeNode } from '../lib/runtime.mjs';
import { ReleaseError, sudo, sudoRead, sudoTest, sudoWrite } from '../lib/sh.mjs';

const JOB = 'mega-music-session-cleanup.service';
const DROPIN = `/etc/systemd/system/${JOB}.d/api-release.conf`;
const SOURCE = 'server/accounts/deploy';

function pinLine(source, name, value) {
  const pinned = source.replace(new RegExp(`^export const ${name} = .*$`, 'm'), `export const ${name} = '${value}';`);
  if (!pinned.includes(`export const ${name} = '${value}';`)) {
    throw new ReleaseError(`session cleanup ${name} changed shape — cannot pin it`);
  }
  return pinned;
}

export function pinCleanup({ guardSource, moduleSource, dir, apiUnit, nodePath }) {
  const guardPath = `${dir}/session-cleanup-owner-check.mjs`;
  const modulePath = `${dir}/session-cleanup.mjs`;
  const guard = pinLine(pinLine(pinLine(guardSource, 'guardPath', guardPath), 'apiUnit', apiUnit), 'nodePath', nodePath);
  const module = pinLine(moduleSource, 'modulePath', modulePath);
  return { guardPath, guard, modulePath, module };
}

export const cleanupDropin = (apiUnit, guardPath, modulePath, nodePath) => [
  '# Managed by developed-release — pins the cleanup guard and module to the live API release.',
  '[Unit]',
  `After=${apiUnit}`,
  '[Service]',
  'ExecStartPre=',
  `ExecStartPre=+${nodePath} ${guardPath}`,
  'ExecStart=',
  `ExecStart=${nodePath} ${modulePath}`,
  '',
].join('\n');

function runJob() {
  sudo('systemctl', ['daemon-reload']);
  return sudo('systemctl', ['start', JOB], { allowFail: true }).status === 0;
}

export const megaMusicCleanup = {
  async after({ config, sha, release, newUnit }, onUndo) {
    const dir = `/opt/developed-control/mega-music-session-cleanup-${release}`;
    const nodePath = runtimeNode(config);
    const pinned = pinCleanup({
      guardSource: showFile(config.repo, sha, `${SOURCE}/session-cleanup-owner-check.mjs`),
      moduleSource: showFile(config.repo, sha, `${SOURCE}/session-cleanup.mjs`),
      dir,
      apiUnit: newUnit,
      nodePath,
    });
    const previous = sudoTest('-f', DROPIN) ? sudoRead(DROPIN) + '\n' : null;
    onUndo(async () => {
      if (previous === null) sudo('rm', ['-f', DROPIN]);
      else sudoWrite(DROPIN, previous);
      sudo('systemctl', ['daemon-reload']);
    });
    sudoWrite(pinned.guardPath, pinned.guard);
    sudoWrite(pinned.modulePath, pinned.module);
    sudoWrite(DROPIN, cleanupDropin(newUnit, pinned.guardPath, pinned.modulePath, nodePath));
    if (!runJob()) throw new ReleaseError(`${JOB} failed with the guard pinned to ${newUnit}`);
  },
};
