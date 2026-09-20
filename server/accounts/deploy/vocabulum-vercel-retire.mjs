import assert from 'node:assert/strict';
import { readFile, open, lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PROJECT, TEAM, OLD_IDS, snapshot, servingFingerprint } from './vocabulum-vercel-operator.mjs';
import { STATIC_ID as PREVIEW_ID, PRODUCTION_ID as PREVIOUS_ID, CANONICAL, PUBLIC_ALIAS,
  LEGACY_ALIASES, retireExact } from './vocabulum-vercel-close.mjs';
import { HANDOFF_ID, browserPayload, assertHandoffMetadata, verifyFiles, smoke, canonicalState } from './vocabulum-vercel-browser-handoff.mjs';
const CAPTURE = '/root/vocabulum-vercel-final-closure-20260920.json';
const HTTP_RECEIPT = '/root/vocabulum-vercel-browser-handoff-http-verified-20260920.json';
const JOURNAL = '/root/vocabulum-vercel-final-retirement-journal-20260920.jsonl';
const sorted = (a) => [...a].sort();

export function assertClosureState(s, { aliasesMoved = false, detached = false } = {}) {
  assert.equal(s.project.id, PROJECT); assert.equal(s.project.accountId, TEAM); assert.ok(!s.project.link);
  assert.equal(s.project.targets?.production?.id, HANDOFF_ID);
  assert.equal(s.project.ssoProtection?.deploymentType, 'all_except_custom_domains');
  assert.deepEqual(s.envs, []); assert.deepEqual(s.sharedEnvs, []);
  assert.deepEqual(sorted(s.deployments.map((d) => d.uid)), sorted([...OLD_IDS, PREVIEW_ID, PREVIOUS_ID, HANDOFF_ID]));
  assert.ok(s.deployments.every((d) => d.state === 'READY'));
  assert.deepEqual(sorted(s.domains.map((d) => d.name)), sorted(detached ? [PUBLIC_ALIAS] : [PUBLIC_ALIAS, CANONICAL]));
  assert.deepEqual(sorted(s.aliases.map((a) => a.alias)), sorted(detached ? LEGACY_ALIASES : [...LEGACY_ALIASES, CANONICAL]));
  for (const a of s.aliases) {
    const expected = aliasesMoved || !a.alias.includes('git-main') && !a.alias.includes('erikdemko-4215')
      ? HANDOFF_ID : a.alias.includes('git-main') ? OLD_IDS[0] : OLD_IDS[7];
    assert.equal(a.deploymentId, expected);
  }
}
async function privateRead(path) {
  const s = await lstat(path); assert.ok(s.isFile() && !s.isSymbolicLink());
  assert.equal(s.uid, 0); assert.equal(s.nlink, 1); assert.equal(s.mode & 0o777, 0o600);
  return JSON.parse(await readFile(path, 'utf8'));
}
async function rootSync() { const dir = await open('/root', 'r'); try { await dir.sync(); } finally { await dir.close(); } }
async function privateCreate(path, value) {
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
  await rootSync(); assert.deepEqual(await privateRead(path), value);
}
async function run(phase) {
  assert.equal(process.getuid(), 0); assert.ok(['capture', 'aliases', 'detach', 'retire'].includes(phase));
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
  const current = await snapshot(api);
  const options = { aliasesMoved: ['detach', 'retire'].includes(phase), detached: phase === 'retire' };
  assertClosureState(current, options);
  const d = await api(`/v13/deployments/${HANDOFF_ID}`);
  assert.ok(Array.isArray(d.alias) && d.alias.every((a) => [...LEGACY_ALIASES, CANONICAL].includes(a)));
  assertHandoffMetadata(d, HANDOFF_ID, payload, d.alias); await verifyFiles(api, HANDOFF_ID, payload);
  const http = await privateRead(HTTP_RECEIPT);
  assert.equal(http.id, HANDOFF_ID); assert.equal(http.routingSha256, payload.meta.routingSha256);
  assert.equal(http.checks, 13); assert.equal(http.directCanonical410, true);
  const publicResult = await smoke(undefined, { detached: options.detached }); await canonicalState();
  if (phase === 'capture') {
    // Coordinator reviewed actual live Chromium success recorded in commit
    // 28476ab. This is a human-reviewed evidence reference, not a browser runner.
    await privateCreate(CAPTURE, { project: PROJECT, team: TEAM, id: HANDOFF_ID, oldIds: OLD_IDS,
      routingSha256: payload.meta.routingSha256, beforeServing: servingFingerprint(current),
      aliases: current.aliases, domains: current.domains, time: new Date().toISOString(),
      reviewedBrowserEvidenceCommit: '28476ab', browserFixtureVariants: 3, publicResult });
  } else {
    const saved = await privateRead(CAPTURE);
    assert.equal(saved.project, PROJECT); assert.equal(saved.team, TEAM); assert.equal(saved.id, HANDOFF_ID);
    assert.deepEqual(saved.oldIds, OLD_IDS); assert.equal(saved.routingSha256, payload.meta.routingSha256);
    assert.equal(saved.reviewedBrowserEvidenceCommit, '28476ab'); assert.equal(saved.browserFixtureVariants, 3);
    if (phase === 'aliases') {
      assert.equal(saved.beforeServing, servingFingerprint(current));
      for (const a of current.aliases.filter((a) => LEGACY_ALIASES.includes(a.alias) && a.deploymentId !== HANDOFF_ID))
        await api(`/v2/deployments/${HANDOFF_ID}/aliases`, 'POST', { alias: a.alias });
      assertClosureState(await snapshot(api), { aliasesMoved: true });
    } else if (phase === 'detach') {
      await api(`/v9/projects/${PROJECT}/domains/${CANONICAL}`, 'DELETE', { removeRedirects: false });
      assertClosureState(await snapshot(api), { aliasesMoved: true, detached: true });
      await smoke(undefined, { detached: true }); await canonicalState();
    } else {
      const journal = await open(JOURNAL, 'wx', 0o600); await rootSync();
      try { await retireExact(api, async (entry) => { await journal.writeFile(JSON.stringify(entry) + '\n'); await journal.sync(); }); }
      finally { await journal.close(); }
      const after = await snapshot(api);
      assert.deepEqual(sorted(after.deployments.map((entry) => entry.uid)), sorted([PREVIEW_ID, PREVIOUS_ID, HANDOFF_ID]));
      // Reuse the full pre-delete gate with only its known deleted list restored
      // as fixtures; the fresh snapshot still supplies all remaining state.
      assertClosureState({ ...after, deployments: [...after.deployments, ...OLD_IDS.map((uid) => ({ uid, state: 'READY' }))] },
        { aliasesMoved: true, detached: true });
      await smoke(undefined, { detached: true }); await canonicalState();
    }
  }
  console.log(JSON.stringify({ phase, id: HANDOFF_ID, completed: true, publicResult, time: new Date().toISOString() }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) run(process.argv[2]).catch((e) => {
  console.error(e.message.startsWith('Vercel request failed:') ? e.message : 'Safety check failed; stop and reconcile read-only. No automatic retry.'); process.exitCode = 1;
});
