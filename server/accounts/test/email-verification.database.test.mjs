// Opt-in only: pre-staged, labeled disposable provider + central schema fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createPrivateKey, sign } from 'node:crypto';
import pg from 'pg';
import { Accounts } from '../dist/accounts.js';
import { Database } from '../dist/db.js';
import { Provider } from '../dist/provider.js';
import { createAccountServer } from '../dist/http.js';
import { unseal } from '../dist/security.js';

const container = process.env.ACCOUNTS_TEST_CONTAINER;
const playwrightModule = process.env.PLAYWRIGHT_MODULE;
test('real provider: email click verifies, signs in, and repeated links never issue a second session', { skip: !container || !playwrightModule, timeout: 60000 }, async () => {
  assert.match(container, /^developed-identity-test-\d+-db$/);
  const inspect = name => JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
  const metadata = inspect(container), auth = inspect(container.replace(/-db$/, '-auth'));
  for (const entry of [metadata, auth]) assert.equal(entry.Config.Labels['developed.identity.qualification'], 'true');
  const env = Object.fromEntries(auth.Config.Env.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  const password = randomBytes(32).toString('hex'), fixtureRole = `confirmation_fixture_${randomBytes(6).toString('hex')}`;
  execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `alter role developed_accounts login password '${password}'; create role ${fixtureRole} login superuser password '${password}';`, stdio: ['pipe', 'pipe', 'pipe']
  });
  const ip = Object.values(metadata.NetworkSettings.Networks)[0].IPAddress;
  const admin = new pg.Pool({ connectionString: `postgres://${fixtureRole}:${password}@${ip}:5432/postgres`, max: 2 });
  const db = new Database(`postgres://developed_accounts:${password}@${ip}:5432/postgres`);
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const jwk = JSON.parse(env.GOTRUE_JWT_KEYS)[0];
  const head = b64({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' }), payload = b64({ role: 'service_role', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600 });
  const signature = sign('sha256', Buffer.from(`${head}.${payload}`), { key: createPrivateKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const provider = new Provider(`http://127.0.0.1:${auth.NetworkSettings.Ports['9999/tcp'][0].HostPort}`, `${head}.${payload}.${signature}`);
  const config = { origin: 'http://127.0.0.1', encryptionKey: randomBytes(32), insecureLocal: true, mailEnabled: false, supportEmail: 'info@example.invalid', dailyEmailLimit: 1000, hourlyRegistrationLimit: 1000 };
  const accounts = new Accounts(db, provider, config);
  const server = createAccountServer(accounts);
  let browser;
  try {
    await admin.query("update accounts.settings set registration_mode='open'");
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    config.origin = `http://127.0.0.1:${server.address().port}`;
    const address = `confirmation-${randomUUID()}@example.invalid`;
    await accounts.register({ email: address, password: 'fixture-password-only', displayName: 'Confirmation Fixture', language: 'en' });
    const user = (await admin.query('select id,email_confirmed_at from auth.users where email=$1', [address])).rows[0];
    assert.equal(user.email_confirmed_at, null);
    const outbox = (await admin.query('select id,payload from accounts.outbox order by created_at desc limit 1')).rows[0];
    const mail = unseal(outbox.payload, config.encryptionKey, `mail:${outbox.id}`);
    assert.equal(mail.to, address);
    const token = mail.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
    // A scanner GET cannot consume the central proof.
    assert.equal((await fetch(`${config.origin}/verify-email`)).status, 200);
    assert.equal((await admin.query('select email_confirmed_at from auth.users where id=$1', [user.id])).rows[0].email_confirmed_at, null);
    const { chromium } = await import(playwrightModule);
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}), args: ['--no-sandbox'] });
    const context = await browser.newContext({ locale: 'en-US' }), page = await context.newPage();
    const confirmed = page.waitForResponse(r => new URL(r.url()).pathname === '/api/account/verify-email' && r.request().method() === 'POST');
    await page.goto(`${config.origin}/verify-email#token=${token}`).catch(() => { throw Error('Fixture verification navigation failed'); });
    const response = await confirmed;
    assert.equal(response.status(), 200);
    await page.waitForURL(`${config.origin}/apps`);
    const signedIn = await (await context.request.get(`${config.origin}/api/account/session`)).json();
    assert.equal(signedIn.user.id, user.id);
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    assert.equal(await page.evaluate(() => document.cookie), '');
    assert.equal((await admin.query('select count(*)::int as n from auth.sessions where user_id=$1', [user.id])).rows[0].n, 1);
    const secondContext = await browser.newContext({ locale: 'en-US' }), second = await secondContext.newPage();
    const repeated = second.waitForResponse(r => new URL(r.url()).pathname === '/api/account/verify-email' && r.request().method() === 'POST');
    await second.goto(`${config.origin}/verify-email#token=${token}`).catch(() => { throw Error('Fixture replay navigation failed'); });
    assert.equal((await repeated).status(), 200);
    await second.getByText('Email confirmed. You can now sign in.').waitFor();
    assert.equal((await (await secondContext.request.get(`${config.origin}/api/account/session`)).json()).user, null);
    assert.equal((await admin.query('select count(*)::int as n from auth.sessions where user_id=$1', [user.id])).rows[0].n, 1);
    assert.equal(await second.getByRole('button', { name: 'Confirm email', exact: true }).count(), 0);
    await secondContext.close(); await context.close();
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
    await db.pool.end(); await admin.end();
  }
});
