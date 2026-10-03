import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAccountServer } from '../dist/http.js';
import { Accounts } from '../dist/accounts.js';

test('anonymous catalog excludes a private app while authenticated picker includes it', async t => {
  const publicApp = { id: 'public', name: 'Public' }, privateApp = { id: 'app_karak2', name: 'Karak II' };
  const db = { limit: async () => {}, query: async sql => {
    if (sql.includes('from accounts.app_settings')) return sql.includes('a.public_listing') ? [publicApp] : [publicApp, privateApp];
    throw Error('Unexpected query');
  } };
  const accounts = new Accounts(db, {}, { origin: 'http://127.0.0.1', insecureLocal: true });
  accounts.bootstrap = async cookie => ({ session: {}, user: cookie === 'signed-in' ? { id: 'user' } : undefined });
  const server = createAccountServer(accounts); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual((await (await fetch(origin + '/api/account/catalog')).json()).apps.map(x => x.id), ['public']);
  assert.equal((await fetch(origin + '/api/account/apps')).status, 401);
  assert.deepEqual((await (await fetch(origin + '/api/account/apps', { headers: { Cookie: 'developed_local=signed-in' } })).json()).apps.map(x => x.id), ['public', 'app_karak2']);
});
