import { exactHttps } from './security.js';
export interface Config {
  origin: string; providerUrl: string; providerKey: string; databaseUrl: string;
  encryptionKey: Buffer; port: number; insecureLocal: boolean; mailjetKey: string;
  mailjetSecret: string; supportEmail: string; mailEnabled: boolean;
  dailyEmailLimit: number; hourlyRegistrationLimit: number;
  marketingDir?: string;
}
export function config(env = process.env): Config {
  const required = (name: string) => { const value = env[name]; if (!value) throw new Error(`Missing ${name}`); return value; };
  const insecureLocal = env.ACCOUNTS_INSECURE_LOCAL === 'true';
  const origin = exactHttps(required('ACCOUNTS_ORIGIN'), insecureLocal);
  if (origin.pathname !== '/' || origin.search) throw new Error('ACCOUNTS_ORIGIN must be an origin');
  if (insecureLocal && !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('Insecure mode is loopback-only');
  // Trusted provider control plane can be a loopback-only HTTP upstream even
  // when the public portal uses HTTPS. Never accept request-derived upstreams.
  const providerUrl = exactHttps(required('ACCOUNTS_PROVIDER_URL'), true).href.replace(/\/$/, '');
  const encryptionKey = Buffer.from(required('ACCOUNTS_ENCRYPTION_KEY'), 'base64');
  if (encryptionKey.length !== 32) throw new Error('ACCOUNTS_ENCRYPTION_KEY must encode 32 random bytes');
  const integer = (key: string, fallback: number) => {
    const value = Number(env[key] || fallback);
    if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid ${key}`);
    return value;
  };
  return { origin: origin.origin, providerUrl, providerKey: required('ACCOUNTS_PROVIDER_ADMIN_KEY'),
    databaseUrl: required('ACCOUNTS_DATABASE_URL'), encryptionKey, port: integer('ACCOUNTS_PORT', 3140),
    insecureLocal, mailjetKey: env.MAILJET_API_KEY || '', mailjetSecret: env.MAILJET_SECRET_KEY || '',
    mailEnabled: env.ACCOUNTS_MAIL_ENABLED === 'true', supportEmail: 'info@developed.sk',
    dailyEmailLimit: integer('ACCOUNTS_DAILY_EMAIL_LIMIT', 200),
    marketingDir: env.ACCOUNTS_MARKETING_DIR,
    hourlyRegistrationLimit: integer('ACCOUNTS_HOURLY_REGISTRATION_LIMIT', 20) };
}
