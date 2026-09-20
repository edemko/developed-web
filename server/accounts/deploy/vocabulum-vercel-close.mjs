import assert from 'node:assert/strict';
import { readFile, open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import https from 'node:https';
import { pathToFileURL } from 'node:url';
import { PROJECT, TEAM, OLD_IDS, ENV_NAMES, CONFIG_SHA256, snapshot,
  servingFingerprint, assertStagedDeployment } from './vocabulum-vercel-operator.mjs';

export const STATIC_ID = 'dpl_J2es9uhrzdS1fcxo7gAV1U4rRpZr';
export const STATIC_HOST = 'vocabulary-builder-cev55ut27-erik-demkos-projects.vercel.app';
export const CANONICAL = 'vocabulum.developed.sk';
export const PUBLIC_ALIAS = 'vocabulary-builder-plum.vercel.app';
export const LEGACY_ALIASES = [PUBLIC_ALIAS,
  'vocabulary-builder-erik-demkos-projects.vercel.app',
  'vocabulary-builder-git-main-erik-demkos-projects.vercel.app',
  'vocabulary-builder-erikdemko-4215-erik-demkos-projects.vercel.app'];
const CAPTURE = '/root/vocabulum-vercel-closure-before-20260920.json';
const VERIFIED = '/root/vocabulum-vercel-public-verified-20260920.json';
const JOURNAL = '/root/vocabulum-vercel-retirement-journal-20260920.jsonl';
const STAGE_RECORD = '/root/vocabulum-vercel-static-stage-20260920.json';
const FILE_HASHES = {
  'src/index.txt': 'ea08691d51a814e4385b826c44d56502ead6b3ad82abc1e5522c63eb6bc0f507',
  'src/vercel.json': 'dd9458aa4ce756a8284f3b122122ade6c4928f1884f4fdaa5ece1d6adc3eaaae',
};
const sorted = (values) => [...values].sort();
const digest = (value) => createHash('sha256').update(value).digest('hex');

async function privateRead(path) {
  const stat = await lstat(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink());
  assert.equal(stat.uid, 0); assert.equal(stat.nlink, 1); assert.equal(stat.mode & 0o777, 0o600);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function privateCreate(path, data) {
  assert.equal(process.getuid(), 0);
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
  const dir = await open('/root', 'r');
  try { await dir.sync(); } finally { await dir.close(); }
  assert.deepEqual(await privateRead(path), data);
}

export function assertStaticMetadata(d) {
  assert.equal(d.id, STATIC_ID); assert.equal(d.projectId, PROJECT); assert.equal(d.readyState, 'READY');
  assert.equal(d.meta?.purpose, 'vocabulum-static-retirement-20260920');
  assert.equal(d.meta?.routingSha256, CONFIG_SHA256);
  for (const key of ['functions', 'builds', 'crons']) assert.ok(d[key] == null
    || (typeof d[key] === 'object' && Object.keys(d[key]).length === 0));
  for (const env of [d.env, d.build?.env]) {
    assert.ok(Array.isArray(env) && env.every((name) => typeof name === 'string'
      && /^[A-Z_][A-Z0-9_]*$/.test(name)));
    assert.ok(ENV_NAMES.every((name) => !env.includes(name)), 'Legacy application environment is present');
  }
}

export function assertPreserved(s, { promoted = false, aliasesMoved = false, detached = false } = {}) {
  assert.equal(s.project.id, PROJECT); assert.equal(s.project.accountId, TEAM);
  assert.ok(!s.project.link); assert.equal(s.project.ssoProtection?.deploymentType, 'all_except_custom_domains');
  assert.equal(s.project.targets?.production?.id, promoted ? STATIC_ID : OLD_IDS[0]);
  assert.deepEqual(s.envs, []); assert.deepEqual(s.sharedEnvs, []);
  assert.deepEqual(sorted(s.deployments.map((d) => d.uid)), sorted([...OLD_IDS, STATIC_ID]));
  assert.ok(s.deployments.every((d) => d.state === 'READY'));
  assert.deepEqual(sorted(s.domains.map((d) => d.name)), sorted(detached ? [PUBLIC_ALIAS] : [PUBLIC_ALIAS, CANONICAL]));
  for (const alias of LEGACY_ALIASES) {
    const a = s.aliases.find((a) => a.alias === alias); assert.ok(a);
    if (aliasesMoved) assert.equal(a.deploymentId, STATIC_ID);
    else assert.ok(a.deploymentId === STATIC_ID || OLD_IDS.includes(a.deploymentId));
  }
  assert.ok(s.aliases.every((a) => [...LEGACY_ALIASES, CANONICAL].includes(a.alias)), 'Unexpected alias needs review');
  if (detached) assert.ok(!s.aliases.some((a) => a.alias === CANONICAL));
}

async function verifyFiles(api) {
  const tree = await api(`/v6/deployments/${STATIC_ID}/files`);
  const files = [];
  function walk(entries, parent = '') {
    for (const file of entries) {
      const path = parent ? `${parent}/${file.name}` : file.name;
      if (file.type === 'directory') walk(file.children ?? [], path);
      else { assert.equal(file.type, 'file'); files.push({ path, uid: file.uid }); }
    }
  }
  walk(tree); assert.deepEqual(sorted(files.map((f) => f.path)), sorted(Object.keys(FILE_HASHES)));
  for (const file of files) {
    assert.match(file.uid, /^[a-zA-Z0-9_-]+$/);
    const data = await api(`/v8/deployments/${STATIC_ID}/files/${file.uid}`);
    assert.equal(digest(Buffer.from(data.data, 'base64')), FILE_HASHES[file.path]);
  }
}

async function httpProbe(host, path, method = 'GET', directCanonical = false) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: directCanonical ? STATIC_HOST : host,
      servername: host, path, method, headers: { Host: host, 'User-Agent': 'Mozilla/5.0 (Vocabulum migration check)' } }, (res) => {
      let body = ''; res.on('data', (part) => { body += part; if (body.length > 1000000) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Probe timeout')));
    req.end(method === 'POST' ? 'fixture=nonsecret-static-route-check' : undefined);
  });
}
async function canonicalSnapshot(probe = httpProbe) {
  const root = await probe(CANONICAL, '/');
  assert.ok(root.status >= 200 && root.status < 400);
  const providers = await probe(CANONICAL, '/api/auth/providers');
  assert.equal(providers.status, 200);
  return { rootStatus: root.status, providerStatus: providers.status,
    providerIds: Object.keys(JSON.parse(providers.body)).sort() };
}

export async function publicSmoke(probe, expectedCanonical, { detached = false } = {}) {
  for (const [method, path, expected] of [
    ['GET', '/?code=fixture-code&token=fixture-token', 303],
    ['HEAD', '/auth/login?next=https://untrusted.invalid', 303],
    ['GET', '/reset-password?token=fixture-token', 303],
    ['GET', '/folders/fixture', 303],
    ['GET', '/api/auth/providers', 410], ['GET', '/api/auth/session', 410],
    ['GET', '/api/auth/callback/developed?code=fixture-code&state=fixture-state', 410],
    ['POST', '/api/v1/auth/login', 410], ['POST', '/api/auth/callback/credentials', 410],
    ['POST', '/auth/login', 410], ['POST', '/', 410], ['OPTIONS', '/api/auth/session', 410],
  ]) {
    const response = await probe(PUBLIC_ALIAS, path, method);
    assert.equal(response.status, expected, `Static smoke status mismatch: ${method} ${path.split('?')[0]}`);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.headers['referrer-policy'], 'no-referrer');
    assert.equal(response.headers['set-cookie'], undefined);
    assert.equal(response.headers.location, expected === 303 ? `https://${CANONICAL}/auth/login#` : undefined);
  }
  const direct = await probe(CANONICAL, '/api/auth/providers', 'GET', true);
  assert.ok(detached ? [404, 410, 421].includes(direct.status) : direct.status === 410,
    'Direct Vercel canonical Host remains executable');
  assert.deepEqual(await canonicalSnapshot(probe), expectedCanonical, 'Canonical VPS behavior changed');
}

export async function retireExact(api, journal) {
  for (const id of OLD_IDS) {
    assert.notEqual(id, STATIC_ID);
    const deployment = await api(`/v13/deployments/${id}`);
    assert.equal(deployment.id, id); assert.equal(deployment.projectId, PROJECT);
    await api(`/v13/deployments/${id}`, 'DELETE');
    await journal({ time: new Date().toISOString(), deleted: id });
  }
}

async function run(phase) {
  assert.ok(['capture', 'promote', 'verify-public', 'aliases', 'detach', 'retire'].includes(phase));
  assert.equal(process.getuid(), 0);
  const { token } = JSON.parse(await readFile('/home/openclaw/.local/share/com.vercel.cli/auth.json', 'utf8'));
  const api = async (path, method = 'GET', body) => {
    const url = new URL(path, 'https://api.vercel.com'); assert.equal(url.origin, 'https://api.vercel.com');
    url.searchParams.set('teamId', TEAM);
    const r = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!r.ok) throw new Error(`Vercel request failed: ${method} ${url.pathname}, HTTP ${r.status}`);
    const text = await r.text(); return text ? JSON.parse(text) : {};
  };
  const current = await snapshot(api);
  const deployment = await api(`/v13/deployments/${STATIC_ID}`);
  assertStaticMetadata(deployment); await verifyFiles(api);
  if (phase === 'capture') {
    const record = await privateRead(STAGE_RECORD);
    assertStagedDeployment(deployment, current, record);
    assertPreserved(current);
    await privateCreate(CAPTURE, { project: PROJECT, team: TEAM, staticId: STATIC_ID,
      time: new Date().toISOString(), productionTarget: current.project.targets.production.id,
      beforeServing: servingFingerprint(current), aliases: current.aliases, domains: current.domains,
      oldIds: OLD_IDS, canonical: await canonicalSnapshot() });
  } else {
    const saved = await privateRead(CAPTURE);
    assert.equal(saved.project, PROJECT); assert.equal(saved.team, TEAM); assert.equal(saved.staticId, STATIC_ID);
    assert.deepEqual(saved.oldIds, OLD_IDS);
    if (phase === 'promote') {
      assertPreserved(current); assert.equal(servingFingerprint(current), saved.beforeServing);
      assert.deepEqual(await canonicalSnapshot(), saved.canonical);
      await api(`/v10/projects/${PROJECT}/promote/${STATIC_ID}`, 'POST');
    } else {
      const detached = phase === 'retire';
      assertPreserved(current, { promoted: true, aliasesMoved: ['detach', 'retire'].includes(phase), detached });
      await publicSmoke(httpProbe, saved.canonical, { detached });
      if (phase === 'verify-public') {
        await privateCreate(VERIFIED, { staticId: STATIC_ID, time: new Date().toISOString(), routingSha256: CONFIG_SHA256 });
      } else {
        const receipt = await privateRead(VERIFIED);
        assert.equal(receipt.staticId, STATIC_ID); assert.equal(receipt.routingSha256, CONFIG_SHA256);
        if (phase === 'aliases') {
          for (const alias of LEGACY_ALIASES) await api(`/v2/deployments/${STATIC_ID}/aliases`, 'POST', { alias });
        } else if (phase === 'detach') {
          await api(`/v9/projects/${PROJECT}/domains/${CANONICAL}`, 'DELETE', { removeRedirects: false });
        } else if (phase === 'retire') {
          const file = await open(JOURNAL, 'wx', 0o600);
          const dir = await open('/root', 'r'); try { await dir.sync(); } finally { await dir.close(); }
          try { await retireExact(api, async (entry) => { await file.writeFile(JSON.stringify(entry) + '\n'); await file.sync(); }); }
          finally { await file.close(); }
        }
      }
    }
  }
  console.log(JSON.stringify({ phase, staticId: STATIC_ID, completed: true, time: new Date().toISOString() }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run(process.argv[2]).catch((error) => {
    console.error(error.message.startsWith('Vercel request failed:') ? error.message :
      'Safety check failed; stop and reconcile read-only. No automatic retry or legacy rollback.');
    process.exitCode = 1;
  });
}
