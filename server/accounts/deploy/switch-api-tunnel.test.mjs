import test from 'node:test';
import assert from 'node:assert/strict';
import { transform, configHash, validateInput, checkedUpdate, execute } from './switch-api-tunnel.mjs';

const fixture = () => ({
  ingress: [
    { hostname: 'sam-api.developed162.bid', path: '^/(auth|rest|realtime|storage|functions|graphql)/', service: 'http://127.0.0.1:8000', originRequest: { connectTimeout: 10 } },
    { hostname: 'sam-api.developed162.bid', service: 'http_status:404' },
    { hostname: 'sam-studio.developed162.bid', service: 'http://127.0.0.1:8000', originRequest: { access: { required: true, teamName: 'fixture', audTag: ['fixture'] } } },
    { service: 'http_status:404' },
  ], originRequest: { tcpKeepAlive: 30 }, 'warp-routing': { enabled: true },
});
const inputFor = config => ({ accountId: 'a'.repeat(32), tunnelId: '11111111-2222-3333-4444-555555555555', apiToken: 'fixture-credential-not-live', expectedVersion: 1, expectedConfigSha256: configHash(config), expectedCaddySha256: 'b'.repeat(64) });
const snapshot = (config, input, version = 1) => ({ account_id: input.accountId, tunnel_id: input.tunnelId, source: 'cloudflare', version, config });

test('only API origin/path pair changes; Studio, final404 and all options survive', () => {
  const original = fixture(), desired = transform(original);
  assert.equal(desired.ingress.length, 3);
  assert.equal(desired.ingress[0].service, 'http://127.0.0.1:80');
  assert.equal(desired.ingress[0].path, undefined);
  assert.deepEqual(desired.ingress[0].originRequest, original.ingress[0].originRequest);
  assert.deepEqual(desired.ingress.slice(1), original.ingress.slice(2));
  assert.deepEqual(desired.originRequest, original.originRequest);
  assert.deepEqual(desired['warp-routing'], original['warp-routing']);
  assert.equal(original.ingress.length, 4);
});
test('unexpected ingress priority, paths, aliases or Host overrides fail closed', () => {
  for (const mutate of [
    c => c.ingress.reverse(), c => c.ingress[0].path = '^/auth/',
    c => c.ingress[0].service = 'http://other.invalid',
    c => c.ingress.push({ hostname: 'sam-api.developed162.bid', service: 'http_status:404' }),
    c => c.ingress[2].service = 'http://127.0.0.1:80',
    c => c.originRequest.httpHostHeader = 'wrong.invalid',
    c => c.ingress[0].originRequest.httpHostHeader = 'wrong.invalid',
    c => c.ingress.at(-1).service = 'http_status:200',
  ]) { const config = fixture(); mutate(config); assert.throws(() => transform(config)); }
});
test('credential/target validation and canonical hashes reject ambiguity', () => {
  const config = fixture(), input = inputFor(config); validateInput(input);
  assert.throws(() => validateInput({ ...input, accountId: '../other' }));
  assert.throws(() => validateInput({ ...input, expectedVersion: undefined }));
  assert.equal(configHash({ b: 1, a: { z: 2, y: 3 } }), configHash({ a: { y: 3, z: 2 }, b: 1 }));
});
test('one PUT follows preflight/fresh GET/persisted intent and is followed by GET', async () => {
  const config = fixture(), input = inputFor(config), original = snapshot(config, input), desired = transform(config), events = [];
  let wrote = false;
  const result = await checkedUpdate({ input, original, desired,
    verifyGateway: async () => events.push('gateway'), markAttempt: async () => events.push('persist-attempt'),
    api: async (method, body) => { events.push(method); if (method === 'PUT') { assert.deepEqual(body, { config: desired }); wrote = true; return snapshot(desired, input, 2); } return wrote ? snapshot(desired, input, 2) : original; },
  });
  assert.deepEqual(events, ['gateway', 'GET', 'persist-attempt', 'PUT', 'GET']);
  assert.equal(result.updated, true); assert.equal(result.effectivePropagationVerified, false);
});
test('fresh drift or failed local gateway causes no PUT', async () => {
  const config = fixture(), input = inputFor(config), original = snapshot(config, input), desired = transform(config);
  let puts = 0, attempts = 0;
  const base = { input, original, desired, markAttempt: async () => attempts++, api: async method => { if (method === 'PUT') puts++; return { ...original, version: 2 }; } };
  await assert.rejects(checkedUpdate({ ...base, verifyGateway: async () => {} }), /Remote configuration drift/);
  await assert.rejects(checkedUpdate({ ...base, verifyGateway: async () => { throw Error('fixture gateway failure'); } }), /fixture gateway failure/);
  assert.equal(puts, 0); assert.equal(attempts, 0);
});
test('ambiguous PUT is never retried or automatically rolled back', async () => {
  const config = fixture(), input = inputFor(config), original = snapshot(config, input), events = [];
  await assert.rejects(checkedUpdate({ input, original, desired: transform(config), verifyGateway: async () => {}, markAttempt: async () => events.push('attempt'), api: async method => { events.push(method); if (method === 'PUT') throw Error('fixture timeout'); return original; } }), /fixture timeout/);
  assert.deepEqual(events, ['GET', 'attempt', 'PUT']);
});
test('post-write mismatch fails without compensating remote writes', async () => {
  const config = fixture(), input = inputFor(config), original = snapshot(config, input), events = [];
  await assert.rejects(checkedUpdate({ input, original, desired: transform(config), verifyGateway: async () => {}, markAttempt: async () => {}, api: async method => { events.push(method); return original; } }), /Post-write verification failed/);
  assert.deepEqual(events, ['GET', 'PUT', 'GET']);
});
test('developer cannot invoke remote/root operations', { skip: process.getuid() === 0 }, async () => {
  for (const mode of ['--inspect', '--stage', '--apply']) await assert.rejects(execute(mode, '/not-a-real-input'), /Only reviewed root/);
});
