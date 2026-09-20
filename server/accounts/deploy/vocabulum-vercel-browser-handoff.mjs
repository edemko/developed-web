import assert from 'node:assert/strict';
import { readFile, open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import https from 'node:https';
import { PROJECT, TEAM, OLD_IDS, ENV_NAMES, CONFIG_SHA256, snapshot, servingFingerprint } from './vocabulum-vercel-operator.mjs';
import { STATIC_ID as PREVIEW_ID, PRODUCTION_ID as PREVIOUS_ID, CANONICAL, PUBLIC_ALIAS,
  LEGACY_ALIASES } from './vocabulum-vercel-close.mjs';

export const DESTINATION = 'https://vocabulum.developed.sk/auth/login#';
export const HANDOFF_ID = 'dpl_FUDnzBVCZ2FPNHceyC8TuYbSiCpZ';
export const HANDOFF_HOST = 'vocabulary-builder-5j102456o-erik-demkos-projects.vercel.app';
export const HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><meta http-equiv="refresh" content="0;url=${DESTINATION}"><title>Vocabulum has moved</title></head><body><p>Vocabulum has moved.</p><a href="${DESTINATION}" rel="noreferrer" referrerpolicy="no-referrer">Continue to Vocabulum</a></body></html>\n`;
const RECORD = '/root/vocabulum-vercel-browser-handoff-stage-20260920.json';
const VERIFIED = '/root/vocabulum-vercel-browser-handoff-http-verified-20260920.json';
const DEFAULT_ALIAS = 'vocabulary-builder-erik-demkos-projects.vercel.app';
const PURPOSE = 'vocabulum-static-browser-handoff-20260920';
const digest = (s) => createHash('sha256').update(s).digest('hex');
const sorted = (a) => [...a].sort();

export function browserPayload(configText) {
  assert.equal(digest(configText), CONFIG_SHA256);
  const routes = JSON.parse(configText).routes.map((route) => {
    if (route.status !== 303) return route;
    const { Location, ...headers } = route.headers;
    assert.equal(Location, DESTINATION);
    return { ...route, status: 200, dest: '/handoff.html', headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } };
  });
  const config = { version: 2, framework: null, buildCommand: '', installCommand: '',
    git: { deploymentEnabled: false }, routes };
  const files = [{ file: 'vercel.json', data: JSON.stringify(config), encoding: 'utf-8' },
    { file: 'handoff.html', data: HTML, encoding: 'utf-8' }];
  return { name: 'vocabulary-builder', project: PROJECT, target: 'production', autoAssignCustomDomains: false,
    files, projectSettings: { framework: null, buildCommand: '', installCommand: '', outputDirectory: null, rootDirectory: null },
    meta: { purpose: PURPOSE, routingSha256: digest(files[0].data) } };
}

export function assertBefore(s) {
  assert.equal(s.project.id, PROJECT); assert.equal(s.project.accountId, TEAM); assert.ok(!s.project.link);
  assert.equal(s.project.ssoProtection?.deploymentType, 'all_except_custom_domains');
  assert.equal(s.project.targets?.production?.id, PREVIOUS_ID);
  assert.deepEqual(s.envs, []); assert.deepEqual(s.sharedEnvs, []);
  assert.deepEqual(sorted(s.deployments.map((d) => d.uid)), sorted([...OLD_IDS, PREVIEW_ID, PREVIOUS_ID]));
  assert.ok(s.deployments.every((d) => d.state === 'READY'));
  assert.deepEqual(sorted(s.domains.map((d) => d.name)), sorted([PUBLIC_ALIAS, CANONICAL]));
  assert.deepEqual(sorted(s.aliases.map((a) => a.alias)), sorted([...LEGACY_ALIASES, CANONICAL]));
  for (const alias of s.aliases) {
    const expected = [PUBLIC_ALIAS, CANONICAL, DEFAULT_ALIAS].includes(alias.alias) ? PREVIOUS_ID
      : alias.alias.includes('git-main') ? OLD_IDS[0] : OLD_IDS[7];
    assert.equal(alias.deploymentId, expected);
  }
}

export function assertHandoffMetadata(d, id, payload, expectedAliases = [DEFAULT_ALIAS]) {
  assert.equal(d.id, id); assert.equal(d.projectId, PROJECT); assert.equal(d.readyState, 'READY');
  assert.equal(d.target, 'production'); assert.deepEqual(sorted(d.alias), sorted(expectedAliases));
  assert.equal(d.meta?.purpose, PURPOSE); assert.equal(d.meta?.routingSha256, payload.meta.routingSha256);
  for (const key of ['functions', 'builds', 'crons']) assert.ok(d[key] == null
    || (typeof d[key] === 'object' && Object.keys(d[key]).length === 0));
  for (const env of [d.env, d.build?.env]) {
    assert.ok(Array.isArray(env) && env.every((name) => typeof name === 'string' && /^[A-Z_][A-Z0-9_]*$/.test(name)));
    assert.ok(ENV_NAMES.every((name) => !env.includes(name)));
  }
}

async function canonicalState() {
  const root = await fetch(`https://${CANONICAL}/`, { redirect: 'manual' });
  assert.equal(root.status, 200);
  const providers = await fetch(`https://${CANONICAL}/api/auth/providers`, { redirect: 'manual' });
  assert.equal(providers.status, 200); assert.deepEqual(Object.keys(await providers.json()), ['credentials']);
}
async function readRecord(path = RECORD) {
  const s = await lstat(path); assert.ok(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, 0); assert.equal(s.nlink, 1); assert.equal(s.mode & 0o777, 0o600);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function saveRecord(value, path = RECORD) {
  const f = await open(path, 'wx', 0o600);
  try { await f.writeFile(JSON.stringify(value)); await f.sync(); } finally { await f.close(); }
  const dir = await open('/root', 'r'); try { await dir.sync(); } finally { await dir.close(); }
  assert.deepEqual(await readRecord(path), value);
}

function probe(host, path, method = 'GET', direct = false) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: direct ? HANDOFF_HOST : host, servername: host, method, path,
      headers: { Host: host, 'User-Agent': 'Mozilla/5.0 (Vocabulum migration check)' } }, (res) => {
      let body = ''; res.on('data', (part) => { body += part; if (body.length > 100000) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
    req.end(method === 'POST' ? 'fixture=nonsecret' : undefined);
  });
}
export async function smoke(probeFn = probe) {
  let checks = 0;
  for (const [method, path, status] of [
    ['GET', '/?code=fixture-code&token=fixture-token', 200], ['HEAD', '/auth/login?next=https://untrusted.invalid', 200],
    ['GET', '/reset-password?token=fixture-token', 200], ['GET', '/folders/fixture', 200],
    ['GET', '/api/auth/providers', 410], ['GET', '/api/auth/session', 410],
    ['GET', '/api/auth/callback/developed?code=fixture-code&state=fixture-state', 410],
    ['POST', '/api/v1/auth/login', 410], ['POST', '/api/auth/callback/credentials', 410],
    ['POST', '/auth/login', 410], ['POST', '/', 410], ['OPTIONS', '/api/auth/session', 410],
  ]) {
    const r = await probeFn(PUBLIC_ALIAS, path, method); assert.equal(r.status, status);
    assert.equal(r.headers.location, undefined); assert.equal(r.headers['set-cookie'], undefined);
    assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
    if (status === 200 && method === 'GET') assert.equal(r.body, HTML);
    checks++;
  }
  const direct = await probeFn(CANONICAL, '/api/auth/providers', 'GET', true); assert.equal(direct.status, 410);
  return { navigation200: 4, protocol410: 8, directCanonical410: true, checks: checks + 1 };
}

export function assertPromoted(s) {
  assert.equal(s.project.targets?.production?.id, HANDOFF_ID);
  assert.deepEqual(sorted(s.deployments.map((d) => d.uid)), sorted([...OLD_IDS, PREVIEW_ID, PREVIOUS_ID, HANDOFF_ID]));
  assert.ok(s.deployments.every((d) => d.state === 'READY'));
  // Reduce only the three explicitly promoted bindings and target to the pinned
  // prior state, then apply its complete Git/protection/env/domain/alias gate.
  assertBefore({ ...s, project: { ...s.project, targets: { ...s.project.targets, production: { id: PREVIOUS_ID } } },
    deployments: s.deployments.filter((d) => d.uid !== HANDOFF_ID),
    aliases: s.aliases.map((a) => {
      if (![PUBLIC_ALIAS, CANONICAL, DEFAULT_ALIAS].includes(a.alias)) return a;
      assert.equal(a.deploymentId, HANDOFF_ID); return { ...a, deploymentId: PREVIOUS_ID };
    }) });
}
async function verifyFiles(api, id, payload) {
  const files = [];
  function walk(entries, parent = '') { for (const f of entries) {
    const path = parent ? `${parent}/${f.name}` : f.name;
    if (f.type === 'directory') walk(f.children ?? [], path);
    else { assert.equal(f.type, 'file'); files.push({ path, uid: f.uid }); }
  } }
  walk(await api(`/v6/deployments/${id}/files`));
  assert.deepEqual(sorted(files.map((f) => f.path)), sorted(payload.files.map((f) => `src/${f.file}`)));
  for (const file of files) {
    assert.match(file.uid, /^[a-zA-Z0-9_-]+$/);
    const r = await api(`/v8/deployments/${id}/files/${file.uid}`);
    assert.equal(digest(Buffer.from(r.data, 'base64')), digest(payload.files.find((f) => `src/${f.file}` === file.path).data));
  }
}
async function run(phase) {
  assert.equal(process.getuid(), 0); assert.ok(['stage', 'inspect', 'promote', 'verify-public'].includes(phase));
  const { token } = JSON.parse(await readFile('/home/openclaw/.local/share/com.vercel.cli/auth.json', 'utf8'));
  const api = async (path, method = 'GET', body) => {
    const url = new URL(path, 'https://api.vercel.com'); assert.equal(url.origin, 'https://api.vercel.com'); url.searchParams.set('teamId', TEAM);
    const r = await fetch(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!r.ok) throw new Error(`Vercel request failed: ${method} ${url.pathname}, HTTP ${r.status}`);
    const raw = await r.text(); return raw ? JSON.parse(raw) : {};
  };
  const payload = browserPayload(await readFile(new URL('./vocabulum-vercel-retirement/config.json', import.meta.url), 'utf8'));
  const current = await snapshot(api); await canonicalState();
  if (phase === 'stage') {
    assertBefore(current);
    try { await lstat(RECORD); throw new Error('Stage exists; inspect only'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const d = await api('/v13/deployments?skipAutoDetectionConfirmation=1', 'POST', payload);
    assert.match(d.id, /^dpl_[a-zA-Z0-9]+$/); assert.ok(![...OLD_IDS, PREVIEW_ID, PREVIOUS_ID].includes(d.id));
    await saveRecord({ id: d.id, project: PROJECT, team: TEAM, beforeServing: servingFingerprint(current),
      url: d.url, routingSha256: payload.meta.routingSha256, time: new Date().toISOString() });
    console.log(JSON.stringify({ phase, id: d.id, url: d.url, readyState: d.readyState, target: d.target, completed: true }));
  } else {
    const record = await readRecord(); assert.equal(record.project, PROJECT); assert.equal(record.team, TEAM);
    assert.equal(record.id, HANDOFF_ID); assert.equal(record.routingSha256, payload.meta.routingSha256);
    const d = await api(`/v13/deployments/${record.id}`);
    assertHandoffMetadata(d, record.id, payload, phase === 'verify-public' ? [DEFAULT_ALIAS, PUBLIC_ALIAS, CANONICAL] : undefined);
    await verifyFiles(api, record.id, payload);
    if (phase === 'verify-public') {
      assertPromoted(current);
      const result = await smoke(); await canonicalState();
      await saveRecord({ id: HANDOFF_ID, routingSha256: payload.meta.routingSha256,
        time: new Date().toISOString(), ...result, browserVerificationStillRequired: true }, VERIFIED);
      console.log(JSON.stringify({ phase, id: HANDOFF_ID, ...result, canonicalVpsUnchanged: true, completed: true }));
      return;
    }
    const expected = JSON.parse(record.beforeServing);
    const alias = expected.aliases.find(([name]) => name === DEFAULT_ALIAS); assert.equal(alias[1], PREVIOUS_ID); alias[1] = record.id;
    assert.equal(servingFingerprint(current), JSON.stringify(expected));
    assert.equal(current.deployments.filter((entry) => entry.uid === record.id).length, 1);
    assertBefore({ ...current, deployments: current.deployments.filter((entry) => entry.uid !== record.id),
      aliases: current.aliases.map((a) => a.alias === DEFAULT_ALIAS ? { ...a, deploymentId: PREVIOUS_ID } : a) });
    if (phase === 'promote') {
      await api(`/v10/projects/${PROJECT}/promote/${HANDOFF_ID}`, 'POST', {});
      console.log(JSON.stringify({ phase, id: HANDOFF_ID, completed: true })); return;
    }
    console.log(JSON.stringify({ phase, id: record.id, url: d.url, exactTwoFiles: true, zeroApplicationEnv: true,
      zeroFunctionsBuildsCrons: true, all28Preserved: true, onlyDefaultAliasAdvanced: true,
      canonicalVpsUnchanged: true, frameworkLabel: d.projectSettings?.framework, completed: true }));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(process.argv[2]).catch((e) => {
  console.error(e.message.startsWith('Vercel request failed:') ? e.message : 'Safety check failed; stop and reconcile read-only.'); process.exitCode = 1;
});
