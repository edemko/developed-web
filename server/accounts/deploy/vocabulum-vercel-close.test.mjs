import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PROJECT, TEAM, OLD_IDS, CONFIG_SHA256, ENV_NAMES, buildStaticPayload, servingFingerprint } from './vocabulum-vercel-operator.mjs';
import { STATIC_ID, CANONICAL, PUBLIC_ALIAS, LEGACY_ALIASES, assertStaticMetadata, assertPreserved, publicSmoke,
  retireExact, productionPayload, assertProductionStage } from './vocabulum-vercel-close.mjs';

test('production staging changes only target and disabled automatic assignment', async () => {
  const config = await readFile(new URL('./vocabulum-vercel-retirement/config.json', import.meta.url), 'utf8');
  const { target, autoAssignCustomDomains, ...payload } = productionPayload(config);
  assert.equal(target, 'production'); assert.equal(autoAssignCustomDomains, false);
  assert.deepEqual(payload, buildStaticPayload(config));
});

test('production stage allows only observed default alias advance, exact preserved set and zero credentials/runtime', () => {
  const id = 'dpl_fixtureProduction';
  const d = { id, projectId: PROJECT, readyState: 'READY', target: 'production',
    alias: ['vocabulary-builder-erik-demkos-projects.vercel.app'],
    meta: { purpose: 'vocabulum-static-retirement-20260920', routingSha256: CONFIG_SHA256 },
    env: ['VERCEL'], build: { env: ['VERCEL'] }, builds: [] };
  const current = { project: { id: PROJECT, accountId: TEAM,
    targets: { production: { id: OLD_IDS[0] } }, ssoProtection: { deploymentType: 'all_except_custom_domains' } },
    envs: [], sharedEnvs: [], deployments: [...OLD_IDS, STATIC_ID, id].map((uid) => ({ uid, state: 'READY' })),
    aliases: [...LEGACY_ALIASES, CANONICAL].map((alias) => ({ alias, deploymentId: OLD_IDS[0] })),
    domains: [PUBLIC_ALIAS, CANONICAL].map((name) => ({ name })) };
  const record = { id, project: PROJECT, team: TEAM, previewId: STATIC_ID, autoAssignCustomDomains: false,
    routingSha256: CONFIG_SHA256, beforeServing: servingFingerprint(current) };
  current.aliases.find((entry) => entry.alias === 'vocabulary-builder-erik-demkos-projects.vercel.app').deploymentId = id;
  assertProductionStage(d, current, record);
  for (const mutation of [
    (a, s) => { s.project.targets.production.id = id; },
    (a, s) => { s.deployments.pop(); }, (a, s) => { s.aliases[0].deploymentId = id; },
    (a, s) => { s.aliases.find((entry) => entry.alias === CANONICAL).deploymentId = id; },
    (a, s) => { s.aliases.find((entry) => entry.alias === 'vocabulary-builder-git-main-erik-demkos-projects.vercel.app').deploymentId = id; },
    (a, s) => { s.project.link = { type: 'github' }; },
    (a, s) => { s.envs.push({ key: ENV_NAMES[0] }); },
    (a, s) => { s.sharedEnvs.push({ id: 'fixture' }); },
    (a) => { a.alias.push(PUBLIC_ALIAS); }, (a) => { a.target = null; },
    (a) => { a.readyState = 'BUILDING'; }, (a) => { a.env.push(ENV_NAMES[0]); },
    (a) => { a.functions = { api: {} }; }, (a) => { a.builds = [{ use: 'nextjs' }]; },
    (a, s, r) => { r.autoAssignCustomDomains = true; },
  ]) { const a = structuredClone(d), s = structuredClone(current), r = structuredClone(record);
    mutation(a, s, r); assert.throws(() => assertProductionStage(a, s, r)); }
});

test('static metadata gate rejects runtime code and any old application environment', () => {
  const original = { id: STATIC_ID, projectId: PROJECT, readyState: 'READY',
    meta: { purpose: 'vocabulum-static-retirement-20260920', routingSha256: CONFIG_SHA256 },
    env: ['VERCEL'], build: { env: ['VERCEL'] }, functions: null, builds: [], crons: [] };
  assertStaticMetadata(original);
  for (const mutation of [
    (d) => { d.id = OLD_IDS[0]; }, (d) => { d.projectId = 'other'; },
    (d) => { d.functions = { api: {} }; }, (d) => { d.env.push(ENV_NAMES[0]); },
    (d) => { d.build.env.push(ENV_NAMES[1]); }, (d) => { d.readyState = 'BUILDING'; },
    (d) => { d.builds.push({ use: 'nextjs' }); },
  ]) { const changed = structuredClone(original); mutation(changed); assert.throws(() => assertStaticMetadata(changed)); }
});

function fixtureProbe(host, path, method = 'GET', direct = false) {
  if (host === CANONICAL) return Promise.resolve({ status: direct ? 410 : 200,
    headers: {}, body: path === '/api/auth/providers' ? '{"credentials":{}}' : 'fixture-home' });
  assert.equal(host, PUBLIC_ALIAS);
  const redirect = ['GET', 'HEAD'].includes(method) && !path.startsWith('/api');
  return Promise.resolve({ status: redirect ? 303 : 410, body: '', headers: {
    'cache-control': 'no-store', 'referrer-policy': 'no-referrer',
    ...(redirect ? { location: `https://${CANONICAL}/auth/login#` } : {}),
  } });
}
const canonical = { rootStatus: 200, providerStatus: 200, providerIds: ['credentials'] };

test('public smoke rejects protection responses, query/fragment propagation, cookies and live API', async () => {
  await publicSmoke(fixtureProbe, canonical);
  for (const mutation of [
    (r) => { r.status = 302; },
    (r) => { r.headers.location = `https://${CANONICAL}/auth/login?code=fixture`; },
    (r) => { r.headers.location = `https://${CANONICAL}/auth/login`; },
    (r) => { r.headers['set-cookie'] = ['session=fixture']; },
    (r) => { r.headers['cache-control'] = 'public'; },
    (r) => { delete r.headers['referrer-policy']; },
  ]) await assert.rejects(publicSmoke(async (...args) => { const r = await fixtureProbe(...args);
    if (args[0] === PUBLIC_ALIAS) mutation(r); return r; }, canonical));
  await assert.rejects(publicSmoke(async (...args) => { const r = await fixtureProbe(...args);
    if (args[0] === PUBLIC_ALIAS && args[1].startsWith('/api')) r.status = 200; return r; }, canonical));
  await assert.rejects(publicSmoke(async (...args) => { const r = await fixtureProbe(...args);
    if (args[3]) r.status = 200; return r; }, canonical));
});

test('retirement touches exactly 26 approved deployments and stops on wrong ownership', async () => {
  const calls = []; const journal = [];
  await retireExact(async (path, method = 'GET') => {
    calls.push([method, path]); return { id: path.split('/').at(-1), projectId: PROJECT };
  }, async (entry) => journal.push(entry.deleted));
  assert.deepEqual(calls, OLD_IDS.flatMap((id) => [['GET', `/v13/deployments/${id}`], ['DELETE', `/v13/deployments/${id}`]]));
  assert.deepEqual(journal, OLD_IDS);
  assert.ok(!calls.some(([, path]) => path.includes('/projects/') || path.endsWith(STATIC_ID)));
  let deletions = 0;
  await assert.rejects(retireExact(async (path, method = 'GET') => {
    if (method === 'DELETE') deletions++;
    return { id: path.split('/').at(-1), projectId: 'another-project' };
  }, async () => {}));
  assert.equal(deletions, 0);
});

test('retirement preflight rejects stale alias/domain, changed protection or missing old deployment', () => {
  const original = { project: { id: PROJECT, accountId: TEAM, targets: { production: { id: STATIC_ID } },
    ssoProtection: { deploymentType: 'all_except_custom_domains' } }, envs: [], sharedEnvs: [],
    deployments: [...OLD_IDS, STATIC_ID].map((uid) => ({ uid, state: 'READY' })),
    domains: [{ name: PUBLIC_ALIAS }],
    aliases: LEGACY_ALIASES.map((alias) => ({ alias, deploymentId: STATIC_ID })) };
  const options = { promoted: true, aliasesMoved: true, detached: true };
  assertPreserved(original, options);
  for (const mutation of [
    (s) => { s.project.targets.production.id = OLD_IDS[0]; },
    (s) => { s.aliases[0].deploymentId = OLD_IDS[0]; },
    (s) => { s.domains.push({ name: CANONICAL }); },
    (s) => { s.aliases.push({ alias: CANONICAL, deploymentId: STATIC_ID }); },
    (s) => { s.deployments.pop(); }, (s) => { s.sharedEnvs.push({ id: 'secret' }); },
    (s) => { s.project.ssoProtection = null; },
  ]) { const changed = structuredClone(original); mutation(changed); assert.throws(() => assertPreserved(changed, options)); }
});
