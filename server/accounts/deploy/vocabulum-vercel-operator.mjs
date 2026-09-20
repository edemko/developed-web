import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, open, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const PROJECT = 'prj_Nqg32imlxVxBkRoeeAUpAdkz8Hfk';
export const TEAM = 'team_8zEVzukOohffhNKgSDSiDveC';
export const BACKUP = '/root/vocabulum-vercel-env-recovery-20260920.json';
export const STAGE_RECORD = '/root/vocabulum-vercel-static-stage-20260920.json';
export const CONFIG_SHA256 = 'e82ff0f9d20c3d8c86ece7359a0eba78f08b24158839366ae019efede7c436ac';
export const OLD_IDS = [
  'dpl_HhX4LtiZxYGtbf7G38AsF5iPqVSZ', 'dpl_5K2vrBjQJW6AsSWKx9mrG5wWyk2W',
  'dpl_7F2mDGFL9bfg44G4PSLvgN3fLZth', 'dpl_G1Xyh1LR1irc6M3rKuXKmALuh9no',
  'dpl_61XBs6MQDFdRzv656sTMWfpuPcm7', 'dpl_ECeGfCz93MkEDrvp8DU8DMiWmgQM',
  'dpl_GXuwtAd8n5n9fbUtVwZpNgbAvc3G', 'dpl_GLDnhFKPqnoyVhLNZ9cJcEMbyX1A',
  'dpl_AURd1QtpP3BeyC4sTRyRWzSsBNAk', 'dpl_9gtyWGAqRgFebUvhyKDqBY6BoKG1',
  'dpl_5duSA2DZoVJSDTJahrxwtxoLSxdX', 'dpl_8GjvWfNEHQqLFThamgjpmPujna5u',
  'dpl_6mDECyWYrZZ32msTnDiKBYuYt1TL', 'dpl_9rf3fBUaRpR2StuzFy11sJDqVN8L',
  'dpl_HNFDkX8X5b4FEHhrUxrTs3Qxjec8', 'dpl_8QZ1i5kMpbTTDnmkg7ek2K2p8mGB',
  'dpl_12QcUqFXLBshCF5c2sxsj2wAXLGv', 'dpl_FMzrGr5DTzR493PDV4gLxc2eb1fv',
  'dpl_AMy2gv489TnU72jx4FkW5evEvPSE', 'dpl_7fq3rvWPp4GgPWMYnJN3QXEPabUV',
  'dpl_4bJ8Z1J39UT3CYrYQfqPiqC22U6i', 'dpl_58jz9aNvFXXKCZf3TBBfEGsD1HMp',
  'dpl_5ty88a8tV1ttnTjzT2cknd6y5dH9', 'dpl_G9HevjWqdKib9iAt8huxSPmPvVVP',
  'dpl_E5QAK7P551Xx8cDQ9h6mwvQWZbsb', 'dpl_5e46BbZXAzZCuZUH4MmnZsgTqwaz',
];
export const ENV_NAMES = [
  'NEXTAUTH_URL', 'OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'NEXTAUTH_SECRET', 'OPENAI_ENCRYPTION_SECRET',
].sort();
const EXPECTED_ALIASES = [
  'vocabulum.developed.sk', 'vocabulary-builder-plum.vercel.app',
  'vocabulary-builder-erik-demkos-projects.vercel.app',
  'vocabulary-builder-git-main-erik-demkos-projects.vercel.app',
  'vocabulary-builder-erikdemko-4215-erik-demkos-projects.vercel.app',
].sort();
const EXPECTED_DOMAINS = ['vocabulum.developed.sk', 'vocabulary-builder-plum.vercel.app'].sort();
const digest = (value) => createHash('sha256').update(value).digest('hex');
const sorted = (values) => [...values].sort();

export function assertInitialSnapshot(s) {
  assert.equal(s.project.id, PROJECT);
  assert.equal(s.project.name, 'vocabulary-builder');
  assert.equal(s.project.accountId, TEAM);
  assert.ok(!s.project.link, 'Git link must remain disconnected');
  assert.equal(s.project.targets?.production?.id, OLD_IDS[0]);
  assert.equal(s.project.ssoProtection?.deploymentType, 'all_except_custom_domains');
  assert.deepEqual(sorted(s.deployments.map((d) => d.uid)), sorted(OLD_IDS));
  assert.ok(s.deployments.every((d) => d.state === 'READY'));
  assert.deepEqual(sorted(s.aliases.map((a) => a.alias)), EXPECTED_ALIASES);
  assert.deepEqual(sorted(s.domains.map((d) => d.name)), EXPECTED_DOMAINS);
  assert.ok(s.aliases.every((a) => OLD_IDS.includes(a.deploymentId)));
  assert.deepEqual(s.sharedEnvs, [], 'Linked shared environment variables require review');
}

export function servingFingerprint(s) {
  return JSON.stringify({
    target: s.project.targets?.production?.id,
    protection: s.project.ssoProtection,
    aliases: s.aliases.filter((a) => EXPECTED_ALIASES.includes(a.alias))
      .map((a) => [a.alias, a.deploymentId]).sort(),
    domains: s.domains.map((d) => [d.name, d.redirect, d.gitBranch]).sort(),
  });
}

export function buildStaticPayload(configText) {
  assert.equal(digest(configText), CONFIG_SHA256, 'Unreviewed routing artifact');
  const config = JSON.parse(configText);
  return {
    name: 'vocabulary-builder', project: PROJECT,
    // Omitted target is a preview; never auto-promote this staging request.
    files: [
      { file: 'vercel.json', data: JSON.stringify({
        version: 2, framework: null, buildCommand: '', installCommand: '',
        git: { deploymentEnabled: false }, routes: config.routes,
      }), encoding: 'utf-8' },
      { file: 'index.txt', data: 'Vocabulum is hosted at https://vocabulum.developed.sk/\n', encoding: 'utf-8' },
    ],
    projectSettings: { framework: null, buildCommand: '', installCommand: '',
      outputDirectory: null, rootDirectory: null },
    meta: { purpose: 'vocabulum-static-retirement-20260920', routingSha256: CONFIG_SHA256 },
  };
}

async function privateWrite(path, value) {
  assert.equal(process.getuid(), 0, 'Recovery/state files require root');
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); }
  finally { await file.close(); }
  const directory = await open('/root', 'r');
  try { await directory.sync(); } finally { await directory.close(); }
  const saved = await privateRead(path);
  assert.deepEqual(saved, value);
}

async function privateRead(path) {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, 0);
  assert.equal(stat.nlink, 1);
  assert.equal(stat.mode & 0o777, 0o600);
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function snapshot(api) {
  const [project, deploymentList, aliasList, domainList, environment, sharedEnvironment] = await Promise.all([
    api(`/v9/projects/${PROJECT}`),
    api(`/v6/deployments?projectId=${PROJECT}&limit=100`),
    api(`/v4/aliases?projectId=${PROJECT}&limit=100`),
    api(`/v9/projects/${PROJECT}/domains?limit=100`),
    api(`/v10/projects/${PROJECT}/env`),
    api(`/v1/env?projectId=${PROJECT}`),
  ]);
  for (const list of [deploymentList, aliasList, domainList, sharedEnvironment]) assert.ok(!list.pagination?.next);
  return { project, deployments: deploymentList.deployments, aliases: aliasList.aliases,
    domains: domainList.domains, envs: environment.envs, sharedEnvs: sharedEnvironment.data };
}

export function assertStagedDeployment(deployment, current, record) {
  assert.equal(deployment.projectId, PROJECT);
  assert.equal(deployment.id, record.id);
  assert.equal(deployment.readyState, 'READY');
  assert.ok(deployment.target == null || deployment.target === 'preview', 'Stage must not be production');
  assert.equal(deployment.meta?.purpose, 'vocabulum-static-retirement-20260920');
  assert.equal(deployment.meta?.routingSha256, CONFIG_SHA256);
  for (const key of ['functions', 'builds', 'crons']) {
    assert.ok(deployment[key] == null || (typeof deployment[key] === 'object'
      && Object.keys(deployment[key]).length === 0), `Nonempty ${key} metadata requires review`);
  }
  assert.ok(!current.project.link);
  assert.equal(servingFingerprint(current), record.beforeServing);
  assert.equal(current.envs.length, 0);
  assert.deepEqual(current.sharedEnvs, []);
  assert.deepEqual(sorted(current.deployments.map((d) => d.uid)), sorted([...OLD_IDS, record.id]));
  assert.ok(current.deployments.filter((d) => OLD_IDS.includes(d.uid)).every((d) => d.state === 'READY'));
  assert.ok(current.aliases.every((a) => EXPECTED_ALIASES.includes(a.alias)
    || (a.deploymentId === record.id && a.alias.endsWith('-erik-demkos-projects.vercel.app'))));
}

export async function clearEnvironment(api, saved, current) {
  assertInitialSnapshot(current);
  assert.equal(saved.project, PROJECT); assert.equal(saved.team, TEAM);
  assert.deepEqual(sorted(saved.envs.map((e) => e.key)), ENV_NAMES);
  assert.deepEqual(sorted(current.envs.map((e) => e.id)), sorted(saved.envs.map((e) => e.id)));
  assert.deepEqual(sorted(current.envs.map((e) => e.key)), ENV_NAMES);
  assert.ok(saved.envs.every((e) => typeof e.value === 'string' && e.value.length > 0));
  // The decrypted response is compared privately; it is never printed.
  const fresh = await api(`/v10/projects/${PROJECT}/env?decrypt=true`);
  assert.equal(JSON.stringify(fresh.envs), JSON.stringify(saved.envs), 'Environment changed since backup');
  for (const e of saved.envs) {
    assert.match(e.id, /^[a-zA-Z0-9_-]+$/);
    await api(`/v9/projects/${PROJECT}/env/${e.id}`, 'DELETE');
  }
}

async function run(phase) {
  assert.ok(['plan', 'backup-env', 'clear-env', 'stage', 'inspect-stage'].includes(phase));
  const auth = JSON.parse(await readFile('/home/openclaw/.local/share/com.vercel.cli/auth.json', 'utf8'));
  const api = async (path, method = 'GET', body) => {
    assert.ok(path.startsWith('/v') && !path.includes('://'));
    const url = new URL(path, 'https://api.vercel.com');
    url.searchParams.set('teamId', TEAM);
    const response = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new Error(`Vercel request failed: ${method} ${url.pathname}, HTTP ${response.status}`);
    const raw = await response.text();
    return raw ? JSON.parse(raw) : {};
  };
  const current = await snapshot(api);
  if (phase === 'inspect-stage') {
    const record = await privateRead(STAGE_RECORD);
    assert.equal(record.project, PROJECT); assert.equal(record.team, TEAM);
    assert.match(record.id, /^dpl_[a-zA-Z0-9]+$/);
    const deployment = await api(`/v13/deployments/${record.id}`);
    assertStagedDeployment(deployment, current, record);
    console.log(JSON.stringify({ phase, id: deployment.id, url: deployment.url,
      readyState: deployment.readyState, target: deployment.target,
      alias: deployment.alias, routes: deployment.routes,
      buildCount: deployment.builds?.length, functionCount: deployment.functions && Object.keys(deployment.functions).length,
      cronCount: 0, zeroProjectEnv: true, zeroLinkedSharedEnv: true, servingUnchanged: true }));
    return;
  }
  assertInitialSnapshot(current);
  if (phase === 'plan') {
    console.log(JSON.stringify({ phase, project: PROJECT, team: TEAM, oldDeploymentCount: OLD_IDS.length,
      aliases: current.aliases.length, domains: current.domains.length,
      envNames: current.envs.map((e) => e.key).sort(), linkedSharedEnvCount: current.sharedEnvs.length,
      gitDisconnected: true,
      proposedPhases: ['backup-env', 'clear-env', 'stage', 'inspect-stage'],
      productionAliasChanges: false, oldRuntimeRetirementIncluded: false }));
  } else if (phase === 'backup-env') {
    assert.equal(process.getuid(), 0);
    const env = await api(`/v10/projects/${PROJECT}/env?decrypt=true`);
    assert.deepEqual(sorted(env.envs.map((e) => e.key)), ENV_NAMES);
    assert.ok(env.envs.every((e) => typeof e.value === 'string' && e.value.length > 0));
    await privateWrite(BACKUP, { project: PROJECT, team: TEAM, time: new Date().toISOString(), envs: env.envs });
    console.log(JSON.stringify({ phase, savedEntries: env.envs.length, backup: BACKUP, rootOnly: true }));
  } else if (phase === 'clear-env') {
    await clearEnvironment(api, await privateRead(BACKUP), current);
    const after = await snapshot(api);
    assertInitialSnapshot(after); assert.equal(after.envs.length, 0);
    assert.equal(servingFingerprint(after), servingFingerprint(current));
    console.log(JSON.stringify({ phase, removedEntries: 7, servingUnchanged: true, oldRuntimeCredentialsUnchanged: true }));
  } else if (phase === 'stage') {
    assert.equal(process.getuid(), 0);
    assert.equal(current.envs.length, 0, 'Remove exact backed-up project variables before staging');
    await privateRead(BACKUP);
    try { await lstat(STAGE_RECORD); throw new Error('Stage record already exists; inspect rather than redeploy'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const payload = buildStaticPayload(await readFile(new URL('./vocabulum-vercel-retirement/config.json', import.meta.url), 'utf8'));
    const deployment = await api('/v13/deployments?skipAutoDetectionConfirmation=1', 'POST', payload);
    assert.match(deployment.id, /^dpl_[a-zA-Z0-9]+$/);
    await privateWrite(STAGE_RECORD, { project: PROJECT, team: TEAM, id: deployment.id,
      url: deployment.url, routingSha256: CONFIG_SHA256, beforeServing: servingFingerprint(current),
      time: new Date().toISOString() });
    console.log(JSON.stringify({ phase, id: deployment.id, url: deployment.url,
      readyState: deployment.readyState, target: deployment.target, promoted: false }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2] ?? 'plan').catch((error) => {
    // Assertion actual/expected values may contain decrypted secrets. Never print
    // the Error object, stack, assert diff or arbitrary upstream response body.
    console.error(error.code === 'ERR_ASSERTION' ? 'Safety assertion failed; inspect privately before continuing.' :
      error.message.startsWith('Vercel request failed:') ? error.message : 'Operator failed; inspect privately before continuing.');
    process.exitCode = 1;
  });
}
