import test from 'node:test';
import assert from 'node:assert/strict';
import { pathsForRevision, validateManifest, rewriteMarketingEnvironment, mailWorkerDropIn, MARKETING_FILES, OLD_MARKETING } from './portal-upgrade-input.mjs';
import { sourceHash } from './browser-session-broker-routes.mjs';

const revision = 'a'.repeat(40);
const manifest = () => ({ version: 1, revision, sourceCaddySha256: sourceHash, applicationManifestSha256: 'b'.repeat(64), mailBundleManifestSha256: 'c'.repeat(64), marketingSha256: Object.fromEntries(MARKETING_FILES.map(file => [file, 'd'.repeat(64)])) });

test('upgrade manifest accepts only pinned revision, artifact digests, four public files and exact Caddy baseline', () => {
  assert.equal(validateManifest(manifest()).release, `/opt/developed-accounts/releases/${revision}`);
  for (const modify of [
    value => { value.revision = '../current'; }, value => { value.revision = 'abcdef0'; },
    value => { value.sourceCaddySha256 = '0'.repeat(64); }, value => { value.applicationManifestSha256 = 'unknown'; },
    value => { value.marketingSha256['.env'] = 'f'.repeat(64); }, value => { delete value.marketingSha256['en/index.html']; },
    value => { value.secret = 'not-allowed'; }, value => { value.version = 2; }, value => { value.marketingSha256 = null; },
  ]) { const input = manifest(); modify(input); assert.throws(() => validateManifest(input)); }
  for (const value of [null, undefined, [], '../x', 'A'.repeat(40), 'a'.repeat(41)]) assert.throws(() => pathsForRevision(value));
});

test('environment transform changes exactly one marketing value and never exposes secrets in errors', () => {
  const fixtureSecret = 'PRIVATE_FIXTURE_VALUE';
  const source = `# retained comments\nACCOUNTS_ENCRYPTION_KEY=${fixtureSecret}\nACCOUNTS_MARKETING_DIR=${OLD_MARKETING}\nACCOUNTS_MAIL_ENABLED=false\nOTHER_VALUE= a b = c \n`;
  const candidate = rewriteMarketingEnvironment(source, revision);
  assert.equal(candidate, source.replace(OLD_MARKETING, `/opt/developed-accounts/marketing/${revision}`));
  assert.equal(candidate.replace(`/opt/developed-accounts/marketing/${revision}`, OLD_MARKETING), source);
  for (const value of [source.replace('=false', '=true'), source + `ACCOUNTS_MARKETING_DIR=${OLD_MARKETING}\n`, source + 'ACCOUNTS_MAIL_ENABLED=false\n', source.replace(OLD_MARKETING, '/other'), source.replaceAll('\n', '\r\n')]) {
    assert.throws(() => rewriteMarketingEnvironment(value, revision), error => !String(error).includes(fixtureSecret));
  }
});

test('mail worker drop-in changes only two command lists; no hardening, environment or lifecycle overrides', () => {
  const dropIn = mailWorkerDropIn(revision);
  assert.equal(dropIn.split('\n').filter(Boolean).length, 5);
  assert.match(dropIn, /ExecStartPre=\+\/opt\/developed-runtimes\/node-v22\.23\.2\/bin\/node /);
  assert.match(dropIn, new RegExp(`/opt/developed-accounts/mail-workers/${revision}/central-mail-worker-guard\\.mjs`));
  assert.doesNotMatch(dropIn, /Environment|LoadCredential|PartOf|WorkingDirectory|User=|Group=|InaccessiblePaths|Protect|Restart=/);
});
