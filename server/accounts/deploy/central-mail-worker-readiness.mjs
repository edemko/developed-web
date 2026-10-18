// A bounded, unprivileged boot wait before the separate full ownership guard.
// This probe grants no authority to send mail and never starts/restarts a service.
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { pathToFileURL } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

export function apiReady(timeoutMs, request = httpRequest) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 1000);
  return new Promise(resolve => {
    let completed = false;
    const finish = ready => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      req.destroy();
      resolve(ready);
    };
    const req = request({ hostname: '127.0.0.1', port: 3140, path: '/health',
      method: 'GET', headers: { Host: 'www.developed.sk' } }, response => {
      const ready = response.statusCode === 200;
      response.destroy();
      finish(ready);
    });
    // A total deadline also covers a connection that never produces headers.
    const timer = setTimeout(() => finish(false), timeoutMs);
    req.once('error', () => finish(false));
    req.end();
  });
}

export async function waitForApi({ health = apiReady, now = () => performance.now(),
  sleep = pause, timeoutMs = 120000 } = {}) {
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 120000);
  const deadline = now() + timeoutMs;
  while (now() < deadline) {
    let ready = false;
    try { ready = await health(Math.max(1, Math.min(1000, Math.floor(deadline - now())))); }
    catch { /* A boot-time connection failure is not permission to run the worker. */ }
    if (ready && now() < deadline) return;
    if (now() < deadline) await sleep(Math.min(500, deadline - now()));
  }
  throw new Error('Central API boot readiness deadline exceeded');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 2);
    await waitForApi();
    console.log('Central API health ready; full mail ownership guard must run next.');
  } catch {
    console.error('Central API boot readiness failed; mail worker was not started.');
    // ExecCondition 255 marks a failed unit; 1..254 would silently skip it.
    process.exitCode = 255;
  }
}
