import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PROJECT, TEAM, OLD_IDS, ENV_NAMES, CONFIG_SHA256, assertInitialSnapshot, assertStagedDeployment, buildStaticPayload,
  clearEnvironment, servingFingerprint } from './vocabulum-vercel-operator.mjs';

const config = await readFile(new URL('./vocabulum-vercel-retirement/config.json', import.meta.url), 'utf8');
const aliases = ['vocabulum.developed.sk', 'vocabulary-builder-plum.vercel.app',
  'vocabulary-builder-erik-demkos-projects.vercel.app',
  'vocabulary-builder-git-main-erik-demkos-projects.vercel.app',
  'vocabulary-builder-erikdemko-4215-erik-demkos-projects.vercel.app'];
function fixture() {
  return { project: { id: PROJECT, name: 'vocabulary-builder', accountId: TEAM,
    targets: { production: { id: OLD_IDS[0] } }, ssoProtection: { deploymentType: 'all_except_custom_domains' } },
  deployments: OLD_IDS.map((uid) => ({ uid, state: 'READY' })),
  aliases: aliases.map((alias) => ({ alias, deploymentId: OLD_IDS[0] })),
  domains: aliases.slice(0, 2).map((name) => ({ name })),
  envs: ENV_NAMES.map((key, index) => ({ id: `env_${index}`, key, value: `fixture-only-${index}` })), sharedEnvs: [] };
}

test('preview payload has only two static files, no inherited source, target promotion or environment', () => {
  const payload = buildStaticPayload(config);
  assert.equal(payload.project, PROJECT);
  for (const forbidden of ['target', 'gitSource', 'gitMetadata', 'deploymentId', 'env', 'build', 'alias']) {
    assert.ok(!Object.hasOwn(payload, forbidden));
  }
  assert.deepEqual(payload.files.map((f) => f.file), ['vercel.json', 'index.txt']);
  const routing = JSON.parse(payload.files[0].data);
  assert.deepEqual(routing.routes, JSON.parse(config).routes);
  assert.equal(routing.git.deploymentEnabled, false);
  assert.equal(routing.framework, null);
  assert.equal(routing.buildCommand, '');
  assert.equal(routing.installCommand, '');
  assert.throws(() => buildStaticPayload(config + '\n'));
});

test('preflight rejects wrong project/team, git reconnect, changed deployments and in-flight build', () => {
  assertInitialSnapshot(fixture());
  for (const mutate of [
    (s) => { s.project.id = 'other'; }, (s) => { s.project.accountId = 'other'; },
    (s) => { s.project.link = { repo: 'vocabulary-builder' }; },
    (s) => { s.project.targets.production.id = OLD_IDS[1]; },
    (s) => { s.deployments.pop(); }, (s) => { s.deployments[0].state = 'BUILDING'; },
    (s) => { s.aliases[0].deploymentId = 'other'; }, (s) => { s.domains.pop(); },
    (s) => { s.project.ssoProtection = null; },
    (s) => { s.sharedEnvs = [{ id: 'shared-fixture' }]; },
  ]) { const s = fixture(); mutate(s); assert.throws(() => assertInitialSnapshot(s)); }
});

test('environment removal deletes only exact backed-up IDs after a private unchanged-value check', async () => {
  const s = fixture();
  const saved = { project: PROJECT, team: TEAM, envs: s.envs };
  const calls = [];
  const api = async (path, method = 'GET') => { calls.push([method, path]); return { envs: s.envs }; };
  await clearEnvironment(api, saved, s);
  assert.deepEqual(calls, [
    ['GET', `/v10/projects/${PROJECT}/env?decrypt=true`],
    ...s.envs.map((e) => ['DELETE', `/v9/projects/${PROJECT}/env/${e.id}`]),
  ]);
  for (const mutation of [
    (state) => { state.envs[0].id = 'wrong'; },
    (state) => { state.envs[0].key = 'OTHER_APP'; },
  ]) {
    const changed = structuredClone(s); mutation(changed); let called = false;
    await assert.rejects(clearEnvironment(async () => { called = true; }, saved, changed));
    assert.equal(called, false);
  }
  let deletes = 0;
  await assert.rejects(clearEnvironment(async (path, method) => {
    if (method === 'DELETE') deletes++;
    return { envs: s.envs.map((e) => ({ ...e, value: 'changed-fixture' })) };
  }, saved, s));
  assert.equal(deletes, 0);
});

test('a new preview alias cannot hide a changed old alias or production target', () => {
  const before = fixture();
  const after = structuredClone(before);
  after.aliases.push({ alias: 'new-preview-erik-demkos-projects.vercel.app', deploymentId: 'dpl_new' });
  assert.equal(servingFingerprint(after), servingFingerprint(before));
  after.aliases[0].deploymentId = 'dpl_new';
  assert.notEqual(servingFingerprint(after), servingFingerprint(before));
  after.aliases[0].deploymentId = before.aliases[0].deploymentId;
  after.project.targets.production.id = 'dpl_new';
  assert.notEqual(servingFingerprint(after), servingFingerprint(before));
});

test('stage qualification requires READY preview, all old runtimes, no functions/builds/shared env', () => {
  const current = fixture(); current.envs = [];
  const record = { id: 'dpl_new', beforeServing: servingFingerprint(current) };
  current.deployments.push({ uid: record.id, state: 'READY' });
  const deployment = { id: record.id, projectId: PROJECT, readyState: 'READY', target: null,
    meta: { purpose: 'vocabulum-static-retirement-20260920', routingSha256: CONFIG_SHA256 },
    functions: {}, builds: [], crons: [] };
  assertStagedDeployment(deployment, current, record);
  for (const mutation of [
    (d) => { d.readyState = 'BUILDING'; }, (d) => { d.target = 'production'; },
    (d) => { d.functions = { api: {} }; }, (d) => { d.builds = [{ use: 'function' }]; },
    (d) => { d.crons = [{ path: '/cron' }]; }, (d) => { d.projectId = 'other'; },
  ]) { const changed = structuredClone(deployment); mutation(changed);
    assert.throws(() => assertStagedDeployment(changed, current, record)); }
  for (const mutation of [
    (s) => { s.deployments.shift(); }, (s) => { s.sharedEnvs = [{ id: 'shared' }]; },
    (s) => { s.envs = [{ id: 'env' }]; },
  ]) { const changed = structuredClone(current); mutation(changed);
    assert.throws(() => assertStagedDeployment(deployment, changed, record)); }
});
