// One-time: move a side's Caddy root from a literal release path onto the side's symlink
// (side.switch.link), so later web switches are an atomic symlink swap with no Caddy reload.
// Edits only that one root line, under the shared Caddy lock, through reload-public-sites.
import { checkHealth } from './switch.mjs';
import { log, ReleaseError, sudo, sudoRead } from './sh.mjs';

const EDIT = String.raw`
set -euo pipefail
caddyfile=/etc/caddy/Caddyfile from=$1 to=$2 backup=$3
exec 9>/var/lock/caddy-config.lock
flock -w 60 9
install -d -m 0700 "$(dirname "$backup")"
cp -a "$caddyfile" "$backup"
tmp=$(mktemp)
awk -v from="$from" -v to="$to" '{ t = $0; sub(/^[ \t]+/, "", t)
  if (t == "root * " from) { match($0, /^[ \t]*/); print substr($0, 1, RLENGTH) "root * " to } else print }' \
  "$caddyfile" > "$tmp"
[ "$(diff "$caddyfile" "$tmp" | grep -c '^[<>]')" -eq 2 ] || { rm -f "$tmp"; echo "edit was not exactly one line" >&2; exit 1; }
caddy validate --config "$tmp" --adapter caddyfile >/dev/null 2>&1 || { rm -f "$tmp"; echo "caddy validate failed" >&2; exit 1; }
cat "$tmp" > "$caddyfile"; rm -f "$tmp"
if ! /usr/local/bin/reload-public-sites; then
  cat "$backup" > "$caddyfile"; /usr/local/bin/reload-public-sites || true
  echo "reload failed; Caddyfile restored" >&2; exit 1
fi`;

const RESTORE = String.raw`
set -euo pipefail
exec 9>/var/lock/caddy-config.lock
flock -w 60 9
cat "$1" > /etc/caddy/Caddyfile
/usr/local/bin/reload-public-sites`;

export async function adoptWebSymlink(config, sideName, flags) {
  const side = config.sides[sideName];
  if (side?.switch?.type !== 'web-symlink') throw new ReleaseError(`${sideName} is not a web-symlink side`);
  const link = side.switch.link;
  const from = flags.from;
  if (typeof from !== 'string' || !from.startsWith('/opt/')) throw new ReleaseError('--from=<current Caddy root under /opt> is required');
  const roots = sudoRead('/etc/caddy/Caddyfile').split('\n').map((l) => l.trim());
  if (roots.includes(`root * ${link}`)) { log(`Caddy already serves ${link}`); return; }
  if (roots.filter((l) => l === `root * ${from}`).length !== 1) throw new ReleaseError(`expected exactly one "root * ${from}"`);
  if (sudo('test', ['-d', from], { allowFail: true }).status !== 0) throw new ReleaseError(`${from} is not a directory`);

  if (sudo('test', ['-e', link], { allowFail: true }).status !== 0) sudo('ln', ['-s', from, link]);
  if (sudo('readlink', ['-f', link]).out !== sudo('readlink', ['-f', from]).out) {
    throw new ReleaseError(`${link} exists but does not resolve to ${from}`);
  }
  const backup = `/var/backups/developed-release/Caddyfile.${config.app}.${new Date().toISOString().replace(/[:.]/g, '-')}`;
  sudo('bash', ['-c', EDIT, 'adopt', from, link, backup], { stream: true });
  try {
    await checkHealth(side, { wait: 10 });
  } catch (error) {
    sudo('bash', ['-c', RESTORE, 'restore', backup], { stream: true });
    throw new ReleaseError(`site check failed after adopting the symlink — Caddyfile restored from ${backup}\n${error.message}`);
  }
  log(`${config.app}: Caddy ${sideName} root is now ${link} -> ${from} (backup ${backup})`);
}
