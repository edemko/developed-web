import { createHmac } from 'node:crypto';
// Only for synthetic secrets returned by the labeled disposable provider tests.
export function fixtureTotp(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret].map(c => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const bytes = Buffer.from(bits.match(/.{8}/g).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac('sha1', bytes).update(counter).digest(), offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000).toString().padStart(6, '0');
}
