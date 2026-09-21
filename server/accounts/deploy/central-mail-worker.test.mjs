import test from 'node:test';
import { createServer, request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtempSync, lstatSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectInput, parseEnvironment, validateInput, writeProtectedInput, keys } from './central-mail-worker-input.mjs';
import { assertCentralEvidence, assertWorkerProcesses, RELEASE, API_RELEASE, NODE, checkModules, waitForCentralReadiness, apiHealth } from './central-mail-worker-guard.mjs';
import { mailConfig, assertRole, ROLE_SQL, startLoop } from './central-mail-worker.mjs';
const fixtureEnv = () => ({
  ACCOUNTS_DATABASE_URL: 'postgresql://developed_accounts:fixture-password@172.18.0.12:5432/postgres',
  ACCOUNTS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), MAILJET_API_KEY: 'fixture-api-key',
  MAILJET_SECRET_KEY: 'fixture-api-secret', ACCOUNTS_ORIGIN: 'https://www.developed.sk', ACCOUNTS_DAILY_EMAIL_LIMIT: '200',
  ACCOUNTS_MAIL_ENABLED: 'false', ACCOUNTS_PROVIDER_ADMIN_KEY: 'fixture-provider-key-never-copy',
  ACCOUNTS_PROVIDER_URL: 'http://127.0.0.1:3141', ACCOUNTS_HOURLY_REGISTRATION_LIMIT: '20',
});
test('protected input assembler copies exactly six existing values, rejects drift, and refuses overwrite', () => {
  const env = fixtureEnv(), input = selectInput(parseEnvironment(Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')));
  assert.deepEqual(Object.keys(input).sort(), keys); assert.ok(!JSON.stringify(input).includes(env.ACCOUNTS_PROVIDER_ADMIN_KEY));
  for (const change of [(v) => { v.providerKey = 'forbidden'; }, (v) => { v.origin = 'https://untrusted.invalid'; },
    (v) => { v.databaseUrl = v.databaseUrl.replace('developed_accounts:', 'postgres:'); },
    (v) => { v.databaseUrl += '?options=-crole=postgres'; }, (v) => { v.dailyEmailLimit = 201; },
    (v) => { v.encryptionKey = 'short'; }]) { const bad = structuredClone(input); change(bad); assert.throws(() => validateInput(bad)); }
  assert.throws(() => selectInput({ ...env, ACCOUNTS_MAIL_ENABLED: 'true' }));
  assert.throws(() => parseEnvironment('A=one\nA=two'));
  const directory = mkdtempSync(join(tmpdir(), 'central-mail-input-fixture-'));
  try {
    const path = join(directory, 'mail.json'); writeProtectedInput(path, input);
    assert.equal(lstatSync(path).mode & 0o777, 0o600); assert.equal(lstatSync(path).nlink, 1);
    assert.deepEqual(JSON.parse(readFileSync(path)), input);
    assert.throws(() => writeProtectedInput(path, input), { code: 'EEXIST' });
  } finally { rmSync(directory, { recursive: true }); }
});
test('root guard requires active same-UID/GID API actual-mail-false and one process only', () => {
  const env = fixtureEnv(), input = selectInput(env);
  const state = { ActiveState: 'active', MainPID: '123', User: 'developed-accounts', Group: 'developed-accounts' };
  const status = 'Uid:\t988\t988\t988\t988\nGid:\t982\t982\t982\t982\n';
  assertCentralEvidence(state, status, env, input);
  assert.throws(() => assertCentralEvidence(state, status, { ...env, ACCOUNTS_MAIL_ENABLED: 'true' }, input));
  assert.throws(() => assertCentralEvidence(state, status.replaceAll('988', '1000'), env, input));
  assert.throws(() => assertCentralEvidence({ ...state, ActiveState: 'inactive' }, status, env, input));
  const api = ['/node', `${RELEASE}/dist/main.js`]; assertWorkerProcesses([api, ['/node', '/guard.mjs']]);
  assert.throws(() => assertWorkerProcesses([api, ['/node', '/opt/worker/central-mail-worker.mjs']]));
  assert.throws(() => assertWorkerProcesses([api, api])); assert.throws(() => assertWorkerProcesses([]));
  assert.notEqual(RELEASE, API_RELEASE);
  assertWorkerProcesses([['/node', `${API_RELEASE}/dist/main.js`]]);
  assert.throws(() => assertWorkerProcesses([api, ['/node', `${API_RELEASE}/dist/main.js`]]));
  assert.throws(() => checkModules('/opt/developed-accounts/releases/unreviewed'));
});
function readinessFixture() {
  let clock = 0;
  const calls = { state: 0, process: 0, health: 0, sleeps: [] };
  const evidence = { exe: NODE, cwd: API_RELEASE, argumentCount: 2, main: `${API_RELEASE}/dist/main.js` };
  const input = { now: () => clock, sleep: async delay => { calls.sleeps.push(delay); clock += delay; },
    state: timeout => { assert.ok(timeout > 0 && timeout <= 250); calls.state++; return { MainPID: '123', ActiveState: 'active' }; },
    processEvidence: pid => { assert.equal(pid, 123); calls.process++; return evidence; },
    health: async timeout => { assert.ok(timeout > 0 && timeout <= 400); calls.health++; return true; } };
  return { input, calls, evidence, clock: () => clock, advance: ms => { clock += ms; } };
}
test('readiness tolerates bounded Type=simple metadata/HTTP startup before requiring the full existing guard', async () => {
  const f = readinessFixture();
  f.input.state = () => ++f.calls.state === 1 ? { MainPID: '0', ActiveState: 'activating' } : { MainPID: '123', ActiveState: 'active' };
  f.input.processEvidence = () => { if (++f.calls.process === 1) throw new Error('fixture not exec-ready'); return f.evidence; };
  f.input.health = async () => { if (++f.calls.health === 1) throw new Error('fixture connection refused'); return true; };
  assert.equal(await waitForCentralReadiness(f.input), 123);
  assert.equal(f.calls.health, 2); assert.equal(f.clock(), 300);
  // This readiness result grants nothing itself: UID/GID, actual mail=false,
  // input parity, immutable hashes and duplicate-worker checks still run later.
});
test('readiness deadline fails closed for unavailable health or wrong executable/cwd/args, never exceeding five seconds', async () => {
  for (const mutation of [f => { f.input.health = async () => false; },
    f => { f.evidence.exe = '/untrusted/node'; }, f => { f.evidence.cwd = RELEASE; },
    f => { f.evidence.argumentCount = 3; }, f => { f.evidence.main = `${RELEASE}/dist/main.js`; }]) {
    const f = readinessFixture(); mutation(f);
    await assert.rejects(waitForCentralReadiness(f.input), /readiness deadline exceeded/);
    assert.equal(f.clock(), 5000); assert.ok(f.calls.state <= 50);
    if (f.evidence.exe !== NODE || f.evidence.cwd !== API_RELEASE || f.evidence.argumentCount !== 2 || f.evidence.main !== `${API_RELEASE}/dist/main.js`) assert.equal(f.calls.health, 0);
  }
  await assert.rejects(waitForCentralReadiness({ ...readinessFixture().input, timeoutMs: 5001 }));
});
test('readiness refuses PID replacement and health success arriving after its deadline', async () => {
  const f = readinessFixture();
  f.input.state = () => ({ MainPID: ++f.calls.state === 1 ? '123' : '124', ActiveState: 'active' });
  f.input.health = async () => false;
  await assert.rejects(waitForCentralReadiness(f.input), /API changed during startup readiness/);
  assert.equal(f.clock(), 100);
  const late = readinessFixture(); late.input.health = async () => { late.advance(5000); return true; };
  await assert.rejects(waitForCentralReadiness(late.input), /readiness deadline exceeded/);
  assert.equal(late.clock(), 5000);
});
test('startup role gate is read-only and rejects role switching, privilege and membership', () => {
  assert.ok(!/\b(insert|update|delete|alter|grant|revoke)\b/i.test(ROLE_SQL));
  const role = { name: 'developed_accounts', session_name: 'developed_accounts', rolsuper: false,
    rolbypassrls: false, rolcreaterole: false, rolcreatedb: false, rolreplication: false, has_membership: false };
  assertRole([role]);
  for (const key of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication', 'has_membership'])
    assert.throws(() => assertRole([{ ...role, [key]: true }]));
  assert.throws(() => assertRole([{ ...role, session_name: 'postgres' }])); assert.throws(() => assertRole([]));
});
function fakeTimers() {
  let id = 0; const pending = new Map();
  return { pending, setTimer: (fn, delay) => { pending.set(++id, { fn, delay }); return id; },
    clearTimer: (key) => pending.delete(key), run(delay) {
      const entry = [...pending].find(([, value]) => value.delay === delay); assert.ok(entry);
      pending.delete(entry[0]); entry[1].fn();
    } };
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test('sequential5s ticks never overlap; SIGTERM waits for in-flight lease before closing pool', async () => {
  const timers = fakeTimers(); let finish, calls = 0, closed = 0;
  const runner = startLoop({ ...timers, tick: () => { calls++; return new Promise((resolve) => { finish = resolve; }); }, close: () => { closed++; } });
  timers.run(5000); await settle(); assert.equal(calls, 1); assert.equal(timers.pending.size, 0);
  const done = runner.stop(); assert.equal(closed, 0); assert.equal(runner.stop(), done);
  finish(); await done; assert.equal(closed, 1); assert.equal(calls, 1); assert.equal(timers.pending.size, 0);
});
test('bounded shutdown never closes the pool underneath an unresolved tick', async () => {
  const timers = fakeTimers(); let closed = 0, fatal = 0; const messages = [];
  const runner = startLoop({ ...timers, tick: () => new Promise(() => {}), close: () => { closed++; },
    fatal: () => { fatal++; }, report: (message) => messages.push(message) });
  timers.run(5000); await settle(); const stopped = runner.stop(); timers.run(90000); await stopped;
  assert.equal(closed, 0); assert.equal(fatal, 1); assert.deepEqual(messages, ['mail-worker: bounded shutdown incomplete']);
});
test('existing pinned MailWorker uses preserved lease/template/cap with mocked DB and Mailjet only', async () => {
  checkModules();
  const { MailWorker } = await import(`${RELEASE}/dist/mail.js`), { seal } = await import(`${RELEASE}/dist/security.js`);
  const config = mailConfig(selectInput(fixtureEnv())); assert.equal(config.providerKey, undefined); assert.equal(config.mailEnabled, true);
  const id = '00000000-0000-4000-8000-000000000001';
  const mail = { to: 'recipient@example.invalid', subject: 'Fixture', text: 'Fixture text' };
  const queries = [], sends = [], limits = [];
  const db = { query: async (sql, args) => { queries.push({ sql, args }); return queries.length === 1
    ? [{ id, attempts: 1, payload: seal(mail, config.encryptionKey, `mail:${id}`) }] : []; }, limit: async (...args) => limits.push(args) };
  await new MailWorker(db, config, async (url, request) => { sends.push({ url, request });
    return Response.json({ Messages: [{ Status: 'success' }] }); }).tick();
  assert.equal(sends.length, 1); assert.equal(sends[0].url, 'https://api.mailjet.com/v3.1/send');
  assert.match(queries[0].sql, /for update skip locked/); assert.match(queries[1].sql, /lease_id=\$2/);
  assert.deepEqual(limits, [['aggregate:mail', 200, 86400]]);
  const message = JSON.parse(sends[0].request.body).Messages[0]; assert.equal(message.TrackOpens, 'disabled');
  assert.equal(message.ReplyTo.Email, 'info@developed.sk'); assert.match(message.HTMLPart, /<!doctype html>/);
});
test('unit syntax validates in a disposable fixture without installing or starting any service', () => {
  const unit = readFileSync(new URL('./developed-accounts-mail-worker.service', import.meta.url), 'utf8');
  assert.ok(!unit.includes('EnvironmentFile=')); assert.match(unit, /LoadCredential=mail.json:/);
  assert.match(unit, /ExecStartPre=\+/); assert.match(unit, /Restart=no/); assert.match(unit, /TimeoutStopSec=100s/);
  const directory = mkdtempSync(join(tmpdir(), 'central-mail-unit-fixture-'));
  try {
    const fixture = unit.replace(/^ExecStartPre=.*$/m, 'ExecStartPre=/usr/bin/true')
      .replace(/^ExecStart=.*$/m, 'ExecStart=/usr/bin/true');
    const path = join(directory, 'developed-accounts-mail-worker.service'); writeFileSync(path, fixture);
    const result = spawnSync('/usr/bin/systemd-analyze', ['verify', path], { encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, 'Disposable unit syntax verification failed; diagnostics withheld');
  } finally { rmSync(directory, { recursive: true }); }
});


test('readiness preserves canonical Host over an actual loopback HTTP connection',async t=>{
  const server=createServer((req,res)=>{assert.equal(req.url,'/health');res.writeHead(req.headers.host==='www.developed.sk'?200:421);res.end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const request=(options,callback)=>httpRequest({...options,port:server.address().port},callback);
  assert.equal(await apiHealth(1000,request),true);
});
