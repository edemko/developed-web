// ExecStartPre gate; runs as the product UID with systemd's private environment.
// Never prints credential names/values or creates files/connections.
import { pathToFileURL } from 'node:url';
export const identities = Object.freeze({ 'mega-music': 984, screentime: 983, kestrek: 982, otazkomat: 981, airsoft: 986, vocabulum: 985 });
const legacy = ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_JWT_SECRET', 'JWT_SECRET', 'GOTRUE_JWT_SECRET', 'MAILJET_API_KEY', 'MAILJET_SECRET_KEY'];
export function assertCentral(slug, env, uid) {
  if (identities[slug] !== uid || env.ECOSYSTEM_AUTH_ENABLED !== 'true'
    || (slug === 'screentime' && env.NEXT_PUBLIC_ECOSYSTEM_AUTH_ENABLED !== 'true')
    || legacy.some(key => Boolean(env[key]))) throw Error('Central runtime boundary check failed');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { if (process.argv.length !== 3) throw Error(); assertCentral(process.argv[2], process.env, process.getuid()); }
  catch { console.error('Central runtime boundary check failed; startup refused.'); process.exitCode = 1; }
}
