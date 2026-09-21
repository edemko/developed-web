import assert from 'node:assert/strict';
import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { INPUT, API_ENV, validateInput, selectInput, parseEnvironment, protectedText, trusted } from './central-mail-worker-input.mjs';
export const RELEASE = '/opt/developed-accounts/releases/c00df88';
// Both pins use the reviewed branded-music implementation; the separate worker
// retains its restricted inputs and remains the only mail sender.
export const API_RELEASE = '/opt/developed-accounts/releases/c00df8808ab6c1b25ad7409681eca943e23d9a45';
export const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
export const moduleHashes = {
  'mail.js': '0b731e52a225673135cabf0696ef78fa3b399b9d5d79c18c97696a958f8a5a8f',
  'db.js': '0a786d9ad05ae2562d7d2e90ed1126595a580613f28504fa232e9d85d41408f3',
  'security.js': 'ab5a02646d6785d453af5b8924f47476d3964f8cf84151941dfe46655f2f73fc',
  'mail-templates.js': '7ffdc9b61ec8ae3810aaeae58ea640757725b75b5273c82b8fbea89d9e976567',
};
export const musicLogoSha256 = '1a8bf49fa5273b64f503768fd7c9dbfabb75442ae81acc8bdd2203df5f23676f';
export function checkModules(release = RELEASE) {
  assert.ok(release === RELEASE || release === API_RELEASE, 'Unapproved mail-compatible release');
  trusted(release); trusted(NODE);
  const logo = `${release}/public/music-logo.png`; trusted(logo);
  assert.equal(createHash('sha256').update(readFileSync(logo)).digest('hex'), musicLogoSha256, 'Immutable music mail logo changed');
  for (const [file, expected] of Object.entries(moduleHashes)) {
    const path = `${release}/dist/${file}`; trusted(path);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, 'Immutable mail module changed');
  }
}
function apiState(timeout = 10000) {
  const r = spawnSync('/usr/bin/systemctl', ['show', 'developed-accounts.service', '-p', 'MainPID,ActiveState,User,Group'],
    { encoding: 'utf8', timeout }); assert.equal(r.status, 0);
  return Object.fromEntries(r.stdout.trim().split('\n').map((line) => line.split('=')));
}
function apiProcess(pid) {
  const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  return { exe: readlinkSync(`/proc/${pid}/exe`), cwd: readlinkSync(`/proc/${pid}/cwd`),
    argumentCount: args.length, main: args.length === 2 ? realpathSync(args[1]) : null };
}
async function apiHealth(timeout) {
  const response = await fetch('http://127.0.0.1:3140/health', {
    method: 'GET', headers: { Host: 'www.developed.sk' }, redirect: 'error', signal: AbortSignal.timeout(timeout),
  });
  void response.body?.cancel().catch(() => {});
  return response.status === 200;
}
export async function waitForCentralReadiness({ state = apiState, processEvidence = apiProcess,
  health = apiHealth, now = () => performance.now(), sleep = pause, timeoutMs = 5000 } = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 5000);
  const deadline = now() + timeoutMs;
  let pinnedPid;
  while (now() < deadline) {
    let current;
    try { current = state(Math.max(1, Math.min(250, Math.floor(deadline - now())))); }
    catch { /* systemd may still be publishing its new Type=simple process. */ }
    const pid = Number(current?.MainPID);
    if (Number.isSafeInteger(pid) && pid > 0) {
      if (pinnedPid === undefined) pinnedPid = pid;
      assert.equal(pid, pinnedPid, 'API changed during startup readiness');
      if (current.ActiveState === 'active') {
        let processReady = false;
        try {
          const evidence = processEvidence(pid);
          processReady = evidence.exe === NODE && evidence.cwd === API_RELEASE
            && evidence.argumentCount === 2 && evidence.main === `${API_RELEASE}/dist/main.js`;
        } catch { /* /proc may not yet contain the final exec/cwd metadata. */ }
        if (processReady && now() < deadline) {
          let healthy = false;
          try { healthy = await health(Math.max(1, Math.min(400, Math.floor(deadline - now())))); }
          catch { /* Bounded loopback readiness only; never retry a service action. */ }
          if (healthy && now() < deadline) return pinnedPid;
        }
      }
    }
    if (now() < deadline) await sleep(Math.min(100, deadline - now()));
  }
  throw new Error('Central API readiness deadline exceeded');
}
export function assertCentralEvidence(state, status, actualEnv, input) {
  assert.equal(state.ActiveState, 'active'); assert.ok(Number(state.MainPID) > 0);
  assert.equal(state.User, 'developed-accounts'); assert.equal(state.Group, 'developed-accounts');
  assert.match(status, /^Uid:\s+988\s+988\s+988\s+988$/m); assert.match(status, /^Gid:\s+982\s+982\s+982\s+982$/m);
  assert.deepEqual(selectInput(actualEnv), validateInput(input), 'API actual mail inputs differ');
}
export function assertWorkerProcesses(commands) {
  let centralCount = 0;
  for (const command of commands) {
    assert.ok(!command.some((arg) => arg.endsWith('/central-mail-worker.mjs')), 'Another standalone mail worker exists');
    if (command.some((arg) => /^\/opt\/developed-accounts\/releases\/[a-f0-9]{7,40}\/dist\/main\.js$/.test(arg)
      || arg === '/opt/developed-accounts/current/dist/main.js')) centralCount++;
  }
  assert.equal(centralCount, 1, 'Unexpected duplicate central API');
}
export async function checkCentral(input) {
  assert.equal(process.getuid(), 0); trusted(new URL(import.meta.url).pathname); checkModules();
  assert.deepEqual(selectInput(parseEnvironment(protectedText(API_ENV))), validateInput(input));
  const readyPid = await waitForCentralReadiness();
  const state = apiState(), pid = Number(state.MainPID); assert.ok(Number.isSafeInteger(pid) && pid > 0);
  assert.equal(pid, readyPid, 'API changed after startup readiness');
  const actual = parseEnvironment(readFileSync(`/proc/${pid}/environ`, 'utf8'), '\0');
  assertCentralEvidence(state, readFileSync(`/proc/${pid}/status`, 'utf8'), actual, input);
  assert.equal(readlinkSync(`/proc/${pid}/exe`), NODE);
  const args = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
  trusted(`${API_RELEASE}/dist/main.js`); checkModules(API_RELEASE);
  assert.equal(args.length, 2); assert.equal(realpathSync(args[1]), `${API_RELEASE}/dist/main.js`);
  assert.equal(readlinkSync(`/proc/${pid}/cwd`), API_RELEASE);
  const commands = [];
  for (const name of readdirSync('/proc').filter((name) => /^\d+$/.test(name))) {
    let command;
    try { command = readFileSync(`/proc/${name}/cmdline`, 'utf8').split('\0').filter(Boolean); }
    catch (e) { if (['ENOENT', 'ESRCH'].includes(e.code)) continue; throw e; }
    commands.push(command);
  }
  assertWorkerProcesses(commands); assert.equal(apiState().MainPID, state.MainPID);
}
async function main() { assert.equal(process.argv.length, 2); await checkCentral(validateInput(JSON.parse(protectedText(INPUT))));
  console.log('Central API mail disabled; same scoped inputs and no other mail worker verified.'); }
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Mail-worker startup guard refused; diagnostics withheld.'); process.exitCode = 1;
});
