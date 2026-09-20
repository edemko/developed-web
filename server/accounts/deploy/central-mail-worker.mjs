// Non-listening worker: import only the immutable Database and MailWorker modules.
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { validateInput } from './central-mail-worker-input.mjs';
import { RELEASE, checkModules } from './central-mail-worker-guard.mjs';
export const ROLE_SQL = `select current_user as name,session_user as session_name,
  rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolreplication,
  exists(select 1 from pg_auth_members where member=(select oid from pg_roles where rolname=current_user)) as has_membership
  from pg_roles where rolname=current_user`;
export function assertRole(rows) {
  assert.equal(rows.length, 1); const role = rows[0];
  assert.equal(role.name, 'developed_accounts'); assert.equal(role.session_name, 'developed_accounts');
  for (const key of ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication', 'has_membership']) assert.equal(role[key], false);
}
export function mailConfig(input) {
  validateInput(input);
  return { origin: input.origin, encryptionKey: Buffer.from(input.encryptionKey, 'base64'), mailjetKey: input.mailjetKey,
    mailjetSecret: input.mailjetSecret, dailyEmailLimit: input.dailyEmailLimit, mailEnabled: true, supportEmail: 'info@developed.sk' };
}
export function startLoop({ tick, close, setTimer = setTimeout, clearTimer = clearTimeout,
  report = () => {}, fatal = () => {}, intervalMs = 5000, shutdownMs = 90000 }) {
  let stopped = false, timer, inFlight = Promise.resolve(), shutdown;
  function schedule() { if (!stopped) timer = setTimer(run, intervalMs); }
  function run() {
    if (stopped) return;
    inFlight = Promise.resolve().then(tick).catch(() => report('mail-worker: tick unavailable'));
    void inFlight.then(schedule);
  }
  schedule();
  return { stop() {
    if (shutdown) return shutdown;
    stopped = true; clearTimer(timer);
    shutdown = (async () => {
      let deadline;
      try {
        const timeout = new Promise((_, reject) => { deadline = setTimer(() => reject(new Error('Shutdown deadline')), shutdownMs); });
        await Promise.race([inFlight, timeout]); clearTimer(deadline);
        await Promise.race([Promise.resolve().then(close), new Promise((_, reject) => {
          deadline = setTimer(() => reject(new Error('Pool close deadline')), 5000);
        })]);
      } catch { report('mail-worker: bounded shutdown incomplete'); fatal(); }
      finally { clearTimer(deadline); }
    })();
    return shutdown;
  } };
}
async function main() {
  assert.equal(process.argv.length, 2); assert.equal(process.getuid(), 988); assert.equal(process.getgid(), 982); checkModules();
  assert.ok(process.getgroups().every((gid) => gid === 982), 'Unexpected supplemental group');
  assert.ok(!Object.keys(process.env).some((name) => /^(ACCOUNTS_|MAILJET_|SUPABASE_)/.test(name)), 'Unexpected application environment');
  const directory = process.env.CREDENTIALS_DIRECTORY;
  assert.equal(directory, '/run/credentials/developed-accounts-mail-worker.service');
  const path = `${directory}/mail.json`, stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o022));
  const input = validateInput(JSON.parse(readFileSync(path, 'utf8')));
  const { Database } = await import(`${RELEASE}/dist/db.js`), { MailWorker } = await import(`${RELEASE}/dist/mail.js`);
  const db = new Database(input.databaseUrl);
  try { assertRole(await db.query(ROLE_SQL)); }
  catch { await db.pool.end(); throw new Error('Scoped mail role required'); }
  const worker = new MailWorker(db, mailConfig(input));
  const runner = startLoop({ tick: () => worker.tick(), close: () => db.pool.end(),
    report: (message) => process.stderr.write(`${message}\n`), fatal: () => process.exit(1) });
  process.once('SIGTERM', () => { void runner.stop(); }); process.once('SIGINT', () => { void runner.stop(); });
  console.log('Central mail worker ready; no HTTP listener or housekeeping.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => {
  console.error('Central mail worker startup failed; diagnostics withheld.'); process.exitCode = 1;
});
