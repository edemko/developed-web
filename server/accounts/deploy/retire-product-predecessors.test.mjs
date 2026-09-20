import test from 'node:test';
import assert from 'node:assert/strict';
import { activeConnections, listeners, assertStoppedScreen143, assertResumeCheckpoint,
  execute, oldUnits, oldContainers, newUnits } from './retire-product-predecessors.mjs';
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

const stoppedScreen = { MainPID: '0', ControlPID: '0', ActiveState: 'failed', UnitFileState: 'disabled',
  Result: 'exit-code', ExecMainCode: '1', ExecMainStatus: '143', NRestarts: '0' };
function resumeFixture() {
  const before = {
    routeHash: '501bbc47de35e94a45c24b9281b1e88ac918ae75d02750fd70c8f13bb1c63946',
    originals: oldUnits.map(([user, name, pid]) => ({ user, name, MainPID: String(pid), ActiveState: 'active', UnitFileState: 'enabled' })),
    containers: oldContainers.map(([name, id, pid]) => ({ name: `/${name}`, id, pid, running: true, restart: 'unless-stopped' })),
    candidates: newUnits.map(([name, uid], i) => ({ name, uid, MainPID: String(10000 + i), ActiveState: 'active', UnitFileState: 'disabled' })),
  };
  const current = structuredClone(before);
  for (const state of [...current.originals, ...current.candidates]) state.ControlPID = '0';
  for (const state of current.candidates) state.UnitFileState = 'enabled';
  for (const state of current.originals.slice(0, 2)) Object.assign(state, { MainPID: '0', ActiveState: 'inactive', UnitFileState: 'disabled' });
  Object.assign(current.originals[2], stoppedScreen);
  const retired = current.originals.slice(0, 2).map((state) => ({ ...state, time: '2026-09-20T20:00:00Z' }));
  return { before, current, retired };
}
test('Screen exception accepts only precisely stopped failed exit143 without control process or restarts', () => {
  assertStoppedScreen143(stoppedScreen);
  for (const [key, value] of Object.entries({ MainPID: '401984', ControlPID: '123', ActiveState: 'active', UnitFileState: 'enabled',
    Result: 'signal', ExecMainCode: '2', ExecMainStatus: '0', NRestarts: '1' }))
    assert.throws(() => assertStoppedScreen143({ ...stoppedScreen, [key]: value }));
});
test('resume requires exact original checkpoint, two completed Mega records, untouched remainder and unchanged enabled candidates', () => {
  const fixture = resumeFixture(); assertResumeCheckpoint(fixture.before, fixture.current, fixture.retired);
  for (const change of [
    (f) => { f.before.routeHash = 'other'; }, (f) => { f.before.originals[2].MainPID = 'wrong'; },
    (f) => { f.before.originals.reverse(); }, (f) => { f.retired.pop(); },
    (f) => { f.current.originals[0].MainPID = '123'; }, (f) => { f.retired[1].UnitFileState = 'enabled'; },
    (f) => { f.current.originals[2].ExecMainStatus = '137'; }, (f) => { f.current.originals[3].MainPID = '0'; },
    (f) => { f.current.originals[4].UnitFileState = 'disabled'; }, (f) => { f.current.containers[0].restart = 'no'; },
    (f) => { f.current.containers[1].pid = 123; }, (f) => { f.current.candidates[0].MainPID = '123'; },
    (f) => { f.current.candidates[4].UnitFileState = 'static'; }, (f) => { f.current.candidates[2].uid = 0; },
  ]) { const changed = resumeFixture(); change(changed);
    assert.throws(() => assertResumeCheckpoint(changed.before, changed.current, changed.retired)); }
});
test('stopped listener proof counts IPv4/IPv6 local3127 only, including LISTEN despite quiet drain', () => {
  const header = 'sl local_address rem_address st\n';
  const row = '0: 00000000000000000000000000000000:0C37 00000000:0000 0A 0 0 0 0 0 0';
  assert.equal(activeConnections(header + row), 0);
  assert.equal(listeners(header + row, new Set([3127])), 1);
  assert.equal(listeners(header + row, new Set([3124])), 0);
});
test('developer cannot invoke narrow resume or an unrecognized mode', { skip: process.getuid() === 0 }, async () => {
  await assert.rejects(execute('--resume-screen-143')); await assert.rejects(execute('--resume'));
});
