import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listApps, loadApp, liveSpec, validate } from './lib/config.mjs';
import { decide, HASHED_ASSET, MAX_AUTO_ATTEMPTS, sourceCandidates } from './lib/gates.mjs';
import { releaseDirOf, releaseNameOf } from './lib/live.mjs';
import { dropinFor, pinGuard } from './hooks/kestrek-notifications.mjs';

const side = (over = {}) => ({ liveSource: 'a'.repeat(40), liveContained: true, liveIsTarget: false, changed: true, manual: false, ...over });
const input = (over = {}) => ({ auto: true, subject: 'feat: x', migrationsChanged: false, migrationsApplied: false,
  force: false, heldAttempts: 0, sides: { web: side(), api: side() }, ...over });

test('deploys every changed side', () => {
  assert.deepEqual(decide(input()), { action: 'deploy', reason: 'deploy web + api', sides: ['web', 'api'] });
  assert.deepEqual(decide(input({ sides: { web: side({ changed: false }), api: side() } })).sides, ['api']);
});

test('[no deploy] skips only automatic runs', () => {
  assert.equal(decide(input({ subject: 'docs: x [no deploy]' })).action, 'skip');
  assert.equal(decide(input({ subject: 'docs: x [No Deploy]', auto: false })).action, 'deploy');
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
  assert.ok(listApps().every((app) => !loadApp(app).auto), 'auto must be enabled deliberately, per app');
});
