// Public-ingress denial filter, NOT a JWT verifier or authorization grant.
// The actual REST/Storage/Realtime services MUST still verify signatures/RLS.
// Run separately from the privileged accounts process; it holds only anon key.
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const publicRoles = new Set(['anon', 'authenticated', 'kestrek_backend',
  'screentime_backend', 'vocabulum_backend', 'odonto_backend', 'otazkomat_backend', 'odonto_identity_web']);
const equal = (a, b) => typeof a === 'string' && typeof b === 'string'
  && a.length <= 16384 && Buffer.byteLength(a) === Buffer.byteLength(b)
  && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function allowedBearer(token) {
  if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return false;
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return claims && publicRoles.has(claims.role);
  } catch { return false; }
}

export function publicDataAllowed({ method, uri, headers }, anonKey) {
  if (typeof anonKey !== 'string' || !allowedBearer(anonKey)) return false;
  // Require an actual anon credential, never a privileged key misconfigured as
  // the expected public value. This is configuration validation, not trust.
  if (JSON.parse(Buffer.from(anonKey.split('.')[1], 'base64url').toString()).role !== 'anon') return false;
  if (!['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(method)
    || typeof uri !== 'string' || uri.length > 32768 || !uri.startsWith('/') || uri.startsWith('//') || uri.includes('\\')) return false;
  let url;
  try { url = new URL(uri, 'https://ingress.invalid'); } catch { return false; }
  // Prevent proxy/upstream disagreement about encoded path separators. Standard
  // SDK object paths retain literal '/' separators; no stored key is rewritten.
  if (/%(?:2f|5c|25(?:2f|5c|2e))/i.test(uri.split('?')[0])) return false;
  if (!/^\/(rest|storage|realtime)\/v1(?:\/|$)/.test(url.pathname)) return false;
  // Storage v1.60.4 S3/vector endpoints accept alternate SigV4 credentials,
  // including JWT session tokens in query/multipart fields. They are not used
  // by the ecosystem's ordinary Storage SDK and are closed in this v1 ingress.
  let decodedPath;
  try { decodedPath = decodeURIComponent(url.pathname); } catch { return false; }
  if (/^\/storage\/v1\/(?:s3|vector)(?:\/|$)/i.test(decodedPath)) return false;
  if (Object.keys(headers).some(key => /^x-amz-/i.test(key))
    || [...url.searchParams.keys()].some(key => /^x-amz-/i.test(key))) return false;
  // A service-role apikey alone would make Kong authorize privileged requests,
  // even without an Authorization header. Only the known anon apikey may pass.
  const apiKeys = url.searchParams.getAll('apikey');
  if (apiKeys.length > 1 || (apiKeys.length && !equal(apiKeys[0], anonKey))) return false;
  if (headers.apikey !== undefined && !equal(headers.apikey, anonKey)) return false;
  if (headers.authorization !== undefined) {
    if (typeof headers.authorization !== 'string' || !/^Bearer [A-Za-z0-9_.-]+$/i.test(headers.authorization)
      || !allowedBearer(headers.authorization.slice(7))) return false;
  }
  const accessTokens = url.searchParams.getAll('access_token');
  if (accessTokens.length > 1 || (accessTokens.length && !allowedBearer(accessTokens[0]))) return false;
  // Public objects and already-issued signed Storage URL capabilities may have
  // no apikey/bearer. They remain subject to Storage's own capability verifier.
  return true;
}

export function boundaryServer(anonKey) {
  if (!publicDataAllowed({ method: 'GET', uri: '/rest/v1/', headers: {} }, anonKey)) throw new Error('Valid public anon key required');
  return createServer({ maxHeaderSize: 49152, requestTimeout: 5000, headersTimeout: 5000 }, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && req.url === '/healthz') { res.writeHead(200).end('ok'); return; }
    // Caddy forward_auth overwrites these fields from the actual request.
    // Caddy may retain the original query while rewriting the path to /check.
    // Only its overwritten original-URI metadata is used for the decision.
    const allowed = req.method === 'GET' && req.url?.split('?')[0] === '/check' && publicDataAllowed({
      method: req.headers['x-forwarded-method'], uri: req.headers['x-forwarded-uri'], headers: req.headers,
    }, anonKey);
    res.writeHead(allowed ? 204 : 403).end();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const port = Number(process.env.DATA_BOUNDARY_PORT || 3143);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error();
    const server = boundaryServer(process.env.SUPABASE_ANON_KEY);
    server.on('error', () => { process.stderr.write('Data boundary listener failed\n'); process.exitCode = 1; });
    server.listen(port, '127.0.0.1');
    for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close());
  } catch { process.stderr.write('Data boundary configuration failed\n'); process.exitCode = 1; }
}
