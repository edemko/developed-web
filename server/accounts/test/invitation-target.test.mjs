import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { unseal } from '../dist/security.js';

function fixture(slug = 'airsoft') {
  const encryptionKey = randomBytes(32), writes = [];
  const query = async (sql, args = []) => {
    if (sql.startsWith('select a.slug,a.launch_url')) {
      assert.deepEqual(args, ['app_airsoft']);
      return [{ slug, launch_url: 'https://amp.developed.sk/api/auth/ecosystem/login' }];
    }
    writes.push({ sql, args });
    return [];
  };
  const accounts = new Accounts({ query }, {}, {
    origin: 'https://www.developed.sk', encryptionKey, insecureLocal: false,
  });
  return { accounts, encryptionKey, query, writes };
}

test('an Airsoft invitation keeps its credential in the fragment and opens the localized Marketplace form', async () => {
  const f = fixture();
  await f.accounts.credential(f.query, null, 'invited@example.invalid', 'invitation', 'sk', 'app_airsoft');
  const credential = f.writes.find(write => write.sql.startsWith('insert into accounts.credentials'));
  assert.equal(credential.args[6], 'app_airsoft');
  const outbox = f.writes.find(write => write.sql.startsWith('insert into accounts.outbox'));
  const mail = unseal(outbox.args[1], f.encryptionKey, `mail:${outbox.args[0]}`);
  assert.match(mail.text, /https:\/\/amp\.developed\.sk\/sk\/signup#invitation=[A-Za-z0-9_-]{43}/);
  assert.doesNotMatch(mail.text, /[?&]invitation=/);
  assert.doesNotMatch(mail.text, /api\/auth\/ecosystem\/login/);
});

test('an unsupported app cannot become an invitation destination', async () => {
  const f = fixture('other');
  await assert.rejects(
    f.accounts.credential(f.query, null, 'invited@example.invalid', 'invitation', 'en', 'app_airsoft'),
    error => error.code === 'invalid_invitation_target',
  );
  assert.deepEqual(f.writes, []);
});
