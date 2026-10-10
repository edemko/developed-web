// KešTrek's notification worker runs an ExecStartPre ownership guard pinned to the exact
// API unit name (kestrek repo: deploy/notifications-owner-check.mjs). Every API switch
// installs a guard copy pinned to the new unit and a drop-in pointing the worker at it.
import { showFile } from '../lib/git.mjs';
import { ReleaseError, run, sleep, sudo, sudoRead, sudoTest, sudoWrite } from '../lib/sh.mjs';

const WORKER = 'developed-kestrek-notifications.service';
const DROPIN = `/etc/systemd/system/${WORKER}.d/api-release.conf`;
const RUNTIME_NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';

export function pinGuard(source, guardPath, apiUnit) {
  const pinned = source
    .replace(/^export const guardPath = .*$/m, `export const guardPath = '${guardPath}';`)
    .replace(/^export const apiUnit = .*$/m, `export const apiUnit = '${apiUnit}';`);
  if (!pinned.includes(`export const guardPath = '${guardPath}';`) || !pinned.includes(`export const apiUnit = '${apiUnit}';`)) {
    throw new ReleaseError('notification guard changed shape — cannot pin it');
  }
  return pinned;
}

export const dropinFor = (apiUnit, guardPath) => [
  '# Managed by developed-release — pins the worker guard to the live API release.',
  '[Unit]',
  `After=${apiUnit}`,
  '[Service]',
  'ExecStartPre=',
  `ExecStartPre=+${RUNTIME_NODE} ${guardPath}`,
  '',
].join('\n');

async function restartWorker() {
  sudo('systemctl', ['daemon-reload']);
  sudo('systemctl', ['restart', WORKER], { allowFail: true });
  await sleep(3000);
  return run('systemctl', ['is-active', '--quiet', WORKER], { allowFail: true }).status === 0;
}

export const kestrekNotifications = {
  async after({ config, sha, release, newUnit }, onUndo) {
    const guardPath = `/opt/developed-control/kestrek-notifications-${release}/notifications-owner-check.mjs`;
    const guard = pinGuard(showFile(config.repo, sha, 'deploy/notifications-owner-check.mjs'), guardPath, newUnit);
    const previous = sudoTest('-f', DROPIN) ? sudoRead(DROPIN) + '\n' : null;
    onUndo(async () => {
      if (previous === null) sudo('rm', ['-f', DROPIN]);
      else sudoWrite(DROPIN, previous);
      if (!(await restartWorker())) throw new ReleaseError(`${WORKER} not active after restoring its guard`);
    });
    sudoWrite(guardPath, guard);
    sudoWrite(DROPIN, dropinFor(newUnit, guardPath));
    if (!(await restartWorker())) throw new ReleaseError(`${WORKER} failed its ownership guard`);
  },
};
