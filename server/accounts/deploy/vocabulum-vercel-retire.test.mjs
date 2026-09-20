import test from 'node:test';
import assert from 'node:assert/strict';
import { assertClosureState } from './vocabulum-vercel-retire.mjs';
import { PROJECT, TEAM, OLD_IDS } from './vocabulum-vercel-operator.mjs';
import { STATIC_ID, PRODUCTION_ID, CANONICAL, PUBLIC_ALIAS, LEGACY_ALIASES, retireExact } from './vocabulum-vercel-close.mjs';
import { HANDOFF_ID, smoke, HTML } from './vocabulum-vercel-browser-handoff.mjs';
function state() { return {
  project: { id: PROJECT, accountId: TEAM, targets: { production: { id: HANDOFF_ID } }, ssoProtection: { deploymentType: 'all_except_custom_domains' } },
  envs: [], sharedEnvs: [], deployments: [...OLD_IDS, STATIC_ID, PRODUCTION_ID, HANDOFF_ID].map((uid) => ({ uid, state: 'READY' })),
  domains: [{ name: PUBLIC_ALIAS }], aliases: LEGACY_ALIASES.map((alias) => ({ alias, deploymentId: HANDOFF_ID })),
}; }
test('final deletion preflight rejects every broader or partial retirement scope', () => {
  const options = { aliasesMoved: true, detached: true }; assertClosureState(state(), options);
  for (const change of [(s) => s.deployments.pop(), (s) => s.deployments.push({ uid: 'unknown', state: 'READY' }),
    (s) => { s.project.targets.production.id = PRODUCTION_ID; }, (s) => { s.aliases[0].deploymentId = OLD_IDS[0]; },
    (s) => s.domains.push({ name: CANONICAL }), (s) => { s.project.link = {}; }, (s) => s.envs.push({ key: 'SECRET' }),
    (s) => s.sharedEnvs.push({ key: 'SECRET' }), (s) => { s.project.ssoProtection = null; }]) {
    const s = state(); change(s); assert.throws(() => assertClosureState(s, options));
  }
});
test('retirement still deletes only exact26 and never any of three static artifacts or project', async () => {
  const deleted = [];
  await retireExact(async (path, method = 'GET') => { if (method === 'DELETE') deleted.push(path);
    return { id: path.split('/').at(-1), projectId: PROJECT }; }, async () => {});
  assert.deepEqual(deleted, OLD_IDS.map((id) => `/v13/deployments/${id}`));
  assert.ok(!deleted.some((p) => [STATIC_ID, PRODUCTION_ID, HANDOFF_ID].some((id) => p.endsWith(id))));
});
test('only post-detach direct-origin probe accepts strict TLS hostname rejection', async () => {
  const fixture = async (host, path, method = 'GET', direct = false) => {
    if (direct) throw Object.assign(new Error('fixture'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' });
    const navigation = ['GET', 'HEAD'].includes(method) && !path.startsWith('/api');
    return { status: navigation ? 200 : 410, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }, body: navigation ? HTML : '' };
  };
  await assert.rejects(smoke(fixture));
  assert.equal((await smoke(fixture, { detached: true })).directCanonicalResult, 'TLS_HOSTNAME_REJECTED');
  await assert.rejects(smoke(async () => { throw Object.assign(new Error('fixture'), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }); }, { detached: true }));
});
