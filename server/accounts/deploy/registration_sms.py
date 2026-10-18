#!/usr/bin/python3 -I
"""Poll committed central registrations; durably deduplicate SMS Gate v1 alerts."""
import argparse
from datetime import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
import time
import unicodedata
from urllib.parse import urlsplit, unquote

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sms_gate_v1 import load_config, send_registration, delivery

STATE = Path('/var/lib/developed-health/registration-sms.sqlite')
STATUS = STATE.with_name('registration-status.json')
# Read all committed registration IDs, not an increasing high-water mark:
# concurrent transactions can commit in the reverse order of their audit IDs.
# The first verification/invitation credential holds the original app even after
# confirmation or a later resend. Neither a browser label nor current membership
# is evidence of which app initiated registration.
SQL = """
begin read only;
set local statement_timeout='10s';
select json_build_object('role',current_user,'session_role',session_user,
  'read_only',current_setting('transaction_read_only'),'events',coalesce(json_agg(e),'[]'))
from (
  select r.id::text as id,r.created_at as created_at,
    coalesce(a.name,c.return_app_id,'DevelopED') as app,c.email as email
  from accounts.audit r
  left join lateral (
    select return_app_id,email from accounts.credentials
    where user_id=r.target_id and purpose in ('verification','invitation')
      and created_at<=r.created_at
    order by created_at,token_hash limit 1
  ) c on true
  left join core.apps a on a.id=c.return_app_id
  where r.action='registration' and r.result='succeeded'
  order by r.id
) e;
commit;
"""


def registrations(database_url):
    url = urlsplit(database_url)
    if (url.scheme != 'postgresql' or url.hostname != '127.0.0.1' or url.port != 5432
            or unquote(url.username or '') != 'developed_accounts.oc-prod'
            or url.path != '/postgres' or url.query or url.fragment or not url.password):
        raise ValueError('Unapproved registration database route')
    env = {'PATH': '/usr/bin:/bin', 'LC_ALL': 'C.UTF-8', 'PGHOST': url.hostname,
           'PGPORT': str(url.port), 'PGDATABASE': 'postgres', 'PGUSER': unquote(url.username),
           'PGPASSWORD': unquote(url.password), 'PGCONNECT_TIMEOUT': '5',
           'PGAPPNAME': 'developed-registration-sms',
           'PGOPTIONS': '-c default_transaction_read_only=on -c statement_timeout=10000'}
    result = subprocess.run(['/usr/bin/psql', '-X', '-q', '-A', '-t', '-w', '-v', 'ON_ERROR_STOP=1'],
                            input=SQL, text=True, capture_output=True, env=env, timeout=20)
    if result.returncode:
        raise RuntimeError('Registration database read failed')
    data = json.loads(result.stdout)
    if (data['role'] != 'developed_accounts' or data['session_role'] != 'developed_accounts'
            or data['read_only'] != 'on'):
        raise ValueError('Registration database role/read-only guard failed')
    for row in data['events']:
        if not re.fullmatch(r'[0-9]{1,20}', row['id']) or not isinstance(row['app'], str):
            raise ValueError('Invalid registration event')
        datetime.fromisoformat(row['created_at'])
    return data['events']


def message(event):
    app = unicodedata.normalize('NFKD', event['app']).encode('ascii', 'ignore').decode()
    app = re.sub(r'[^A-Za-z0-9 .,:;!/?()+_\-]', ' ', app)
    app = ' '.join(app.split())[:65] or 'DevelopED'
    stamp = datetime.fromisoformat(event['created_at']).astimezone().strftime('%d.%m.%Y %H:%M')
    # Preserve the original registration address, including plus aliases and
    # punctuation. Long addresses use multipart SMS rather than truncation.
    email = event.get('email')
    if email is None:
        email = 'nedostupny'
    if not isinstance(email, str) or not re.fullmatch(r'[\x21-\x7e]{1,254}', email):
        raise ValueError('Invalid registration email')
    return f'Nova registracia. Aplikacia: {app}. Email: {email}. Cas: {stamp}.'


def connect(path):
    db = sqlite3.connect(path)
    db.execute('pragma synchronous=FULL')
    db.execute('create table if not exists settings (key text primary key,value text not null)')
    db.execute('''create table if not exists events (id text primary key, status text not null,
        message text, attempted_at real, provider_id text, code text, checked_at real)''')
    db.commit()
    return db


def initialize(db, events, now):
    if db.execute("select 1 from settings where key='initialized'").fetchone():
        raise ValueError('Registration notifier is already initialized; refusing to reset history')
    with db:
        db.executemany("insert into events(id,status) values(?,'baseline')", [(e['id'],) for e in events])
        db.execute("insert into settings values('initialized',?)", (str(now),))


def tick(db, events, config, now, sender=send_registration, checker=delivery):
    if not db.execute("select 1 from settings where key='initialized'").fetchone():
        raise ValueError('Initialize the registration baseline explicitly before enabling sends')
    with db:
        # A crash after reservation could have submitted a message. Never resend.
        db.execute("update events set status='unknown',code='INTERRUPTED_SEND' where status='sending'")
        db.executemany("""insert into events(id,status,message) values(?,'queued',?)
            on conflict(id) do update set message=excluded.message where events.status='queued'""",
                       [(e['id'], message(e)) for e in events])
    # Bound each run; a backlog persists across runs without dropping registrations.
    for identifier, text in db.execute("select id,message from events where status='queued' order by cast(id as integer) limit 10").fetchall():
        with db:
            db.execute("update events set status='sending',attempted_at=? where id=?", (now, identifier))
        result = sender(config, text)
        with db:
            db.execute('update events set status=?,provider_id=?,code=? where id=?',
                       (result['status'], result.get('message_id'), result.get('code'), identifier))
    for identifier, provider_id, attempted_at in db.execute("select id,provider_id,attempted_at from events where status in ('accepted','pending') order by coalesce(checked_at,0) limit 10").fetchall():
        result = checker(config, provider_id)
        status = result['status']
        if status not in ('delivered', 'failed'):
            status = 'unknown' if now - attempted_at >= 3600 else 'pending'
        with db:
            db.execute('update events set status=?,code=?,checked_at=? where id=?',
                       (status, result.get('code'), now, identifier))
    return summary(db, now)


def summary(db, now):
    counts = dict(db.execute('select status,count(*) from events group by status'))
    return {'checked_at': now, 'counts': counts,
            'sms_problem': any(counts.get(k, 0) for k in ('unknown', 'rejected', 'failed', 'sending'))}


def save_status(value):
    temporary = STATUS.with_suffix('.tmp')
    with temporary.open('w') as file:
        json.dump(value, file)
        file.write('\n')
        file.flush()
        os.fsync(file.fileno())
    os.replace(temporary, STATUS)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--initialize', action='store_true')
    parser.add_argument('--check', action='store_true', help='Read source counts without sending or changing state')
    parser.add_argument('--status', action='store_true')
    args = parser.parse_args()
    os.umask(0o077)
    if args.status:
        print(STATUS.read_text())
        return
    credential_dir = Path(os.environ.get('CREDENTIALS_DIRECTORY', '/etc/developed-health'))
    config = load_config(credential_dir / 'sms.json')
    database_url = json.loads((credential_dir / 'registration-db.json').read_text())['databaseUrl']
    with STATE.with_suffix('.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        events = registrations(database_url)
        if args.check:
            print(json.dumps({'registrations': len(events), 'apps': sorted({e['app'] for e in events}),
                              'read_only': True}))
            return
        if not args.initialize and not STATE.exists():
            raise ValueError('Registration history missing; refusing to reset')
        with connect(STATE) as db:
            now = time.time()
            if args.initialize:
                initialize(db, events, now)
                result = summary(db, now)
            else:
                result = tick(db, events, config, now)
            save_status(result)
            print(json.dumps(result))


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # Do not expose DSNs, provider bodies, recipients, or subprocess stderr.
        print('Registration SMS notifier failed; inspect private state and configuration.', file=sys.stderr)
        sys.exit(1)
