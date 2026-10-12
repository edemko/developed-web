import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Accounts } from '../dist/accounts.js';
import { unseal } from '../dist/security.js';

function fixture(available = true) {
  const encryptionKey = randomBytes(32), writes = [];
  const query = async (sql, args = []) => {
    if (sql.startsWith('select a.slug from accounts.app_settings')) {
      assert.match(sql, /a\.published and a\.join_policy<>'closed' and c\.status='ACTIVE'/);
      return available ? [{ slug: args[0] === 'app_vocabulum' ? 'vocabulum' : 'airsoft' }] : [];
    }
    writes.push({ sql, args });
    return [];
  };
  const accounts = new Accounts({ query }, {}, {
    origin: 'https://www.developed.sk', encryptionKey, insecureLocal: false,
  });
  return { accounts, encryptionKey, query, writes };
}

// Password management happens only on the developed site: every invitation, for any
// open app, lands on central /register. The preview tells the page which app to return to.
for (const appId of ['app_airsoft', 'app_vocabulum']) {
  test(`an invitation for ${appId} keeps its credential in the fragment and opens central /register`, async () => {
    const f = fixture();
    await f.accounts.credential(f.query, null, 'invited@example.invalid', 'invitation', 'sk', appId);
    const credential = f.writes.find(write => write.sql.startsWith('insert into accounts.credentials'));
    assert.equal(credential.args[6], appId);
    const outbox = f.writes.find(write => write.sql.startsWith('insert into accounts.outbox'));
    const mail = unseal(outbox.args[1], f.encryptionKey, `mail:${outbox.args[0]}`);
    assert.match(mail.text, /https:\/\/www\.developed\.sk\/register#invitation=[A-Za-z0-9_-]{43}/);
    assert.doesNotMatch(mail.text, /amp\.developed\.sk|\/signup/);
    assert.doesNotMatch(mail.text, /[?&]invitation=/);
  });
}

test('an unavailable app cannot become an invitation destination', async () => {
  const f = fixture(false);
  await assert.rejects(
    f.accounts.credential(f.query, null, 'invited@example.invalid', 'invitation', 'en', 'app_airsoft'),
    error => error.code === 'invalid_invitation_target',
  );
  assert.deepEqual(f.writes, []);
});
