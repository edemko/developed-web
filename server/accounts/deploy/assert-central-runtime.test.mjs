import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCentral, identities } from './assert-central-runtime.mjs';
test('only exact isolated UID and enabled central settings start', () => {
  for (const [slug, uid] of Object.entries(identities)) {
    const env = { ECOSYSTEM_AUTH_ENABLED: 'true', NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED: 'true' };
    assert.doesNotThrow(() => assertCentral(slug, env, uid));
    assert.throws(() => assertCentral(slug, env, 1000));
    assert.throws(() => assertCentral(slug, { ...env, ECOSYSTEM_AUTH_ENABLED: 'false' }, uid));
    for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_JWT_SECRET', 'JWT_SECRET', 'GOTRUE_JWT_SECRET', 'MAILJET_API_KEY', 'MAILJET_SECRET_KEY']) {
      assert.throws(() => assertCentral(slug, { ...env, [key]: 'fixture-secret' }, uid));
      assert.doesNotThrow(() => assertCentral(slug, { ...env, [key]: '' }, uid));
    }
  }
  assert.throws(() => assertCentral('screentime', { ECOSYSTEM_AUTH_ENABLED: 'true' }, 983));
  assert.throws(() => assertCentral('other-app', { ECOSYSTEM_AUTH_ENABLED: 'true' }, 984));
});
