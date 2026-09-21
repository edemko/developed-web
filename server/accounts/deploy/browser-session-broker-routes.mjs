// SOURCE-ONLY, pure transformation + read-only inspection. No install/reload API.
// The coordinated central release pipeline owns staging, approval and cutover.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const sourceHash = 'aa28db0fdd4c64a5c398e5c7e045ef59e19fae2e53e3e28dc437742ba072fdcc';
export const caddyPid = 862;
export const issuerHost = 'sam-api.developed162.bid';
export const providerDial = '127.0.0.1:3141';
export const brokerDial = '127.0.0.1:3140';
export const sha = value => createHash('sha256').update(value).digest('hex');
const readPaths = [
  '/auth/v1/.well-known/openid-configuration', '/auth/v1/.well-known/jwks.json',
  '/auth/v1/.well-known/oauth-authorization-server', '/auth/v1/oauth/authorize',
  '/auth/v1/oauth/userinfo',
];
const protocolLine = `      path ${readPaths.join(' ')}\n`;
const tokenBlock = `    @oauth_token {
      method POST
      path /auth/v1/oauth/token
    }
    handle @oauth_token {
      uri strip_prefix /auth/v1
      reverse_proxy ${providerDial}
    }`;
const userinfoBlock = `    @oauth_userinfo {
      method GET HEAD
      path /auth/v1/oauth/userinfo
    }
    handle @oauth_userinfo {
      uri strip_prefix /auth/v1
      reverse_proxy ${brokerDial} {
        header_up Host www.developed.sk
      }
    }
`;

const brokerTokenBlock = tokenBlock.replace(`reverse_proxy ${providerDial}`, `reverse_proxy ${brokerDial} {\n        header_up Host www.developed.sk\n      }`);

export function replaceReviewedBlocks(source) {
  assert.equal(source.split(protocolLine).length, 2, 'Expected one exact protocol read list');
  assert.equal(source.split(tokenBlock).length, 2, 'Expected one exact token handler');
  assert.ok(!source.includes('@oauth_userinfo'), 'Userinfo route already exists');
  const candidate = source.replace(protocolLine, `      path ${readPaths.slice(0, -1).join(' ')}\n`)
    .replace(tokenBlock, userinfoBlock + brokerTokenBlock);
  assert.equal(candidate.replace(userinfoBlock, '')
    .replace(brokerTokenBlock, tokenBlock)
    .replace(`      path ${readPaths.slice(0, -1).join(' ')}\n`, protocolLine), source,
  'Bytes outside the two broker routes changed');
  return candidate;
}
export function merge(source) {
  assert.equal(sha(source), sourceHash, 'Pinned live Caddy source changed');
  return replaceReviewedBlocks(source);
}

function proxyHandler(dial) {
  return [{ handler: 'subroute', routes: [{ handle: [
    { handler: 'rewrite', strip_path_prefix: '/auth/v1' },
    { handler: 'reverse_proxy', ...(dial === brokerDial ? { headers: { request: { set: { Host: ['www.developed.sk'] } } } } : {}), upstreams: [{ dial }] },
  ] }] }];
}
function canonicalGroups(value) {
  const groups = new Map();
  const output = structuredClone(value);
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    for (const [key, item] of Object.entries(node)) {
      if (key === 'group') {
        assert.match(item, /^group[0-9]+$/, 'Unexpected authored route group');
        if (!groups.has(item)) groups.set(item, `exclusive-${groups.size}`);
        node[key] = groups.get(item);
      } else if (Array.isArray(item)) item.forEach(visit);
      else visit(item);
    }
  }
  visit(output); return output;
}
export function verifyAdapted(before, after) {
  const expected = structuredClone(before);
  let issuerCount = 0, protocolCount = 0, tokenCount = 0;
  for (const server of Object.values(expected.apps.http.servers)) {
    for (const root of server.routes) {
      if (!root.match?.some(match => match.host?.includes(issuerHost))) continue;
      assert.deepEqual(root.match, [{ host: [issuerHost] }], 'Issuer must not share another host or matcher');
      issuerCount++;
      function visit(value) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value.routes)) {
          for (let index = 0; index < value.routes.length; index++) {
            const route = value.routes[index];
            if (route.match?.some(match => match.path?.includes('/auth/v1/oauth/userinfo'))) {
              protocolCount++;
              assert.deepEqual(route.match, [{ method: ['GET', 'HEAD'], path: readPaths }]);
              assert.deepEqual(route.handle, proxyHandler(providerDial));
              const userinfo = structuredClone(route);
              route.match[0].path = readPaths.slice(0, -1);
              userinfo.match[0].path = ['/auth/v1/oauth/userinfo'];
              userinfo.handle = proxyHandler(brokerDial);
              // The new handle shares the same exclusive Caddy route group.
              value.routes.splice(index + 1, 0, userinfo);
              index++;
            } else if (route.match?.some(match => match.path?.includes('/auth/v1/oauth/token'))) {
              tokenCount++;
              assert.deepEqual(route.match, [{ method: ['POST'], path: ['/auth/v1/oauth/token'] }]);
              assert.deepEqual(route.handle, proxyHandler(providerDial));
              route.handle = proxyHandler(brokerDial);
            }
          }
        }
        for (const item of Object.values(value)) {
          if (Array.isArray(item)) for (const child of item) visit(child);
          else if (item && typeof item === 'object') visit(item);
        }
      }
      // Traverse handler/subroute objects, not route matches or unrelated sites.
      visit(root);
    }
  }
  assert.deepEqual([issuerCount, protocolCount, tokenCount], [1, 1, 1], 'Expected one issuer and exactly two broker route targets');
  // Caddy renumbers autogenerated group IDs when a handle is inserted. Rename
  // identifiers bijectively, preserving every group membership/equality edge;
  // never remove group fields or ignore distinct/missing/merged route groups.
  assert.deepEqual(canonicalGroups(after), canonicalGroups(expected), 'Unrelated adapted Caddy configuration changed');
}

function run(command, args, input) {
  const result = spawnSync(command, args, { input, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
  assert.ok(!result.error && !result.signal && result.status === 0, 'Read-only route check failed; output suppressed');
  return result.stdout;
}
export const adaptText = input => JSON.parse(run('/usr/bin/caddy', ['adapt', '--adapter', 'caddyfile', '--config', '-'], input));
export function verifyCaddyState(state) {
  assert.deepEqual(state, { MainPID: String(caddyPid), ActiveState: 'active', SubState: 'running', NRestarts: '0' }, 'Caddy process baseline changed');
}
function state() {
  return Object.fromEntries(run('/usr/bin/systemctl', ['show', 'caddy.service', '-p', 'MainPID,ActiveState,SubState,NRestarts'])
    .trim().split('\n').map(line => line.split('=')));
}
export function inspectLive() {
  verifyCaddyState(state());
  const original = readFileSync('/etc/caddy/Caddyfile', 'utf8'), candidate = merge(original);
  verifyAdapted(adaptText(original), adaptText(candidate));
  run('/usr/bin/caddy', ['validate', '--adapter', 'caddyfile', '--config', '-'], candidate);
  assert.equal(readFileSync('/etc/caddy/Caddyfile', 'utf8'), original);
  verifyCaddyState(state());
  return { sourceSha256: sourceHash, candidateSha256: sha(candidate), caddyPid,
    fullAdaptedProof: true, tokenAndUserinfoOnly: true, liveWrites: false };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.deepEqual(process.argv.slice(2), ['--inspect']);
    console.log(JSON.stringify(inspectLive()));
  } catch { console.error('Broker-route inspection refused; live state was not changed.'); process.exitCode = 1; }
}
