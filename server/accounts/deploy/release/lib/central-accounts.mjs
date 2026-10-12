// Coordinated API + single mail-worker switch for the central identity service.
// The worker implementation stays pinned to its reviewed release. An automatic
// candidate must have byte-identical worker-imported modules and mail logo.
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { HOME } from './build.mjs';
import { runtimeNode } from './runtime.mjs';
import { log, ReleaseError, sleep, sudo, sudoRead, sudoTest, sudoWrite } from './sh.mjs';

const BUNDLES = '/opt/developed-accounts/mail-workers';
const MODULES = ['mail.js', 'db.js', 'security.js', 'mail-templates.js'];
const STATE = `${HOME}/.local/state/developed-release`;
export const centralPendingPath = `${STATE}/developed-accounts.pending.json`;

export function workerBundleFromDropIn(dropIn) {
  const paths = [...dropIn.matchAll(/\/opt\/developed-accounts\/mail-workers\/[a-z0-9-]{7,100}\/central-mail-worker(?:-guard)?\.mjs/g)]
    .map(match => match[0].slice(0, match[0].lastIndexOf('/')));
  if (paths.length !== 2 || paths[0] !== paths[1]) throw new ReleaseError('central worker drop-in has unexpected launcher paths');
  return paths[0];
}

export function pinWorkerGuard(source, previousApi, nextApi) {
  const line = `export const API_RELEASE = '${previousApi}';`;
  if (source.split(line).length !== 2) throw new ReleaseError('central worker API pin changed shape');
  return source.replace(line, `export const API_RELEASE = '${nextApi}';`);
}

export function pinWorkerDropIn(source, previousBundle, nextBundle) {
  if (source.split(previousBundle).length !== 3 || workerBundleFromDropIn(source) !== previousBundle)
    throw new ReleaseError('central worker drop-in changed shape');
  return source.replaceAll(previousBundle, nextBundle);
}

function digest(path) { return sudo('sha256sum', [path]).out.split(/\s+/)[0]; }

function assertCompatible(previousApi, nextApi) {
  for (const file of MODULES) {
    if (digest(`${previousApi}/dist/${file}`) !== digest(`${nextApi}/dist/${file}`))
      throw new ReleaseError(`${file} changed — central mail compatibility needs a manual release`);
  }
  if (digest(`${previousApi}/public/music-logo.png`) !== digest(`${nextApi}/public/music-logo.png`))
    throw new ReleaseError('central mail logo changed — use a manual release');
}

function swapSymlink(link, target) {
  sudo('ln', ['-sfn', target, `${link}.tmp`]);
  sudo('mv', ['-T', `${link}.tmp`, link]);
}

function atomicDropIn(path, content) {
  const temporary = `${path}.developed-release.tmp`;
  if (sudoTest('-e', temporary)) throw new ReleaseError(`stale central worker drop-in temporary file: ${temporary}`);
  try {
    sudoWrite(temporary, content);
    sudo('mv', ['-T', temporary, path]);
  } catch (error) {
    sudo('rm', ['-f', '--', temporary], { allowFail: true });
    throw error;
  }
}

function stageWorkerBundle(previousBundle, previousApi, nextApi, release) {
  const destination = `${BUNDLES}/${release}`;
  const staging = `${BUNDLES}/.staging-${release}`;
  if (sudoTest('-e', destination) || sudoTest('-e', staging)) throw new ReleaseError('central worker bundle already exists; inspect it before retrying');
  const oldGuard = `${previousBundle}/central-mail-worker-guard.mjs`;
  const guard = pinWorkerGuard(`${sudoRead(oldGuard)}\n`, previousApi, nextApi);
  sudo('cp', ['-a', '--', previousBundle, staging]);
  try {
    sudoWrite(`${staging}/central-mail-worker-guard.mjs`, guard, '0444');
    for (const file of ['central-mail-worker.mjs', 'central-mail-worker-input.mjs', 'central-mail-worker-guard.mjs'])
      sudo('chmod', ['0444', `${staging}/${file}`]);
    sudo('chmod', ['0555', staging]);
    sudo('mv', ['-T', staging, destination]);
  } catch (error) {
    sudo('rm', ['-rf', '--', staging], { allowFail: true });
    throw error;
  }
  return destination;
}

function writePending(value) {
  mkdirSync(STATE, { recursive: true });
  const fd = openSync(centralPendingPath, 'wx', 0o600);
  try { writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`); fsyncSync(fd); }
  finally { closeSync(fd); }
}

function clearPending() { rmSync(centralPendingPath); }

// Keep the action order testable without touching a service. The durable receipt
// is written before the first live mutation and remains when rollback fails.
export async function runCentralCutover(steps) {
  await steps.mark();
  let workerStopped = false;
  try {
    await steps.stopWorker(); workerStopped = true;
    await steps.selectApi();
    await steps.restartApi();
    await steps.health();
    await steps.assertWorkerStopped();
    await steps.pinWorker();
    await steps.reloadUnits();
    await steps.startWorker();
    await steps.verifyWorker();
    await steps.clear();
  } catch (error) {
    if (!workerStopped && !await steps.needsRestore()) {
      await steps.clear();
      throw error;
    }
    try { await steps.restore(); await steps.clear(); }
    catch (rollbackError) { throw new ReleaseError(`central switch failed: ${error.message}; rollback also failed: ${rollbackError.message}; reconcile ${centralPendingPath}`); }
    throw error;
  }
}

function active(unit) { return sudo('systemctl', ['is-active', '--quiet', unit], { allowFail: true }).status === 0; }

async function assertWorkerActive(unit, bundle) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const details = sudo('systemctl', ['show', unit, '-p', 'MainPID', '-p', 'ExecStart', '-p', 'ActiveState']).out;
    const pid = Number(details.match(/^MainPID=(\d+)$/m)?.[1] || 0);
    if (active(unit) && pid > 0 && details.includes(`${bundle}/central-mail-worker.mjs`)) return;
    await sleep(500);
  }
  throw new ReleaseError('central mail worker did not stay active on the pinned bundle');
}

export async function centralAccountsSwitch({ config, side, release, live }, checkHealth) {
  const { link, unit, workerUnit, workerDropIn } = side.switch;
  if (existsSync(centralPendingPath)) throw new ReleaseError(`unfinished central switch: ${centralPendingPath}`);
  const previousApi = sudo('readlink', ['-e', link]).out;
  const nextApi = `${config.releaseRoot}/${release}`;
  if (previousApi !== live.path || !active(unit) || !active(workerUnit))
    throw new ReleaseError('central API or worker changed since the live-state probe');
  const previousDropIn = `${sudoRead(workerDropIn)}\n`;
  const previousBundle = workerBundleFromDropIn(previousDropIn);
  if (!sudoTest('-f', `${previousBundle}/central-mail-worker-guard.mjs`)) throw new ReleaseError('central worker guard is missing');
  assertCompatible(previousApi, nextApi);
  const nextBundle = `${BUNDLES}/${release}`;
  const nextDropIn = pinWorkerDropIn(previousDropIn, previousBundle, nextBundle);
  const node = runtimeNode(config);
  if (!previousDropIn.includes(node) || !nextDropIn.includes(node)) throw new ReleaseError('central worker runtime pin differs from the release runtime');
  stageWorkerBundle(previousBundle, previousApi, nextApi, release);

  const restore = async () => {
    sudo('systemctl', ['stop', workerUnit]);
    swapSymlink(link, previousApi);
    sudo('systemctl', ['restart', unit]);
    await checkHealth(side);
    if (`${sudoRead(workerDropIn)}\n` !== previousDropIn) atomicDropIn(workerDropIn, previousDropIn);
    sudo('systemctl', ['daemon-reload']);
    sudo('systemctl', ['start', workerUnit]);
    await assertWorkerActive(workerUnit, previousBundle);
  };

  try {
    await runCentralCutover({
    mark: () => {
      if (sudo('readlink', ['-e', link]).out !== previousApi || !active(unit) || !active(workerUnit)
        || `${sudoRead(workerDropIn)}\n` !== previousDropIn)
        throw new ReleaseError('central API or worker changed while preparing the switch');
      writePending({ previousApi, nextApi, previousBundle, nextBundle, previousDropIn,
        createdAt: new Date().toISOString() });
    },
    stopWorker: () => {
      log('developed-accounts: draining the sole mail worker');
      sudo('systemctl', ['stop', workerUnit]);
      if (active(workerUnit)) throw new ReleaseError('central mail worker stayed active after stop');
    },
    selectApi: () => swapSymlink(link, nextApi),
    restartApi: () => sudo('systemctl', ['restart', unit]),
    health: () => checkHealth(side),
    assertWorkerStopped: () => {
      if (active(workerUnit)) throw new ReleaseError('central mail worker restarted before its pin changed');
    },
    pinWorker: () => atomicDropIn(workerDropIn, nextDropIn),
    reloadUnits: () => sudo('systemctl', ['daemon-reload']),
    startWorker: () => sudo('systemctl', ['start', workerUnit]),
    verifyWorker: () => assertWorkerActive(workerUnit, nextBundle),
    needsRestore: () => !active(workerUnit) || sudo('readlink', ['-e', link]).out !== previousApi,
    restore,
    clear: clearPending,
    });
  } catch (error) {
    // A completed rollback (or failure before the receipt) leaves this new
    // bundle unused. Keep it only when the pending receipt needs reconciliation.
    if (!existsSync(centralPendingPath)) sudo('rm', ['-rf', '--', nextBundle]);
    throw error;
  }
  return async () => {
    writePending({ previousApi: nextApi, nextApi: previousApi, previousBundle: nextBundle,
      nextBundle: previousBundle, previousDropIn: nextDropIn, createdAt: new Date().toISOString() });
    await restore();
    clearPending();
  };
}
