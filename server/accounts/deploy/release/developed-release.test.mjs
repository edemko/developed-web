import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listApps, loadApp, liveSpec, validate } from './lib/config.mjs';
import { decide, HASHED_ASSET, isNoDeploy, MAX_AUTO_ATTEMPTS, releaseForSource, sourceCandidates } from './lib/gates.mjs';
import { carryForward } from './lib/build.mjs';
import { mkdtempSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { releaseDirOf, releaseNameOf } from './lib/live.mjs';
import { dropinFor, pinGuard } from './hooks/kestrek-notifications.mjs';
import { inlineHashes, missingHashes, siteBlock } from './hooks/csp-hashes.mjs';

const side = (over = {}) => ({ liveSource: 'a'.repeat(40), liveContained: true, liveIsTarget: false, changed: true, manual: false, ...over });
const input = (over = {}) => ({ auto: true, unmarkedChange: true, migrationsChanged: false, migrationsApplied: false,
  force: false, heldAttempts: 0, sides: { web: side(), api: side() }, ...over });

test('deploys every changed side', () => {
  assert.deepEqual(decide(input()), { action: 'deploy', reason: 'deploy web + api', sides: ['web', 'api'] });
  assert.deepEqual(decide(input({ sides: { web: side({ changed: false }), api: side() } })).sides, ['api']);
});

test('[no deploy] skips automatic runs only when every relevant commit is marked', () => {
  assert.equal(decide(input({ unmarkedChange: false })).action, 'skip');
  assert.equal(decide(input({ unmarkedChange: false, auto: false })).action, 'deploy');
  assert.ok(isNoDeploy('docs: x [No Deploy]'));
  assert.ok(!isNoDeploy('fix: pickers'));
});

test('refuses to drop live-only commits', () => {
  const d = decide(input({ sides: { app: side({ liveContained: false }) } }));
  assert.equal(d.action, 'block');
  assert.match(d.reason, /drop live-only commits/);
});

test('blocks on unknown live source, changed manual sides and unapplied migrations', () => {
  assert.equal(decide(input({ sides: { app: side({ liveSource: null }) } })).action, 'block');
  assert.equal(decide(input({ sides: { web: side({ manual: true }) } })).action, 'block');
  assert.equal(decide(input({ migrationsChanged: true })).action, 'block');
  assert.equal(decide(input({ migrationsChanged: true, migrationsApplied: true })).action, 'deploy');
});

test('unchanged manual sides do not block, nothing changed skips, force redeploys', () => {
  assert.deepEqual(decide(input({ sides: { web: side({ manual: true, changed: false }), api: side() } })).sides, ['api']);
  assert.equal(decide(input({ sides: { app: side({ changed: false }) } })).action, 'skip');
  assert.equal(decide(input({ sides: { app: side({ liveIsTarget: true }) } })).action, 'skip');
  assert.equal(decide(input({ force: true, sides: { app: side({ changed: false }) } })).action, 'deploy');
});

test('holds a target after repeated automatic failures', () => {
  assert.equal(decide(input({ heldAttempts: MAX_AUTO_ATTEMPTS })).action, 'skip');
  assert.equal(decide(input({ heldAttempts: MAX_AUTO_ATTEMPTS, auto: false })).action, 'deploy');
});

test('source candidates prefer manifests and fall back to hex tokens, newest last token first', () => {
  assert.deepEqual(sourceCandidates({ name: 'x', manifest: { sourceCommit: 'abcdef1234567' } }), ['abcdef1234567']);
  assert.deepEqual(sourceCandidates({ name: 'release-20260930-validation-78b8221' }), ['78b8221', '20260930']);
  assert.deepEqual(sourceCandidates({ name: '334a7e0cc677-central' }), ['334a7e0cc677']);
  assert.deepEqual(sourceCandidates({ name: 'supabase-d280d1e', knownSources: { 'supabase-d280d1e': 'd280d1eab820' } }),
    ['d280d1eab820', 'd280d1e']);
  assert.deepEqual(sourceCandidates({ name: 'x', deployment: { revision: 'f'.repeat(40) }, revisionFile: 'nope\n' }), ['f'.repeat(40)]);
});

test('release names come from the first segment under the release root', () => {
  const config = { releaseRoot: '/opt/developed-apps/kestrek/releases' };
  assert.equal(releaseNameOf(config, '/opt/developed-apps/kestrek/releases/6593f5cab055/web'), '6593f5cab055');
  assert.equal(releaseDirOf(config, '/opt/developed-apps/kestrek/releases/6593f5cab055/web'), '/opt/developed-apps/kestrek/releases/6593f5cab055');
  assert.equal(releaseNameOf(config, '/opt/developed-static/releases/otazkomat-school-14bc1be9e387'), 'otazkomat-school-14bc1be9e387');
});

test('hashed asset pattern', () => {
  for (const ok of ['chunk-ZLA7I3LM.js', 'main-UVJ7ZVJV.js', 'styles-ABCDEFGH.css', 'index-B3x_Kd9a.js']) assert.ok(HASHED_ASSET.test(ok), ok);
  for (const no of ['index.html', 'developed-support.js', 'favicon.ico', 'chunk-ZLA7I3LM.js.map']) assert.ok(!HASHED_ASSET.test(no), no);
});

test('kestrek guard pinning rewrites exactly the two constants', () => {
  const src = "export const guardPath = '/old';\nexport const nodePath = '/n';\nexport const apiUnit = 'developed-kestrek@old.service';\n";
  const out = pinGuard(src, '/opt/developed-control/kestrek-notifications-abc/g.mjs', 'developed-kestrek@abc.service');
  assert.match(out, /guardPath = '\/opt\/developed-control\/kestrek-notifications-abc\/g\.mjs'/);
  assert.match(out, /apiUnit = 'developed-kestrek@abc\.service'/);
  assert.match(out, /nodePath = '\/n'/);
  assert.throws(() => pinGuard('no constants here', '/g', 'u'), /changed shape/);
  assert.match(dropinFor('developed-kestrek@abc.service', '/g'), /^ExecStartPre=$/m);
});

test('config validation', () => {
  const base = { app: 'x', repo: '/r', branch: 'main', releaseRoot: '/opt/x', onboarded: false, blockers: ['b'],
    sides: { app: { paths: ['a'], switch: { type: 'manual' }, live: { kind: 'symlink', path: '/opt/x/current' } } } };
  assert.doesNotThrow(() => validate(structuredClone(base)));
  assert.throws(() => validate({ ...structuredClone(base), blockers: [] }), /blockers/);
  assert.throws(() => validate({ ...structuredClone(base), auto: true }), /auto requires onboarded/);
  assert.throws(() => validate({ ...structuredClone(base), releaseRoot: '/home/x' }), /releaseRoot/);
  const swap = structuredClone(base);
  swap.sides.app = { paths: ['a'], switch: { type: 'instance-swap', unit: 'developed-x.service' } };
  assert.throws(() => validate(swap), /@\{release\}\.service/);
  assert.deepEqual(liveSpec({ switch: { type: 'instance-swap', unit: 'developed-x@{release}.service' } }),
    { kind: 'units', pattern: 'developed-x@*.service' });
});

test('every shipped app config validates', () => {
  for (const app of listApps()) assert.doesNotThrow(() => loadApp(app), app);
  // Enabling automatic deploys is an owner decision per app: extend this list in the same commit.
  const approvedAuto = ['kestrek', 'myclinic'];
  assert.deepEqual(listApps().filter((app) => loadApp(app).auto), approvedAuto);
});

test('csp-hashes finds inline scripts and handlers, ignores external and data scripts', () => {
  const html = '<script src="main.js"></script><script>alert(1)</script><script type="application/json">{"a":1}</script>'
    + '<link rel="stylesheet" href="s.css" media="print" onload="this.media=\'all\'">';
  const { scripts, handlers } = inlineHashes(html);
  assert.deepEqual(scripts, ["'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='"]);
  assert.equal(handlers.length, 1);
  const caddy = 'http://a.sk, http://b.sk {\n  header CSP "x ' + scripts[0] + '"\n}\nhttp://other.sk {\n ' + handlers[0] + '\n}\n';
  const block = siteBlock(caddy, 'http://a.sk,');
  assert.ok(!block.includes('other.sk'));
  assert.deepEqual(missingHashes(html, block), handlers);
});

test('[no deploy] check does not mask "nothing changed"', () => {
  assert.match(decide(input({ unmarkedChange: false, sides: { app: side({ changed: false }) } })).reason, /nothing deployable/);
  assert.match(decide(input({ unmarkedChange: false })).reason, /marked \[no deploy\]/);
  assert.equal(decide(input({ unmarkedChange: false, force: true })).action, 'deploy');
});

test('rollback targets map back to release names', () => {
  const sha = '78b8221a255d0000000000000000000000000000';
  const releases = ['e2e438a5bae7', 'release-20260930-validation-78b8221', 'release-20260924-staff-picker'];
  assert.equal(releaseForSource({}, releases, sha), 'release-20260930-validation-78b8221');
  assert.equal(releaseForSource({}, ['6593f5cab055'], '6593f5cab055604bf8fa'), '6593f5cab055');
  assert.equal(releaseForSource({ knownSources: { 'supabase-d280d1e': 'd280d1eab820' } }, ['supabase-d280d1e'], 'd280d1eab82042c0'), 'supabase-d280d1e');
  assert.equal(releaseForSource({}, ['release-20260924-staff-picker'], sha), undefined);
});

test('carry-forward copies only the live build\'s own bundles', () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-'));
  const live = join(root, 'live'); const stage = join(root, 'stage');
  mkdirSync(live); mkdirSync(stage);
  for (const f of ['main-AAAAAAAA.js', 'chunk-OLDOLDOL.js', 'chunk-SHAREDSS.js', 'index.html']) writeFileSync(join(live, f), f);
  writeFileSync(join(stage, 'chunk-SHAREDSS.js'), 'new');
  assert.deepEqual(carryForward(stage, live, ['main-AAAAAAAA.js', 'chunk-SHAREDSS.js']), ['main-AAAAAAAA.js']);
  assert.ok(!readdirSync(stage).includes('chunk-OLDOLDOL.js'));
  assert.deepEqual(carryForward(stage, live, null).sort(), ['chunk-OLDOLDOL.js']); // legacy: all missing hashed
});
