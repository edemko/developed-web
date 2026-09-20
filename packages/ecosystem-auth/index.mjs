import { createHash, randomBytes } from 'node:crypto';
import * as oidc from 'openid-client';
import { createRemoteJWKSet, jwtVerify, customFetch as joseFetch } from 'jose';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const digest = value => createHash('sha256').update(value).digest('hex');

/** Accept only an application-local path. Never accept an external return URL. */
export function safeReturnPath(value, fallback = '/') {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/')) return fallback;
  let decoded = value;
  try {
    for (let i = 0; i < 3; i++) {
      if (/^[\/]{2}|[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    if (/^[\/]{2}|[\\\u0000-\u0020\u007f]/.test(decoded)) return fallback;
    const parsed = new URL(value, 'https://local.invalid');
    return parsed.origin === 'https://local.invalid' ? parsed.pathname + parsed.search + parsed.hash : fallback;
  } catch { return fallback; }
}

function trustedUrl(value, allowLoopbackHttp) {
  const url = new URL(value);
  const local = ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(allowLoopbackHttp && local && url.protocol === 'http:')) || url.username || url.password || url.hash) {
    throw new Error('OIDC configuration requires credential-free HTTPS URLs');
  }
  return url;
}

/**
 * Server-only standard OIDC relying party. Config is operator-controlled, never
 * populated from request headers/query values. store.create(id, transaction)
 * persists the entire transaction; store.consume(id) MUST atomically remove and
 * return it (e.g. DELETE ... RETURNING), including with concurrent callbacks.
 * The random flow cookie is host-only Secure HttpOnly SameSite=Lax Path=/, and
 * must be cleared at every callback. Tokens are never browser response bodies.
 */
export function createOidcClient({ issuer, clientId, clientSecret, redirectUri, store,
  metadata, fetch: fetcher, allowLoopbackHttp = false, now = Date.now, transactionTtlMs = 600_000 }) {
  const issuerUrl = trustedUrl(issuer, allowLoopbackHttp);
  const callback = trustedUrl(redirectUri, allowLoopbackHttp);
  if (callback.search || !clientId || !clientSecret || !store?.create || !store?.consume) throw new Error('Invalid OIDC client configuration');
  if (!(transactionTtlMs > 0 && transactionTtlMs <= 600_000)) throw new Error('Invalid OIDC transaction lifetime');
  const server = metadata ?? {
    issuer,
    authorization_endpoint: `${issuer.replace(/\/$/, '')}/oauth/authorize`,
    token_endpoint: `${issuer.replace(/\/$/, '')}/oauth/token`,
    jwks_uri: `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`,
    userinfo_endpoint: `${issuer.replace(/\/$/, '')}/oauth/userinfo`,
    response_types_supported: ['code'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
  };
  if (server.issuer !== issuer) throw new Error('OIDC issuer mismatch');
  for (const endpoint of ['authorization_endpoint', 'token_endpoint', 'jwks_uri', 'userinfo_endpoint']) {
    const url = trustedUrl(server[endpoint], allowLoopbackHttp);
    if (url.origin !== issuerUrl.origin) throw new Error('OIDC endpoints must share the configured issuer origin');
  }
  const configuration = new oidc.Configuration(server, clientId, {
    client_secret: clientSecret,
    id_token_signed_response_alg: server.id_token_signing_alg_values_supported?.includes('ES256') ? 'ES256' : 'RS256',
  }, oidc.ClientSecretPost(clientSecret));
  configuration.timeout = 10;
  if (fetcher) configuration[oidc.customFetch] = fetcher;
  if (allowLoopbackHttp && issuerUrl.protocol === 'http:') oidc.allowInsecureRequests(configuration);
  oidc.enableNonRepudiationChecks(configuration);
  const jwks = createRemoteJWKSet(new URL(server.jwks_uri), fetcher ? { [joseFetch]: fetcher } : {});

  async function validateAccess(tokens, expectedSubject) {
    const { payload } = await jwtVerify(tokens.access_token, jwks, {
      issuer, audience: 'authenticated', algorithms: ['ES256', 'RS256'],
    });
    if (payload.client_id !== clientId || payload.sub !== expectedSubject || !UUID.test(payload.session_id ?? '')) {
      throw new Error('OIDC access token client, subject or session mismatch');
    }
    return payload;
  }

  return {
    async begin(returnTo = '/') {
      const flowCookie = randomBytes(32).toString('base64url');
      const state = oidc.randomState();
      const nonce = oidc.randomNonce();
      const verifier = oidc.randomPKCECodeVerifier();
      const transaction = { state, nonce, verifier, returnTo: safeReturnPath(returnTo), expiresAt: now() + transactionTtlMs };
      await store.create(digest(flowCookie), transaction);
      const url = oidc.buildAuthorizationUrl(configuration, {
        redirect_uri: redirectUri, scope: 'openid email profile', state, nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256',
      });
      return { url: url.href, flowCookie, expiresAt: transaction.expiresAt };
    },
    async complete(currentUrl, flowCookie) {
      if (typeof flowCookie !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(flowCookie)) throw new Error('Missing login transaction');
      // Consume before network I/O; a failed exchange cannot replay this flow.
      const transaction = await store.consume(digest(flowCookie));
      if (!transaction || transaction.expiresAt <= now()) throw new Error('Expired or reused login transaction');
      const url = new URL(currentUrl);
      if (url.origin !== callback.origin || url.pathname !== callback.pathname || url.hash || url.username || url.password) throw new Error('Unexpected callback URL');
      const tokens = await oidc.authorizationCodeGrant(configuration, url, {
        expectedState: transaction.state, expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.verifier, idTokenExpected: true,
      });
      const identity = tokens.claims();
      if (!UUID.test(identity?.sub ?? '')) throw new Error('Invalid identity subject');
      const accessClaims = await validateAccess(tokens, identity.sub);
      return { identity, accessClaims, tokens, returnTo: safeReturnPath(transaction.returnTo) };
    },
    async refresh(refreshToken, expectedSubject) {
      if (!UUID.test(expectedSubject)) throw new Error('Invalid identity subject');
      const tokens = await oidc.refreshTokenGrant(configuration, refreshToken);
      const identity = tokens.claims();
      if (identity && identity.sub !== expectedSubject) throw new Error('Refreshed identity changed');
      return { tokens, identity, accessClaims: await validateAccess(tokens, expectedSubject) };
    },
    async userInfo(accessToken, expectedSubject) {
      return oidc.fetchUserInfo(configuration, accessToken, expectedSubject);
    },
  };
}
