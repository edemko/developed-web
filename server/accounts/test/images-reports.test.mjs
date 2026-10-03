import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { randomBytes, randomUUID } from 'node:crypto';
import { prepareImage, reportSourceUrl } from '../dist/images.js';
import { Accounts } from '../dist/accounts.js';
import { unseal } from '../dist/security.js';
import { MailWorker } from '../dist/mail.js';

const fixtureImage = async () => 'data:image/png;base64,' + (await sharp({ create: { width: 800, height: 400, channels: 3, background: '#f04' } }).png().toBuffer()).toString('base64');
test('avatar is square, compressed and stripped; screenshot preserves aspect ratio', async () => {
  const input = await fixtureImage();
  const avatar = await prepareImage(input, true), screenshot = await prepareImage(input);
  const a = await sharp(avatar).metadata(), s = await sharp(screenshot).metadata();
  assert.equal(a.width, 256); assert.equal(a.height, 256); assert.equal(a.format, 'jpeg');
  assert.ok(avatar.length <= 131072); assert.equal(a.exif, undefined);
  assert.equal(s.width, 800); assert.equal(s.height, 400);
});
test('image input rejects scripts, fake files, corrupt data and excessive dimensions', async () => {
  for (const data of ['data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,Ym9ndXM=', 'https://example.test/a.jpg']) await assert.rejects(prepareImage(data));
  const huge = await sharp({ create: { width: 6000, height: 5000, channels: 3, background: '#fff' } }).png().toBuffer();
  await assert.rejects(prepareImage('data:image/png;base64,' + huge.toString('base64')));
});
test('source URL keeps page path, strips credentials in query/fragment, rejects unsafe schemes', () => {
  assert.equal(reportSourceUrl('https://app.test/page?code=secret#token=secret'), 'https://app.test/page');
  assert.equal(reportSourceUrl(undefined), null);
  for (const value of ['javascript:alert(1)', 'https://user:password@app.test/', '/page']) assert.throws(() => reportSourceUrl(value));
});
test('report, encrypted screenshot and mail are atomic; retry queues no duplicate mail', async () => {
  const encryptionKey = randomBytes(32), mails = []; let saved;
  const config = { encryptionKey, supportEmail: 'info@developed.sk', origin: 'https://www.developed.sk' };
  const q = async (sql, args) => {
    if (sql.startsWith('insert into accounts.reports')) { if (saved) return []; saved = args; return [{ ticket: 42 }]; }
    if (sql.startsWith('select ticket')) return [{ ticket: 42, payload_hash: saved[3] }];
    if (sql.startsWith('insert into accounts.outbox')) { mails.push({ id: args[0], payload: args[1] }); return []; }
    throw new Error('unexpected query');
  };
  const accounts = new Accounts({ tx: fn => fn(q) }, {}, config);
  const body = { appSlug: 'developed', description: '<b>Something broke</b>', sourceUrl: 'https://www.developed.sk/apps?token=secret', screenshot: await fixtureImage(), idempotencyKey: randomUUID() };
  const ctx = { session: { id: randomUUID() }, user: null };
  assert.deepEqual(await accounts.report(ctx, body), { reference: 'DEV-42' });
  assert.equal(saved[14], 'https://www.developed.sk/apps');
  const screenshot = unseal(saved[15], encryptionKey, `report:${saved[0]}`);
  const mail = unseal(mails[0].payload, encryptionKey, `mail:${mails[0].id}`);
  assert.equal(mail.to, 'info@developed.sk'); assert.ok(mail.text.includes(body.description));
  assert.ok(mail.html.includes('&lt;b&gt;')); assert.ok(!mail.text.includes('secret'));
  assert.equal(mail.attachments[0].Base64Content, screenshot);
  await accounts.report(ctx, body); assert.equal(mails.length, 1);
  await assert.rejects(accounts.report(ctx, { ...body, description: 'changed report' }), { code: 'idempotency_conflict' });
  let sent;
  const db = { query: async sql => sql.startsWith('update accounts.outbox set lease_id') ? [{ ...mails[0], attempts: 1 }] : [], limit: async () => {} };
  const worker = new MailWorker(db, { ...config, mailEnabled: true, mailjetKey: 'fixture', mailjetSecret: 'fixture' }, async (_, init) => { sent = JSON.parse(init.body); return Response.json({ Messages: [{ Status: 'success' }] }); });
  await worker.tick(); assert.equal(sent.Messages[0].Attachments[0].Base64Content, screenshot);
});

test('avatar mutations require CSRF/session; screenshots require administrator access', async t => {
  const { createAccountServer } = await import('../dist/http.js');
  const { seal } = await import('../dist/security.js');
  const userId = randomUUID(), reportId = randomUUID(), encryptionKey = randomBytes(32);
  let user = null, storedImage, storedId;
  const q = async (sql, args) => {
    if (sql.startsWith('select * from accounts.security_state')) return [{ security_version: 1 }];
    if (sql.startsWith('insert into accounts.avatars')) { assert.equal(args[0], userId); storedId = args[1]; storedImage = args[2]; return []; }
    if (sql.startsWith('select image')) return storedId === args[0] ? [{ image: storedImage }] : [];
    if (sql.startsWith('select screenshot_ciphertext')) return [{ screenshot_ciphertext: seal('c2NyZWVu', encryptionKey, `report:${reportId}`) }];
    if (sql.startsWith('delete from accounts.avatars')) { storedId = null; return []; }
    return [];
  };
  const config = { origin: 'http://127.0.0.1', insecureLocal: true, encryptionKey };
  const accounts = new Accounts({ query: q, tx: fn => fn(q), limit: async () => {} }, {}, config);
  accounts.bootstrap = async () => ({ user, session: { id: 'fixture', aal: 'aal2' } });
  accounts.csrf = () => 'fixture-csrf';
  const server = createAccountServer(accounts);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  config.origin = `http://127.0.0.1:${server.address().port}`;
  const upload = { image: await fixtureImage() };
  const send = (path, method, data, csrf = 'fixture-csrf') => fetch(config.origin + '/api/account' + path, {
    method, headers: { Origin: config.origin, 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(data),
  });
  assert.equal((await send('/profile/avatar', 'PUT', upload)).status, 401);
  user = { id: userId, role: 'USER', security_version: 1 };
  assert.equal((await send('/profile/avatar', 'PUT', upload, 'wrong')).status, 403);
  const response = await send('/profile/avatar', 'PUT', upload);
  assert.equal(response.status, 200);
  const { avatarUrl } = await response.json();
  assert.equal((await sharp(storedImage).metadata()).width, 256);
  user = null;
  const avatar = await fetch(avatarUrl);
  assert.equal(avatar.status, 200); assert.equal(avatar.headers.get('content-type'), 'image/jpeg');
  assert.equal((await fetch(`${config.origin}/api/account/admin/reports/${reportId}/screenshot`)).status, 401);
  user = { id: userId, role: 'USER', security_version: 1 };
  assert.equal((await fetch(`${config.origin}/api/account/admin/reports/${reportId}/screenshot`)).status, 403);
  user.role = 'SUPERADMIN'; user.hasMfa = true;
  const screenshot = await fetch(`${config.origin}/api/account/admin/reports/${reportId}/screenshot`);
  assert.equal(screenshot.status, 200); assert.equal(await screenshot.text(), 'screen');
  assert.equal((await send('/profile/avatar', 'DELETE', {})).status, 200);
  assert.equal((await fetch(avatarUrl)).status, 404);
});
