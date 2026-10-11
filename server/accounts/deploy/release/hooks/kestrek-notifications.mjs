// KešTrek's notification worker runs an ExecStartPre ownership guard pinned to the exact
// API unit name and Node runtime (kestrek repo: deploy/notifications-owner-check.mjs). Every
// API switch installs a guard copy pinned to the new unit and the app's Node runtime
// (config.node), and a drop-in pointing the worker at it.
import { showFile } from '../lib/git.mjs';
import { runtimeNode } from '../lib/runtime.mjs';
import { ReleaseError, run, sleep, sudo, sudoRead, sudoTest, sudoWrite } from '../lib/sh.mjs';

const WORKER = 'developed-kestrek-notifications.service';
const DROPIN = `/etc/systemd/system/${WORKER}.d/api-release.conf`;

export function pinGuard(source, guardPath, apiUnit, nodePath) {
  let pinned = source;
  for (const [name, value] of Object.entries({ guardPath, apiUnit, nodePath })) {
    const line = `export const ${name} = '${value}';`;
    pinned = pinned.replace(new RegExp(`^export const ${name} = .*$`, 'm'), line);
    if (!pinned.includes(line)) throw new ReleaseError('notification guard changed shape — cannot pin it');
  }
  return pinned;
}

export const dropinFor = (apiUnit, guardPath, nodePath) => [
  '# Managed by developed-release — pins the worker guard to the live API release.',
  '[Unit]',
  `After=${apiUnit}`,
  '[Service]',
  'ExecStartPre=',
  `ExecStartPre=+${nodePath} ${guardPath}`,
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
    const nodePath = runtimeNode(config);
    const guard = pinGuard(showFile(config.repo, sha, 'deploy/notifications-owner-check.mjs'), guardPath, newUnit, nodePath);
    const previous = sudoTest('-f', DROPIN) ? sudoRead(DROPIN) + '\n' : null;
    onUndo(async () => {
      if (previous === null) sudo('rm', ['-f', DROPIN]);
      else sudoWrite(DROPIN, previous);
      if (!(await restartWorker())) throw new ReleaseError(`${WORKER} not active after restoring its guard`);
    });
    sudoWrite(guardPath, guard);
    sudoWrite(DROPIN, dropinFor(newUnit, guardPath, nodePath));
    if (!(await restartWorker())) throw new ReleaseError(`${WORKER} failed its ownership guard`);
  },
};
