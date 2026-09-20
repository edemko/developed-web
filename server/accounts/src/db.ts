import pg from 'pg';
import { hash, HttpError } from './security.js';
export type Row = Record<string, any>;
export type Query = (sql: string, args?: unknown[]) => Promise<Row[]>;
export class Database {
  readonly pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 6, connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000, statement_timeout: 15_000, application_name: 'developed-accounts' });
  }
  query: Query = async (sql, args = []) => (await this.pool.query(sql, args)).rows;
  async tx<T>(run: (query: Query) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await run(async (sql, args = []) => (await client.query(sql, args)).rows);
      await client.query('commit'); return result;
    } catch (error) { await client.query('rollback'); throw error; }
    finally { client.release(); }
  }
  async limit(key: string, max: number, seconds: number): Promise<void> {
    const bucket = Math.floor(Date.now() / (seconds * 1000));
    const [row] = await this.query(`insert into accounts.rate_limits(bucket_hash,count,expires_at)
      values($1,1,now()+$2*interval '1 second') on conflict(bucket_hash)
      do update set count=accounts.rate_limits.count+1 returning count`, [hash(`${key}:${bucket}`), seconds * 2]);
    if (row!.count > max) throw new HttpError(429, 'rate_limited');
  }
  async audit(query: Query, actor: string | null, target: string | null, action: string, result: string, context: object = {}) {
    await query('insert into accounts.audit(actor_id,target_id,action,result,context) values($1,$2,$3,$4,$5)', [actor, target, action, result, context]);
  }
  async housekeeping() {
    // Bounded credential-session maintenance, never account/product deletion.
    await this.query(`delete from accounts.sessions where id in (select id from accounts.sessions
      where expires_at<now() or revoked_at<now()-interval '1 day' order by expires_at limit 1000)`);
    await this.query(`delete from accounts.rate_limits where bucket_hash in (select bucket_hash from accounts.rate_limits
      where expires_at<now() order by expires_at limit 1000)`);
  }
}
