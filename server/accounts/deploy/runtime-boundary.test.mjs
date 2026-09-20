import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { collect, parseServiceMetadata } from './audit-runtime-boundary.mjs';

test('metadata parser discards env/command fields even if accidentally supplied', () => {
  const actual = parseServiceMetadata('Id=app.service\nUser=app\nEnvironment=SECRET\nExecStart=SECRET\n\nId=other.service\nMainPID=123');
  assert.deepEqual(actual, [{ Id: 'app.service', User: 'app' }, { Id: 'other.service', MainPID: '123' }]);
});

test('collector uses only explicit read-only metadata calls and redacts failure output', () => {
  const calls = [];
  const report = collect((command, args) => {
    calls.push([command, args]);
    if (command === 'id') throw new Error('PRIVATE_CHILD_STDERR');
    return command === 'systemctl' ? 'Id=app.service\nUser=app\n' : 'fixture metadata';
  });
  assert.deepEqual(report.failures, ['developerGroups']);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_CHILD_STDERR/);
  for (const [command, args] of calls) {
    assert.ok(['systemctl', 'id', 'ss', 'docker'].includes(command));
    assert.doesNotMatch(args.join(' '), /Environment|ExecStart|\.Config\.Env|\.Config\.Cmd|\.Args|logs|restart|stop|start|create|connect|exec/);
    if (command === 'docker' && args[0] === 'inspect') assert.equal(args[1], '--format');
  }
});

test('unit isolates runtime filesystem and requires distinct nonprivileged service identity', () => {
  const source = readFileSync(new URL('./ecosystem-app@.service', import.meta.url), 'utf8');
  for (const directive of ['User=developed-%i', 'Group=developed-%i', 'ProtectHome=true',
    'ProtectSystem=strict', 'NoNewPrivileges=true', 'CapabilityBoundingSet=',
    'InaccessiblePaths=-/run/docker.sock -/var/run/docker.sock']) assert.ok(source.includes(directive));
  assert.doesNotMatch(source, /User=root|User=openclaw|SupplementaryGroups=(docker|sudo)|\/home\/openclaw/);
});

test('systemd template syntax verifies without starting any service', t => {
  try { execFileSync('systemd-analyze', ['--version'], { stdio: 'ignore' }); }
  catch { t.skip('systemd-analyze unavailable'); return; }
  const directory = mkdtempSync(join(tmpdir(), 'developed-unit-verify-'));
  try {
    const source = readFileSync(new URL('./ecosystem-app@.service', import.meta.url), 'utf8');
    const path = join(directory, 'ecosystem-app@.service');
    // Generated validation copy only: no installed unit or executable is touched.
    writeFileSync(path, source.replace('ExecStart=/opt/developed-apps/%i/start', 'ExecStart=/usr/bin/true'));
    execFileSync('systemd-analyze', ['verify', path], { stdio: ['ignore', 'pipe', 'pipe'] });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
