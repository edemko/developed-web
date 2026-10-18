#!/usr/bin/python3 -I
"""Nonsecret release/image/UID inventory for off-site reconstruction."""
import datetime
import json
import os
import subprocess


def run(*args):
    return subprocess.check_output(args, text=True)


units = []
for line in run('systemctl', 'list-units', '--type=service', '--state=running', '--plain', '--no-legend').splitlines():
    name = line.split()[0]
    if any(part in name.lower() for part in ('phonetech', 'promile', 'sam-restore', 'candidate')):
        continue
    if not any(part in name for part in ('developed', 'jasom', 'mega', 'webhook', 'cloudflared')):
        continue
    values = dict(line.split('=', 1) for line in run('systemctl', 'show', name,
                  '-p', 'User', '-p', 'Group', '-p', 'WorkingDirectory', '-p', 'MainPID').splitlines())
    pid = values.pop('MainPID', '0')
    try:
        values['executable'] = os.readlink(f'/proc/{pid}/exe')
        values['release'] = os.readlink(f'/proc/{pid}/cwd')
    except FileNotFoundError:
        values['processChangedDuringInventory'] = True
    units.append({'unit': name, **values})

containers = []
for name in run('docker', 'ps', '--format', '{{.Names}}').splitlines():
    if any(part in name.lower() for part in ('phonetech', 'promile', 'sam-restore')):
        continue
    value = json.loads(run('docker', 'inspect', '--format',
                          '{"image":{{json .Config.Image}},"imageId":{{json .Image}}}', name))
    containers.append({'name': name, **value})

print(json.dumps({'createdAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'services': units, 'containers': containers}, indent=2))
