import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { MailWorker, credentialMail, securityMail, queueMail } from '../dist/mail.js';
import { HttpError, seal, unseal } from '../dist/security.js';

function fixture({ enabled = true, limitError, response, attempts = 1, payload } = {}) {
  const configuration = {
    mailEnabled: enabled, mailjetKey: 'test-api-key', mailjetSecret: 'test-api-secret',
    supportEmail: 'info@developed.sk', dailyEmailLimit: 200, encryptionKey: randomBytes(32),
  };
  const id = randomUUID();
  const mail = { to: 'recipient@example.invalid', subject: 'Confirm your email', text: 'https://www.developed.sk/verify-email#token=fixture-only' };
  const job = { id, attempts, payload: payload ?? seal(mail, configuration.encryptionKey, `mail:${id}`) };
  const queries = [], limits = [], requests = [];
  const db = {
    async query(sql, args) { queries.push({ sql, args }); return queries.length === 1 ? [job] : []; },
    async limit(...args) { limits.push(args); if (limitError) throw limitError; },
  };
  const request = async (url, init) => {
    requests.push({ url, init });
    if (response instanceof Error) throw response;
    return response ?? Response.json({ Messages: [{ Status: 'success' }] });
  };
  return { configuration, job, mail, queries, limits, requests, db, request,
    worker: new MailWorker(db, configuration, request) };
}

test('mail is disabled by default operation without querying or making network calls', async () => {
  const f = fixture({ enabled: false });
  assert.equal(await f.worker.tick(), false);
  assert.deepEqual(f.queries, []); assert.deepEqual(f.requests, []);
});

test('missing Mailjet credentials fail before leasing a job', async () => {
  const f = fixture(); f.configuration.mailjetKey = '';
  await assert.rejects(f.worker.tick(), /without credentials/);
  assert.deepEqual(f.queries, []); assert.deepEqual(f.requests, []);
});

test('empty outbox does not spend the daily mail budget', async () => {
  const f = fixture(); f.db.query = async () => [];
  assert.equal(await f.worker.tick(), false);
  assert.deepEqual(f.limits, []); assert.deepEqual(f.requests, []);
});

test('Mailjet uses fixed sender/reply address, safe payload and lease-guarded success', async () => {
  const f = fixture();
  assert.equal(await f.worker.tick(), true);
  assert.match(f.queries[0].sql, /for update skip locked/i);
  assert.deepEqual(f.limits, [['aggregate:mail', 200, 86400]]);
  assert.equal(f.requests.length, 1);
  const { url, init } = f.requests[0];
  assert.equal(url, 'https://api.mailjet.com/v3.1/send');
  assert.equal(init.method, 'POST'); assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  const body = JSON.parse(init.body), message = body.Messages[0];
  assert.deepEqual(message.From, { Email: 'noreply@developed.sk', Name: 'DevelopED' });
  assert.equal(message.ReplyTo.Email, 'info@developed.sk');
  assert.deepEqual(message.To, [{ Email: 'recipient@example.invalid' }]);
  assert.equal(message.TextPart, f.mail.text); assert.equal(message.CustomID, f.job.id);
  assert.equal(message.HTMLPart, undefined); assert.equal(message.Attachments, undefined);
  assert.equal(message.Cc, undefined); assert.equal(message.Bcc, undefined);
  assert.ok(!init.body.includes('test-api-secret'));
  const update = f.queries[1];
  assert.match(update.sql, /delivered_at=now\(\),payload=''/);
  assert.match(update.sql, /where id=\$1 and lease_id=\$2/);
  assert.deepEqual(update.args, [f.job.id, f.queries[0].args[0]]);
});

test('daily cap reschedules after UTC reset without consuming delivery retries', async () => {
  const f = fixture({ limitError: new HttpError(429, 'rate_limited'), attempts: 10 });
  assert.equal(await f.worker.tick(), true);
  assert.deepEqual(f.requests, []);
  const update = f.queries[1];
  assert.match(update.sql, /attempts=greatest\(0,attempts-1\)/);
  assert.doesNotMatch(update.sql, /failed_at/);
  assert.match(update.sql, /where id=\$1 and lease_id=\$2/);
  assert.equal(update.args[0], f.job.id);
  assert.ok(Number.isInteger(update.args[2]) && update.args[2] >= 1 && update.args[2] <= 86401);
});

for (const [name, response] of [
  ['HTTP rejection', new Response('Rejected', { status: 503 })],
  ['per-message rejection despite HTTP success', Response.json({ Messages: [{ Status: 'error' }] })],
  ['ambiguous timeout', new Error('timeout')],
]) test(`mail ${name} schedules bounded retries, never marks delivery`, async () => {
  const f = fixture({ response, attempts: 10 });
  assert.equal(await f.worker.tick(), true);
  const update = f.queries[1];
  assert.match(update.sql, /failed_at=case when attempts>=10 then now\(\) else null end/);
  assert.doesNotMatch(update.sql, /delivered_at=now/);
  assert.equal(update.args[2], 3600);
  assert.equal(update.args[1], f.queries[0].args[0]);
});

test('corrupt encrypted mail is never sent as plaintext or leaked to provider', async () => {
  const f = fixture({ payload: 'corrupt' });
  assert.equal(await f.worker.tick(), true);
  assert.deepEqual(f.requests, []);
  assert.match(f.queries[1].sql, /failed_at/);
});

test('queue stores encrypted recipient and credential URL bound to job ID', async () => {
  const f = fixture(), writes = [];
  await queueMail(async (sql, args) => { writes.push({ sql, args }); return []; }, f.configuration, f.mail);
  const [id, encrypted] = writes[0].args;
  assert.ok(!encrypted.includes(f.mail.to)); assert.ok(!encrypted.includes('fixture-only'));
  assert.deepEqual(unseal(encrypted, f.configuration.encryptionKey, `mail:${id}`), f.mail);
  assert.throws(() => unseal(encrypted, f.configuration.encryptionKey, `mail:${randomUUID()}`));
});

test('credential and security messages support all four portal languages', () => {
  const subjects = new Set();
  for (const language of ['en', 'sk', 'cs', 'uk']) {
    const link = 'https://www.developed.sk/verify-email#token=fixture-only';
    const mail = credentialMail('recipient@example.invalid', 'verification', link, language);
    assert.ok(mail.text.includes(link)); assert.ok(mail.text.includes('info@developed.sk'));
    subjects.add(mail.subject);
    assert.ok(securityMail('recipient@example.invalid', language).text.includes('info@developed.sk'));
  }
  assert.equal(subjects.size, 4);
});
