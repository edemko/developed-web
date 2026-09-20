import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registrations, requestBody, validateRegistration, stageClient, exclusiveWrite, transport, run } from '../operators/register-private-clients.mjs';

const source = await readFile(new URL('../launch-catalog.json', import.meta.url), 'utf8');
const clients = registrations(source);
const id = '17064340-5563-4ca0-b7f3-cf44c6af7001';
const response = client => ({ ...requestBody(client), client_id: id, registration_type: 'manual',
  ...(client.kind === 'web' ? { client_secret: 'synthetic-secret-for-test-only-1234567890' } : {}) });

test('exact seven catalog clients and one KešTrek native; edited catalog rejected', () => {
  assert.equal(clients.length, 8);
  assert.equal(new Set(clients.map(client => client.callbackUrl)).size, 8);
  assert.throws(() => registrations(source + '\n'));
  assert.equal(clients.filter(client => client.kind === 'native').length, 1);
  assert.equal(clients.at(-1).callbackUrl, 'sk.kestrek://oauth/callback');
});

test('dry run cannot connect or write, including unrecognized argument rejection', async () => {
  assert.equal((await run(['--client', 'mega-music-web'])).status, 'dry-run-no-connection-no-writes');
  await assert.rejects(run(['--client', 'vocabulum-native']));
  await assert.rejects(run(['--client', 'mega-music-web', '--replace']));
});

test('strict provider callback, type, method, grant and one-time secret validation', () => {
  for (const client of clients) {
    assert.equal(validateRegistration(client, response(client), { created: true }).client_id, id);
    for (const patch of [{ redirect_uris: [client.callbackUrl, 'https://attacker.invalid'] },
      { token_endpoint_auth_method: 'client_secret_basic' }, { grant_types: ['authorization_code'] },
      { response_types: ['token'] }, { registration_type: 'dynamic' }, { client_id: 'invalid' }]) {
      assert.throws(() => validateRegistration(client, { ...response(client), ...patch }, { created: true }));
    }
  }
  assert.throws(() => validateRegistration(clients[0], { ...response(clients[0]), client_secret: '' }, { created: true }));
  assert.throws(() => validateRegistration(clients.at(-1), { ...response(clients.at(-1)), client_secret: 'unexpected' }));
});

test('durable markers before single POST, duplicate protected copies before read-back', async () => {
  for (const client of [clients[0], clients.at(-1)]) {
    const events = [], artifacts = new Map();
    const result = await stageClient(client, { existing: [], directory: '/primary', backup: '/backup',
      write: async (path, value) => { events.push(path); artifacts.set(path, value); },
      call: async (path, body) => { events.push(body ? 'POST' : 'GET'); return response(client); } });
    assert.equal(result.status, 'provider-registered-not-attached');
    assert.deepEqual(events.slice(0, 3), [`/primary/${client.key}.started.json`, `/backup/${client.key}.started.json`, 'POST']);
    assert.deepEqual(events.slice(3, 6), [`/primary/${client.key}.credentials.json`, `/backup/${client.key}.credentials.json`, 'GET']);
    const credentials = artifacts.get(`/primary/${client.key}.credentials.json`);
    assert.deepEqual(credentials, artifacts.get(`/backup/${client.key}.credentials.json`));
    const input = artifacts.get(`/primary/${client.key}.attach.json`);
    assert.equal(input.clientId, id);
    assert.equal('serverKey' in input, client.kind === 'web');
    assert.equal('client_secret' in input, false);
    if (client.kind === 'web') assert.match(input.serverKey, /^[A-Za-z0-9_-]{43}$/);
  }
});

test('ambiguous POST failure is never retried; marker retained', async () => {
  const events = [];
  await assert.rejects(stageClient(clients[0], { existing: [], directory: '/primary', backup: '/backup',
    write: async path => events.push(path), call: async () => { events.push('POST'); throw new Error('timeout'); } }));
  assert.equal(events.filter(value => value === 'POST').length, 1);
  assert.equal(events.length, 3);
});

test('marker backup failure prevents POST; existing callback prevents all writes', async () => {
  let calls = 0, writes = 0;
  const options = { directory: '/primary', backup: '/backup', call: async () => { calls++; },
    write: async () => { if (++writes === 2) throw new Error('disk failure'); } };
  await assert.rejects(stageClient(clients[0], { ...options, existing: [] }));
  assert.equal(calls, 0);
  writes = 0;
  await assert.rejects(stageClient(clients[0], { ...options, existing: [{ redirect_uris: [clients[0].callbackUrl] }] }));
  assert.equal(writes, 0);
});

test('invalid provider response retained privately, no attach written', async () => {
  const writes = [];
  await assert.rejects(stageClient(clients[0], { existing: [], directory: '/primary', backup: '/backup',
    write: async path => writes.push(path), call: async () => ({ ...response(clients[0]), token_endpoint_auth_method: 'none' }) }));
  assert.equal(writes.length, 4);
  assert.ok(writes[3].endsWith('.credentials.json'));
});

test('transport suppresses response errors, rejects redirect, never retries', async () => {
  let calls = 0;
  const call = transport('synthetic-admin', async (url, options) => {
    calls++; assert.equal(url, 'http://127.0.0.1:3141/admin/oauth/clients');
    assert.equal(options.redirect, 'error');
    return { ok: false, json: () => { throw new Error('must not read failed secret body'); } };
  });
  await assert.rejects(call('/admin/oauth/clients', requestBody(clients[0])), /operation rejected/);
  assert.equal(calls, 1);
  await assert.rejects(call('/admin/users'));
  assert.equal(calls, 1);
});

test('exclusive durable private files reject overwrite and preserve original', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'developed-client-operator-test-'));
  const path = join(directory, 'record.json');
  try {
    await exclusiveWrite(path, { synthetic: true });
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    await assert.rejects(exclusiveWrite(path, { synthetic: false }));
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { synthetic: true });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
