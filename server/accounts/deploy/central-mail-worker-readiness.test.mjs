import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { apiReady, waitForApi } from './central-mail-worker-readiness.mjs';

test('boot wait survives unavailable API and a restart beyond the old five-second limit', async () => {
  let clock = 0, attempts = 0;
  await waitForApi({ now: () => clock, sleep: async ms => { clock += ms; },
    health: async timeout => {
      attempts++;
      assert.ok(timeout > 0 && timeout <= 1000);
      if (clock < 3000) throw new Error('fixture first API exited');
      return clock >= 8000;
    } });
  assert.equal(clock, 8000);
  assert.ok(attempts > 1);
});

test('unavailable API exhausts the two-minute bound; late success is rejected', async () => {
  let clock = 0;
  const timing = { now: () => clock, sleep: async ms => { clock += ms; } };
  await assert.rejects(waitForApi({ ...timing, health: async () => false }), /deadline exceeded/);
  assert.equal(clock, 120000);
  clock = 0;
  await assert.rejects(waitForApi({ ...timing, health: async () => { clock = 120000; return true; } }), /deadline exceeded/);
  await assert.rejects(waitForApi({ timeoutMs: 120001 }));
});

test('loopback probe sends canonical Host and accepts only HTTP 200 without redirects', async t => {
  let status = 503, requests = 0;
  const server = createServer((req, res) => {
    requests++;
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/health');
    assert.equal(req.headers.host, 'www.developed.sk');
    res.writeHead(status, { Location: 'https://untrusted.invalid/' });
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const request = (options, callback) => {
    assert.equal(options.hostname, '127.0.0.1');
    assert.equal(options.port, 3140);
    return httpRequest({ ...options, port: server.address().port }, callback);
  };
  assert.equal(await apiReady(1000, request), false);
  status = 302;
  assert.equal(await apiReady(1000, request), false);
  status = 200;
  assert.equal(await apiReady(1000, request), true);
  assert.equal(requests, 3);
});

test('a connection that sends no headers is bounded and closed', async t => {
  const server = createServer(() => {});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const request = (options, callback) => httpRequest({ ...options, port: server.address().port }, callback);
  assert.equal(await apiReady(30, request), false);
});
