import { config } from './config.js';
import { Database } from './db.js';
import { Provider } from './provider.js';
import { Accounts } from './accounts.js';
import { createAccountServer } from './http.js';
import { MailWorker } from './mail.js';

const settings = config(), db = new Database(settings.databaseUrl);
// Refuse to serve with a superuser/service role connection.
const [role] = await db.query(`select current_user as name,rolsuper,rolbypassrls from pg_roles where rolname=current_user`);
if (role?.name !== 'developed_accounts' || role.rolsuper || role.rolbypassrls) throw new Error('Use the scoped developed_accounts database role');
const accountService = new Accounts(db, new Provider(settings.providerUrl, settings.providerKey), settings);
const server = createAccountServer(accountService);
server.requestTimeout = 30_000; server.headersTimeout = 10_000;
server.listen(settings.port, '127.0.0.1', () => process.stdout.write(`DevelopED accounts listening on loopback:${settings.port}\n`));
const worker = new MailWorker(db, settings); let running = false;
let lastMaintenance = 0;
const timer = setInterval(async () => {
  if (running) return; running = true;
  try {
    await worker.tick();
    if (Date.now() - lastMaintenance > 60_000) { await db.housekeeping(); lastMaintenance = Date.now(); }
  } catch { process.stderr.write('accounts: background maintenance unavailable\n'); }
  finally { running = false; }
}, 5000);
timer.unref();
const shutdown = () => { clearInterval(timer); server.close(() => { void db.pool.end(); }); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
