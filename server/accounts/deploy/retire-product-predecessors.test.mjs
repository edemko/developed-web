import test from 'node:test';
import assert from 'node:assert/strict';
import { activeConnections, execute, oldUnits, oldContainers, newUnits } from './retire-product-predecessors.mjs';
test('drain counts both sides and families; permits only LISTEN/TIME_WAIT', () => {
  const row = (local, remote, state) => `0: ${local} ${remote} ${state} 0 0 0 0 0 0`;
  const header = 'sl local_address rem_address st';
  for (const state of ['01', '02', '03', '04', '05', '07', '08', '09', '0B'])
    assert.equal(activeConnections(`${header}\n${row('0100007F:0C34', '00000000:0000', state)}`), 1);
  assert.equal(activeConnections(`${header}\n${row('00000000000000000000000000000000:0C34', '00000000:0000', '0A')}`), 0);
  assert.equal(activeConnections(`${header}\n${row('0100007F:AA00', '0100007F:0C34', '01')}`), 1);
  assert.equal(activeConnections(`${header}\n${row('0100007F:AA00', '0100007F:0C34', '06')}`), 0);
  assert.equal(activeConnections(`${header}\n${row('0100007F:0C5C', '0100007F:AA00', '01')}`), 0);
  assert.equal(activeConnections(`${header}\n${row('00000000:0BB8', '00000000:AA00', '01')}`, new Set([3000])), 1);
  assert.equal(activeConnections(`${header}\n${row('00000000:0BB8', '00000000:AA00', '0A')}`, new Set([3000])), 0);
});
test('only exact approved predecessors and six app candidates are inventoried', () => {
  assert.equal(oldUnits.length, 5); assert.equal(oldContainers.length, 2); assert.equal(newUnits.length, 6);
  assert.equal(new Set([...oldUnits, ...newUnits].map(row => row.find(value => typeof value === 'string'))).size, 11);
  for (const [name, id] of oldContainers) { assert.ok(['airsoft-marketplace', 'voc-builder'].includes(name)); assert.match(id, /^[a-f0-9]{64}$/); }
});
test('developer cannot retire any process', { skip: process.getuid() === 0 }, async () => assert.rejects(execute('--apply')));
