import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';
import type { Database, Query } from './db.js';
import { HttpError, seal, unseal } from './security.js';
import { legacyMailHtml, type Mail } from './mail-templates.js';
export { credentialMail, credentialLifetime, securityMail, reportMail, type Mail } from './mail-templates.js';
export async function queueMail(query: Query, config: Config, mail: Mail): Promise<void> {
  const id = randomUUID();
  await query('insert into accounts.outbox(id,payload) values($1,$2)', [id, seal(mail, config.encryptionKey, `mail:${id}`)]);
}
export class MailWorker {
  constructor(private db: Database, private config: Config, private request: typeof fetch = fetch) {}
  async tick(): Promise<boolean> {
    if (!this.config.mailEnabled) return false;
    if (!this.config.mailjetKey || !this.config.mailjetSecret) throw new Error('Mail enabled without credentials');
    const lease = randomUUID();
    const [job] = await this.db.query(`update accounts.outbox set lease_id=$1,lease_until=now()+interval '60 seconds',attempts=attempts+1
      where id=(select id from accounts.outbox where delivered_at is null and failed_at is null and available_at<=now()
      and (lease_until is null or lease_until<now()) order by available_at for update skip locked limit 1) returning *`, [lease]);
    if (!job) return false;
    try {
      await this.db.limit('aggregate:mail', this.config.dailyEmailLimit, 86400);
      const mail = unseal<Mail>(job.payload, this.config.encryptionKey, `mail:${job.id}`);
      const response = await this.request('https://api.mailjet.com/v3.1/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${Buffer.from(`${this.config.mailjetKey}:${this.config.mailjetSecret}`).toString('base64')}` },
        body: JSON.stringify({ Messages: [{ From: { Email: 'noreply@developed.sk', Name: mail.brand === 'mega-music' ? 'Mega Music · DevelopED' : 'DevelopED' },
          ReplyTo: { Email: this.config.supportEmail, Name: 'DevelopED support' }, To: [{ Email: mail.to }],
          Subject: mail.subject, TextPart: mail.text, HTMLPart: mail.html || legacyMailHtml(mail, this.config),
          TrackOpens: 'disabled', TrackClicks: 'disabled', CustomID: job.id,
          ...(mail.brand === 'mega-music' && mail.inlineLogo ? {InlinedAttachments:[{ContentType:'image/png',Filename:'mega-music.png',ContentID:'mega-music-logo',Base64Content:mail.inlineLogo}]} : {}) }] }),
        signal: AbortSignal.timeout(15_000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Mail provider rejected delivery');
      const result = await response.json() as { Messages?: { Status: string }[] };
      if (result.Messages?.[0]?.Status !== 'success') throw new Error('Mail delivery not acknowledged');
      await this.db.query(`update accounts.outbox set delivered_at=now(),payload='',lease_until=null where id=$1 and lease_id=$2`, [job.id, lease]);
    } catch (error) {
      if (error instanceof HttpError && error.code === 'rate_limited') {
        // Capacity is not a delivery failure. Resume after the UTC fixed-window
        // reset without exhausting retry attempts or losing security messages.
        const delay = 86400 - Math.floor(Date.now() / 1000) % 86400 + 1;
        await this.db.query(`update accounts.outbox set lease_until=null,attempts=greatest(0,attempts-1),
          available_at=now()+$3*interval '1 second' where id=$1 and lease_id=$2`, [job.id, lease, delay]);
        return true;
      }
      // At-least-once delivery: an ambiguous timeout may produce a duplicate mail,
      // never a duplicate account action. Do not log the payload or recipients.
      await this.db.query(`update accounts.outbox set lease_until=null,available_at=now()+$3*interval '1 second',
        failed_at=case when attempts>=10 then now() else null end where id=$1 and lease_id=$2`, [job.id, lease, Math.min(3600, 30 * 2 ** Math.min(job.attempts, 7))]);
    }
    return true;
  }
}
