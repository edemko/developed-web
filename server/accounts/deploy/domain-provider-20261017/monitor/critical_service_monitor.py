#!/usr/bin/python3 -I
"""Durable, bounded critical outage detection with SMS Gate v1 notifications."""
import argparse
import copy
import fcntl
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

# -I excludes cwd/user modules; only import the root-owned sibling at installation.
sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from sms_gate_v1 import load_config, send, delivery

STATE_DIR = Path('/var/lib/developed-health')
STATE = STATE_DIR / 'critical-sms.json'
STATUS = STATE_DIR / 'critical-status.json'
MAINTENANCE = STATE_DIR / 'maintenance.json'
COOLDOWN = 600
DAILY_LIMIT = 10
APPS = ('airsoft', 'developed-accounts', 'karak2', 'kestrek', 'mega-music', 'myclinic',
        'otazkomat', 'screentime', 'vocabulum', 'jasom')
INFRA_UNITS = {'bind-boundary.service', 'developed-uid-boundary.service', 'green-provider-boundary.service',
    'developed-auth-green.service', 'developed-auth-domain.service', 'domain-provider-boundary.service', 'developed-data-boundary.service', 'docker.service', 'caddy.service',
    'cloudflared.service', 'cloudflared-sam-apps.service', 'tailscaled.service', 'ssh.socket',
    'webhook.service', 'developed-boot-check.timer'}
EXCLUDED = ('phonetech', 'promile')
EXTRA_UNITS = ['developed-accounts-mail-worker.service', 'developed-kestrek-notifications.service',
               'webhook.service', 'developed-boot-check.timer']
CONTAINERS = ['supabase-db', 'supabase-pooler', 'supabase-kong', 'supabase-rest',
              'supabase-storage', 'supabase-auth', 'developed-auth-green', 'developed-auth-domain', 'jasom-db', 'ntfy', 'bgutil-pot']


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as file:
        os.fchmod(file.fileno(), 0o600)
        json.dump(value, file, sort_keys=True)
        file.write('\n'); file.flush(); os.fsync(file.fileno())
    os.replace(temporary, path)
    fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try: os.fsync(fd)
    finally: os.close(fd)


def read_state(path=STATE):
    try:
        state = json.loads(path.read_text())
    except FileNotFoundError:
        return {'version': 1, 'observations': {}, 'attempts': []}
    if state.get('version') != 1 or not isinstance(state.get('observations'), dict) or not isinstance(state.get('attempts'), list):
        raise ValueError('Invalid SMS state; refusing to reset notification history')
    return state


def failure_identity(failure):
    if any(name in failure.lower() for name in EXCLUDED): return None
    # Deployment job failures and backup warnings stay in the existing ntfy report.
    # SMS is for unavailable services, their endpoints and exhausted disk space.
    if ('developed-release-poll' in failure or 'off-site backup' in failure
            or failure.startswith(('failed user unit ', 'failed unit '))):
        return None
    unit = re.search(r'(?:failed unit )?([A-Za-z0-9_@.\\-]+\.(?:service|socket|timer))', failure)
    if unit:
        if unit_scope(unit[1]) is None: return None
        name = re.sub(r'@[A-Za-z0-9_.-]+(?=\.service$)', '@current', unit[1])
        label = name.removesuffix('.service').removesuffix('.socket').removesuffix('.timer')
        label = label.replace('developed-', '').replace('@current', '')
        return 'unit:' + name, label
    if failure.startswith('container '):
        name = failure.split()[1]
        if name not in CONTAINERS: return None
        return 'container:' + name, name
    if failure.startswith('root filesystem'): return 'disk:root', 'disk space'
    label = failure.split(':', 1)[0]
    if label.split()[0] not in (*APPS, 'data-boundary', 'mega-youtube-front', 'download-relay', 'monitor-checks'):
        return None
    # Different HTTP statuses for the same endpoint are one outage, not new alerts.
    key = failure.split(' -> ', 1)[0] if ' -> ' in failure else label
    return 'health:' + key, label


def unit_scope(name):
    if name in INFRA_UNITS: return 'infra'
    if name in ('developed-accounts.service', 'developed-accounts-mail-worker.service'): return 'developed-accounts'
    if name == 'developed-kestrek-notifications.service': return 'kestrek'
    if name == 'developed-karak2.service': return 'karak2'
    if name == 'jasom-submissions-isolated.service' or re.fullmatch(r'jasom-web-isolated@(?:blue|green|current)\.service', name): return 'jasom'
    if name in ('mega-youtube-front.service', 'mega-youtube-isolated.service',
                'developed-youtube-egress.service', 'developed-youtube-status.service',
                'mega-music-session-cleanup.timer'): return 'mega-music'
    if re.fullmatch(r'mega-music-accounts-isolated@(?:[a-f0-9]{7,40}|current)\.service', name): return 'mega-music'
    for app in APPS:
        if re.fullmatch(r'developed-' + re.escape(app) + r'@(?:[a-f0-9]{7,40}|current)\.service', name): return app
    return None


def scope_for(failure):
    identity = failure_identity(failure)
    if not identity: return None
    key, label = identity
    if key.startswith('unit:'): return unit_scope(key[5:])
    if key == 'container:jasom-db': return 'jasom'
    if key == 'container:bgutil-pot': return 'mega-music'
    if key.startswith(('container:', 'disk:')): return 'infra'
    if label.startswith(('mega-youtube-front', 'download-relay')): return 'mega-music'
    return label.split()[0] if label.split()[0] in APPS else 'infra'


def deployment_windows(now, root=Path('/home/openclaw/.cache/developed-release')):
    windows = {}
    for app in APPS:
        lock = root / (app + '.deploy.lock')
        try:
            details = lock.stat()
            pid = int((lock / 'pid').read_text().strip())
            if details.st_uid != 1000 or not 0 <= now - details.st_mtime < 900: continue
            if Path(f'/proc/{pid}').stat().st_uid != 1000: continue
            args = Path(f'/proc/{pid}/cmdline').read_bytes().decode().split('\0')
            if not any(re.fullmatch(r'/opt/developed-control/developed-release-[0-9a-f]+/developed-release.mjs', a) for a in args): continue
            windows[app] = {'until': details.st_mtime + 900, 'source': 'active deployment', 'reason': 'release tool'}
        except (OSError, ValueError, UnicodeError): continue
    return windows


def maintenance_windows(now):
    try: windows = json.loads(MAINTENANCE.read_text())
    except FileNotFoundError: return {}
    if not isinstance(windows, dict): raise ValueError('Invalid maintenance state')
    return {scope: value for scope, value in windows.items() if value['until'] > now}


def suppress(failures, windows, now):
    unmuted, muted = [], []
    for failure in failures:
        scope = scope_for(failure)
        window = windows.get('all') or windows.get(scope)
        if window and window['until'] > now:
            identity = failure_identity(failure)
            muted.append({'scope': scope, 'label': identity[1] if identity else 'maintenance', **window})
        else: unmuted.append(failure)
    return unmuted, muted


def collect():
    loader = importlib.machinery.SourceFileLoader('installed_health', '/usr/local/sbin/developed-boot-check')
    spec = importlib.util.spec_from_loader(loader.name, loader)
    health = importlib.util.module_from_spec(spec); loader.exec_module(health)
    health.REQUIRED = list(dict.fromkeys(health.REQUIRED + EXTRA_UNITS))
    failures, info = health.run_once()
    # The periodic checker also notices a failed SMS monitor; do not turn its
    # previous exit status into a self-sustaining outage alert.
    failures = [f for f in failures if 'developed-critical-monitor.service' not in f
                and not f.startswith('critical SMS monitor ')]
    result = subprocess.run(['docker', 'inspect', '--format',
        '{{.Name}} {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}',
        *CONTAINERS], capture_output=True, text=True, timeout=10)
    present = {}
    for line in result.stdout.splitlines():
        fields = line.split()
        if len(fields) == 3: present[fields[0].lstrip('/')] = fields[1:]
    for name in CONTAINERS:
        state = present.get(name)
        if not state or state[0] != 'running' or state[1] in ('unhealthy', 'starting'):
            failures.append('container ' + name + ' unavailable')
    # disk warning threshold remains the existing 10% / 5 GiB check.
    return {'failures': sorted(set(failures)), 'info': info, 'deployment_windows': deployment_windows(time.time())}


def bounded_collect():
    try:
        result = subprocess.run(['/usr/bin/python3', '-I', '-B', str(Path(__file__).resolve()), '--collect'],
            capture_output=True, text=True, timeout=50)
        if result.returncode != 0: raise ValueError('collector failed')
        snapshot = json.loads(result.stdout)
        if not isinstance(snapshot['failures'], list): raise ValueError('invalid snapshot')
        return snapshot
    except Exception:
        return {'failures': ['monitor-checks: collector unavailable'], 'info': []}


def observe(previous, failures, now, boot_id):
    state = copy.deepcopy(previous)
    records = state['observations']
    reset = (state.get('boot_id') != boot_id or now - state.get('last_check', 0) > 180
             or now < state.get('last_check', 0))
    identities = dict(identity for f in failures if (identity := failure_identity(f)))
    if reset:
        for entry in records.values(): entry.update(bad=0, good=0, first_bad=now)
    for key in list(records):
        if key not in identities:
            entry = records[key]
            entry['good'] += 1; entry['bad'] = 0
            if entry['good'] >= 2: del records[key]
    for key, label in identities.items():
        if key not in records:
            records[key] = {'bad': 0, 'good': 0, 'first_bad': now, 'active': False,
                            'attempted': False, 'label': label}
        entry = records[key]
        if entry['bad'] == 0: entry['first_bad'] = now
        entry['bad'] += 1; entry['good'] = 0
        if entry['bad'] >= 2 and now - entry['first_bad'] >= 30: entry['active'] = True
    state.update(boot_id=boot_id, last_check=now)
    state['attempts'] = [a for a in state['attempts'] if now - a['at'] < 172800]
    return state


def candidates(state, now):
    # A backward clock jump also fails closed for rate limiting.
    attempts = state['attempts']
    if attempts and now - max(a['at'] for a in attempts) < COOLDOWN: return []
    if sum(now - a['at'] < 86400 for a in attempts) >= DAILY_LIMIT: return []
    return sorted(k for k, v in state['observations'].items()
                  if v['active'] and v['bad'] >= 2 and not v['attempted'])


def message(state, keys):
    labels = sorted(set(re.sub(r'[^A-Za-z0-9 .,_-]', '', state['observations'][k]['label'])[:45] for k in keys))
    summary = ', '.join(labels)
    if len(summary) > 108: summary = summary[:105].rstrip(' ,') + '...'
    return 'sam CRITICAL: ' + summary + '. Check service logs.'


def reserve(state, keys, now):
    for key in keys: state['observations'][key]['attempted'] = True
    attempt = {'at': now, 'keys': keys, 'status': 'unknown', 'code': 'RESERVED_BEFORE_SEND'}
    state['attempts'].append(attempt)
    return attempt


def refresh_delivery(state, config, now):
    pending = [a for a in state['attempts'] if a['status'] == 'accepted'
               and now - a.get('checked_at', 0) >= 60]
    for attempt in sorted(pending, key=lambda a: a.get('checked_at', 0))[:2]:
        result = delivery(config, attempt['message_id'])
        attempt['checked_at'] = now
        attempt['delivery'] = result
        if result['status'] == 'delivered': attempt['status'] = 'delivered'
        elif result['status'] == 'failed': attempt['status'] = 'failed'
        elif now - attempt['at'] > 3600:
            attempt['status'] = 'unknown'; attempt['code'] = 'DELIVERY_NOT_CONFIRMED'


def summarize(state):
    active = {k: v['label'] for k, v in state['observations'].items() if v['active'] and v['good'] < 2}
    issues = [a for a in state['attempts'] if a['status'] in ('unknown', 'rejected', 'failed')
              and any(k in active for k in a['keys'])]
    return {'checked_at': state.get('last_check'), 'critical': sorted(set(active.values())),
            'maintenance': state.get('maintenance', {}), 'suppressed': state.get('suppressed', []),
            'sms_problem': bool(issues), 'attempts_last_48h': len(state['attempts']),
            'last_sms': {k: v for k, v in state['attempts'][-1].items() if k != 'keys'} if state['attempts'] else None}


def main(argv=None):
    parser = argparse.ArgumentParser()
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--collect', action='store_true', help=argparse.SUPPRESS)
    modes.add_argument('--check', action='store_true', help='read-only probes; never update state or send SMS')
    modes.add_argument('--status', action='store_true', help='show saved monitoring status')
    modes.add_argument('--maintenance', choices=(*APPS, 'infra', 'all'), help='temporarily suppress a production scope')
    modes.add_argument('--resume', choices=(*APPS, 'infra', 'all'), help='end a maintenance window early')
    parser.add_argument('--minutes', type=int, default=60, help='maintenance duration, 1..240 minutes')
    parser.add_argument('--reason', default='planned development', help='short maintenance reason')
    args = parser.parse_args(argv)
    if args.collect:
        print(json.dumps(collect())); return 0
    if args.check:
        snapshot = bounded_collect(); print(json.dumps(snapshot))
        return int(bool(snapshot['failures']))
    if args.status:
        summary = summarize(read_state())
        now = time.time()
        summary['maintenance'] = deployment_windows(now) | maintenance_windows(now)
        print(json.dumps(summary)); return 0
    STATE_DIR.mkdir(mode=0o700, exist_ok=True)
    with (STATE_DIR / 'critical-sms.lock').open('a') as lock:
        os.chmod(lock.name, 0o600)
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.maintenance or args.resume:
            now = time.time()
            windows = maintenance_windows(now)
            if args.maintenance:
                if not 1 <= args.minutes <= 240: raise ValueError('Maintenance must expire within four hours')
                reason = re.sub(r'[^A-Za-z0-9 .,_-]', '', args.reason)[:120]
                windows[args.maintenance] = {'until': now + args.minutes * 60, 'source': 'manual maintenance', 'reason': reason}
            else: windows.pop(args.resume, None)
            atomic_json(MAINTENANCE, windows)
            print(json.dumps({'maintenance': windows})); return 0
        credential = Path(os.environ.get('CREDENTIALS_DIRECTORY', '/etc/developed-health')) / 'sms.json'
        config = load_config(credential)
        previous = read_state()
        snapshot = bounded_collect()
        now = time.time()
        windows = snapshot.get('deployment_windows', {}) | maintenance_windows(now)
        failures, suppressed = suppress(snapshot['failures'], windows, now)
        state = observe(previous, failures, now, Path('/proc/sys/kernel/random/boot_id').read_text().strip())
        state.update(maintenance=windows, suppressed=suppressed)
        # Poll receipts independently; accepted never means delivered.
        refresh_delivery(state, config, now)
        keys = candidates(state, now)
        uptime = float(Path('/proc/uptime').read_text().split()[0])
        if keys and uptime >= 180:
            text = message(state, keys)
            attempt = reserve(state, keys, now)
            atomic_json(STATE, state)  # Persist before the non-idempotent external call.
            attempt.update(send(config, text))
            print('SMS submission: ' + attempt['status'])
        atomic_json(STATE, state)
        summary = summarize(state)
        atomic_json(STATUS, summary)
        print(json.dumps(summary))
        return int(summary['sms_problem'])


if __name__ == '__main__':
    try: sys.exit(main())
    except Exception:
        # Do not expose credentials, environment, provider responses or stack traces.
        print('Critical monitoring failed; inspect private configuration/state.', file=sys.stderr)
        sys.exit(1)
