import test from 'node:test';
import assert from 'node:assert/strict';
import { Accounts } from '../dist/accounts.js';
import { unseal } from '../dist/security.js';

const encryptionKey = Buffer.alloc(32, 7);

test('registration queues a localized alert for every confirmed superadmin', async () => {
  const writes = [];
  const query = async (sql, args = []) => {
    if (sql.startsWith('select name from core.apps')) {
      assert.deepEqual(args, ['app_mega_music']);
      return [{ name: 'Mega Music' }];
    }
    if (sql.startsWith('select u.email')) {
      assert.match(sql, /p\.role='SUPERADMIN'/);
      assert.match(sql, /u\.email_confirmed_at is not null/);
      return [
        { email: 'admin-en@example.test', language: 'en' },
        { email: 'admin-sk@example.test', language: 'sk' },
      ];
    }
    if (sql.startsWith('insert into accounts.outbox')) {
      writes.push(args);
      return [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const accounts = new Accounts({}, {}, {
    origin: 'https://megamusic.developed.sk',
    portalOrigin: 'https://www.developed.sk',
    mailBrand: 'mega-music',
    encryptionKey,
    supportEmail: 'info@developed.sk',
  });

  await accounts.notifySuperadmins(query, { email: 'new@example.test', displayName: '<New User>' }, 'app_mega_music');

  assert.equal(writes.length, 2);
  const messages = writes.map(([id, payload]) => unseal(payload, encryptionKey, `mail:${id}`));
  assert.deepEqual(messages.map(message => message.to), ['admin-en@example.test', 'admin-sk@example.test']);
  for (const message of messages) {
    assert.ok(message.text.includes('new@example.test'));
    assert.ok(message.text.includes('<New User>'));
    assert.ok(message.text.includes('Mega Music'));
    assert.ok(message.text.includes('https://www.developed.sk/admin/users'));
    assert.equal(message.brand, undefined);
    assert.ok(message.html.includes('&lt;New User&gt;'));
    assert.doesNotMatch(message.html, /<New User>/);
  }
  assert.notEqual(messages[0].subject, messages[1].subject);
});

test('portal registration is labelled DevelopED without an app lookup', async () => {
  const writes = [];
  const query = async (sql, args = []) => {
    if (sql.startsWith('select u.email')) return [{ email: 'admin@example.test', language: 'en' }];
    if (sql.startsWith('insert into accounts.outbox')) { writes.push(args); return []; }
    throw new Error(`Unexpected query: ${sql}`);
  };
  const accounts = new Accounts({}, {}, {
    origin: 'https://www.developed.sk', encryptionKey, supportEmail: 'info@developed.sk',
  });

  await accounts.notifySuperadmins(query, { email: 'new@example.test', displayName: 'New User' }, null);

  assert.equal(writes.length, 1);
  const [id, payload] = writes[0];
  const message = unseal(payload, encryptionKey, `mail:${id}`);
  assert.match(message.text, /Application: DevelopED/);
});
