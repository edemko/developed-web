import assert from 'node:assert/strict';
import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { INPUT, API_ENV, validateInput, selectInput, parseEnvironment, protectedText, trusted } from './central-mail-worker-input.mjs';
export const RELEASE = '/opt/developed-accounts/releases/c561a81';
// API and worker releases are separate pins. The worker keeps its reviewed mail
// implementation while the browser-family release advances the central API.
export const API_RELEASE = '/opt/developed-accounts/releases/57277411f3b9510bad1e93063649d56f5c184247';
export const NODE = '/opt/developed-runtimes/node-v22.23.2/bin/node';
export const moduleHashes = {
  'mail.js': 'a804bab2046a1a301e62b26455136963e55a6fa900e0e22006da8c4bca815494',
  'db.js': '0a786d9ad05ae2562d7d2e90ed1126595a580613f28504fa232e9d85d41408f3',
  'security.js': '0157b3dd013b36d86c845a30c134d7cf298d0b375997bcf53ef44956bb5fa296',
  'mail-templates.js': '82937b3e9bade97c8978412e7d74536e21cb7e2e2f3e09be64f424a739a8b921',
};
export function checkModules(release = RELEASE) {
  assert.ok(release === RELEASE || release === API_RELEASE, 'Unapproved mail-compatible release');
  trusted(release); trusted(NODE);
  for (const [file, expected] of Object.entries(moduleHashes)) {
    const path = `${release}/dist/${file}`; trusted(path);
    assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), expected, 'Immutable mail module changed');
  }
}
function apiState() {
  const r = spawnSync('/usr/bin/systemctl', ['show', 'developed-accounts.service', '-p', 'MainPID,ActiveState,User,Group'],
    { encoding: 'utf8', timeout: 10000 }); assert.equal(r.status, 0);
  return Object.fromEntries(r.stdout.trim().split('\n').map((line) => line.split('=')));
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
  const state = apiState(), pid = Number(state.MainPID); assert.ok(Number.isSafeInteger(pid) && pid > 0);
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
