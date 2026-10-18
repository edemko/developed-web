#!/usr/bin/python3 -I
"""Health check for sam, after boot and every fifteen minutes.

Checks that every enabled service naming a /opt/developed-runtimes Node is active and runs
exactly that Node, the boundaries, JASOM and infra units are up, every health probe of every
developed-release app passes (read from the installed tool copy, so it follows config changes),
the guard-coupled jobs passed their guards, and no unit or container failed. Retries for a few
minutes while things settle, then reports to ntfy and /var/log/developed-boot-check.log.

Read-only: asks systemd, journald, docker and HTTP endpoints. Never reads env files or cmdlines.
Run by hand: sudo /usr/local/sbin/developed-boot-check [--no-notify] [--settle SECONDS]
"""
import glob, json, os, re, shutil, subprocess, sys, time, urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

NTFY = 'http://127.0.0.1:8080/claude-sessions'
LOG = '/var/log/developed-boot-check.log'
STATE = '/var/lib/developed-health/last-notified.json'
BACKUP_SUCCESS = '/var/lib/developed-backup/last-success'
EXCLUDED = ('phonetech', 'promile')
POLL_UNIT = '/home/openclaw/.config/systemd/user/developed-release-poll.service'
RUNTIME = re.compile(r'/opt/developed-runtimes/node-v[0-9.]+/bin/node')
# Units that must be active but do not name a runtime path themselves (JASOM uses
# /opt/jasom/runtime-node in PATH; the rest is infrastructure everything else needs).
REQUIRED = ['bind-boundary.service', 'developed-uid-boundary.service', 'green-provider-boundary.service',
            'developed-auth-green.service', 'developed-data-boundary.service',
            'jasom-submissions-isolated.service',
            'mega-music-session-cleanup.timer', 'docker.service', 'caddy.service', 'cloudflared.service',
            'cloudflared-sam-apps.service', 'tailscaled.service', 'ssh.socket']
# Probes outside the release tool's app configs: (label, curl args, expected status).
EXTRA_PROBES = [
    ('jasom web', ['-H', 'Host: jasom.developed.sk', '-H', 'Cf-Connecting-Ip: 127.0.0.1',
                   '-H', 'X-Forwarded-Proto: https', 'http://127.0.0.1/health'], 200),
    ('jasom session', ['-H', 'Host: jasom.developed.sk', '-H', 'Cf-Connecting-Ip: 127.0.0.1',
                       '-H', 'X-Forwarded-Proto: https', 'http://127.0.0.1/api/auth/session'], 200),
    ('data-boundary', ['http://127.0.0.1:3143/healthz'], 200),
    ('mega-youtube-front', ['--unix-socket', '/run/mega-youtube-front/control.sock', 'http://localhost/status'], 200),
]
TCP_PROBES = [('download-relay', '127.0.0.1', 1088)]
GUARD_LOGS = [('developed-kestrek-notifications.service', 'ownershipVerified')]


def sh(*cmd):
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=12).stdout
    except subprocess.TimeoutExpired:
        return ''


def systemctl(*args):
    return sh('systemctl', *args)


def runtime_units(failures, info):
    loaded = [l.split()[0] for l in systemctl('list-units', '--all', '--type=service', '--plain', '--no-legend').splitlines() if l.strip()]
    states = systemctl('is-enabled', '--', *loaded).splitlines() if loaded else []
    in_use = Counter()
    count = 0
    for unit, state in zip(loaded, states):
        if any(name in unit.lower() for name in EXCLUDED):
            continue
        if state != 'enabled':
            continue
        named = set(RUNTIME.findall(systemctl('cat', '--', unit)))
        if not named:
            continue
        count += 1
        active = systemctl('is-active', unit).strip()
        if active != 'active':
            failures.append(f'{unit} is {active}')
            continue
        pid = systemctl('show', '-p', 'MainPID', '--value', unit).strip()
        try:
            exe = os.readlink(f'/proc/{pid}/exe') if pid not in ('', '0') else ''
        except OSError:
            exe = ''
        if exe.startswith('/opt/developed-runtimes/'):
            in_use[exe.split('/')[3]] += 1
            if exe not in named:
                failures.append(f'{unit} runs {exe}, unit names {", ".join(sorted(named))}')
    info.append(f'{count} enabled runtime units; main processes on ' +
                (', '.join(f'{v} x{n}' for v, n in sorted(in_use.items())) or 'no runtime'))
    if len(in_use) > 1:
        info.append('NOTE: more than one Node runtime in use')


def required_units(failures):
    for unit in REQUIRED:
        active = systemctl('is-active', unit).strip()
        if active != 'active':
            failures.append(f'{unit} is {active}')
    jasom_runtime(failures)


def jasom_active_unit():
    # Only the routed slot is required; the other slot normally stops after a
    # successful deployment. Never treat any running slot as sufficient.
    with open('/etc/caddy/Caddyfile') as file:
        config = file.read()
    start, end = '# BEGIN jasom\n', '# END jasom'
    if config.count(start) != 1 or config.count(end) != 1:
        raise ValueError('JASOM route markers changed')
    block = config.split(start, 1)[1].split(end, 1)[0]
    ports = re.findall(r'^\s*reverse_proxy 127\.0\.0\.1:(18090|18091) \{', block, re.M)
    if len(ports) != 1:
        raise ValueError('JASOM upstream changed')
    slot = 'blue' if ports[0] == '18090' else 'green'
    return f'jasom-web-isolated@{slot}.service'


def jasom_runtime(failures):
    try:
        for _ in range(3):
            unit = jasom_active_unit()
            active = systemctl('is-active', unit).strip()
            # A deployment can switch routes and stop the old slot while this
            # check is running. Recheck the selected slot before reporting it.
            if unit != jasom_active_unit():
                continue
            if active != 'active':
                failures.append(f'{unit} is {active or "unknown"}')
            return
    except (OSError, ValueError):
        pass
    failures.append('jasom routing: cannot determine active web slot')


def failed_units(failures):
    for scope in ([], ['--user', '-M', 'openclaw@']):
        for line in systemctl(*scope, '--failed', '--plain', '--no-legend').splitlines():
            if line.strip():
                unit = line.split()[0]
                # A previous failed execution is evidence already represented by
                # the current probes, not a new failure of the checker itself.
                if unit == 'developed-boot-check.service' or any(name in unit.lower() for name in EXCLUDED):
                    continue
                failures.append(f'failed{" user" if scope else ""} unit {unit}')


def tool_dir():
    try:
        m = re.search(r'(/opt/developed-control/developed-release-[0-9a-f]+)/developed-release\.mjs', open(POLL_UNIT).read())
        if m:
            return m.group(1)
    except OSError:
        pass
    return '/home/openclaw/Dev/developed-web/server/accounts/deploy/release'


def probes():
    out = []
    for path in sorted(glob.glob(f'{tool_dir()}/apps/*.json')):
        if any(name in os.path.basename(path).lower() for name in EXCLUDED):
            continue
        config = json.load(open(path))
        for side, spec in config.get('sides', {}).items():
            for check in spec.get('health', []):
                args = [a for h in check.get('headers', []) for a in ('-H', h)]
                if check.get('socket'):
                    args += ['--unix-socket', check['socket']]
                out.append((f'{config["app"]} {side}', args + [check['url']], check['status']))
    return out + EXTRA_PROBES


def health(failures, info):
    checks = probes()
    def check(probe):
        label, args, want = probe
        got = sh('curl', '-s', '-o', '/dev/null', '-m', '5', '-w', '%{http_code}', *args).strip()
        if got != str(want):
            return f'{label}: {args[-1]} -> {got or "000"} (want {want})'
        return None
    # Bound widespread outages: independent endpoints must not each consume a
    # full sequential timeout before the monitor can report the first failure.
    with ThreadPoolExecutor(max_workers=8) as pool:
        failures.extend(result for result in pool.map(check, checks) if result)
    for label, host, port in TCP_PROBES:
        if subprocess.run(['timeout', '3', 'bash', '-c', f'</dev/tcp/{host}/{port}'], capture_output=True).returncode:
            failures.append(f'{label}: tcp {host}:{port} closed')
    info.append(f'{len(checks) + len(TCP_PROBES)} health probes')


def guards(failures):
    for unit, marker in GUARD_LOGS:
        text = sh('journalctl', '-b', '-u', unit, '-q', '--no-pager', '-o', 'cat')
        if marker not in text:
            failures.append(f'{unit}: no {marker} since boot')


def containers(failures, info):
    ids = sh('docker', 'ps', '-aq').split()
    data = json.loads(sh('docker', 'inspect', *ids) or '[]') if ids else []
    up = 0
    for c in data:
        name, state = c['Name'].lstrip('/'), c['State']
        policy = c['HostConfig']['RestartPolicy']['Name']
        health_state = (state.get('Health') or {}).get('Status')
        if state.get('Running'):
            up += 1
            if health_state == 'unhealthy':
                failures.append(f'container {name} unhealthy')
        elif policy in ('always', 'unless-stopped'):
            failures.append(f'container {name} {state.get("Status")} (restart {policy})')
    info.append(f'{up} containers running')


def run_once():
    failures, info = [], []
    runtime_units(failures, info)
    required_units(failures)
    failed_units(failures)
    health(failures, info)
    guards(failures)
    containers(failures, info)
    disk_and_backup(failures, info)
    critical_monitor_health(failures, info)
    registration_monitor_health(failures, info)
    if os.path.exists('/var/run/reboot-required'):
        info.append('NOTE: /var/run/reboot-required is set')
    if os.path.exists('/etc/developed-apps/developed-release-paused'):
        info.append('NOTE: developed-release is paused')
    poll = subprocess.run(['systemctl', '--user', '-M', 'openclaw@', 'is-active', 'developed-release-poll.timer'],
                          capture_output=True, text=True).stdout.strip()
    if poll != 'active':
        failures.append(f'developed-release-poll.timer is {poll}')
    return failures, info


def critical_monitor_health(failures, info):
    # Independent supervision: a stuck/crashed SMS checker must not silently
    # disappear merely because it cannot report its own failure.
    if not os.path.exists('/etc/systemd/system/developed-critical-monitor.timer'):
        return
    active = systemctl('is-active', 'developed-critical-monitor.timer').strip()
    if active != 'active':
        failures.append('critical SMS monitor timer is ' + active)
    try:
        with open('/var/lib/developed-health/critical-status.json') as file:
            status = json.load(file)
        if time.time() - status['checked_at'] > 180:
            failures.append('critical SMS monitor results are stale')
        if status.get('sms_problem'):
            failures.append('critical SMS monitor could not confirm an outage notification')
    except (OSError, ValueError, KeyError, TypeError):
        failures.append('critical SMS monitor results are unavailable')


def registration_monitor_health(failures, info):
    if not os.path.exists('/etc/systemd/system/developed-registration-sms.timer'):
        return
    active = systemctl('is-active', 'developed-registration-sms.timer').strip()
    if active != 'active':
        failures.append('registration SMS monitor timer is ' + active)
    try:
        with open('/var/lib/developed-health/registration-status.json') as file:
            status = json.load(file)
        if time.time() - status['checked_at'] > 300:
            failures.append('registration SMS monitor results are stale')
        if status.get('sms_problem'):
            failures.append('registration SMS monitor has an unconfirmed notification')
    except (OSError, ValueError, KeyError, TypeError):
        failures.append('registration SMS monitor results are unavailable')


def disk_and_backup(failures, info):
    disk = shutil.disk_usage('/')
    available = disk.free / disk.total
    info.append(f'root filesystem: {available:.0%} available')
    if available < 0.10 or disk.free < 5 * 1024**3:
        failures.append('root filesystem has less than 10% or 5 GiB available')
    try:
        age = max(0, time.time() - os.stat(BACKUP_SUCCESS).st_mtime)
        info.append(f'last successful off-site backup: {age / 3600:.1f} hours ago')
        if age > 30 * 3600:
            failures.append('off-site backup success is older than 30 hours')
    except FileNotFoundError:
        failures.append('off-site backup success receipt is missing')


def notify(message, priority):
    for _ in range(5):
        try:
            req = urllib.request.Request(NTFY, data=message.encode(), headers={'Title': 'sam boot check', 'Priority': priority})
            with urllib.request.urlopen(req, timeout=10) as response:
                if 200 <= response.status < 300:
                    return True
        except Exception:
            time.sleep(30)
    return False


def notification_due(failures, previous, now):
    changed = sorted(set(failures)) != previous.get('failures')
    return changed or (bool(failures) and now - previous.get('sent_at', 0) >= 6 * 3600)


def main(argv):
    settle = int(argv[argv.index('--settle') + 1]) if '--settle' in argv else 300
    deadline = time.monotonic() + settle
    while True:
        failures, info = run_once()
        if not failures or time.monotonic() >= deadline:
            break
        time.sleep(20)
    booted = sh('uptime', '-s').strip()
    status = 'OK' if not failures else f'{len(failures)} PROBLEM(S)'
    report = [f'boot {booted}: {status}', *info, *failures]
    text = '\n'.join(report)
    print(text)
    try:
        with open(LOG, 'a') as f:
            f.write(f'--- {time.strftime("%F %T")}\n{text}\n')
    except OSError:
        pass
    if '--no-notify' not in argv:
        try:
            with open(STATE) as file:
                previous = json.load(file)
        except (FileNotFoundError, ValueError):
            previous = {}
        now = time.time()
        if notification_due(failures, previous, now):
            lines = report if len(report) <= 20 else report[:19] + [f'... {len(report) - 19} more in {LOG}']
            if not notify('\n'.join(lines), 'default' if not failures else 'high'):
                print('Health notification delivery failed; state not acknowledged.', file=sys.stderr)
                return 1
            os.makedirs(os.path.dirname(STATE), mode=0o700, exist_ok=True)
            temporary = STATE + '.tmp'
            with open(temporary, 'w') as file:
                os.chmod(temporary, 0o600)
                json.dump({'failures': sorted(set(failures)), 'sent_at': now}, file)
            os.replace(temporary, STATE)
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
