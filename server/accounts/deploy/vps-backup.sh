#!/usr/bin/env bash
# Nightly off-box backup of sam to MEGA S4 (bucket vps, prefix backups/), encrypted with restic.
# Runs as root from vps-backup.timer (03:30, after pg-backup.sh at 02:30). Docs:
# ~/workspace/docs/config/vps-offsite-backup.md
set -euo pipefail
umask 077
export RESTIC_REPOSITORY=rclone:s4-media:vps/backups
export RESTIC_PASSWORD_FILE=/home/openclaw/.secrets/restic-vps.pass
export RESTIC_CACHE_DIR=/var/cache/developed-backup
export RCLONE_CONFIG=/home/openclaw/.config/rclone/rclone.conf
NTFY=http://127.0.0.1:8080/claude-sessions
DUMPS=/var/backups/vps-dumps
fail() { curl -fsS -m 10 -H 'Title: sam backup FAILED' -H 'Priority: high' -d "$1" "$NTFY" >/dev/null || true; exit 1; }
trap 'fail "vps-backup.sh failed at line $LINENO"' ERR

install -d -m 700 "$DUMPS"
# Portable logical dumps (the PITR base+WAL in ~/pg-backup is the precise copy).
docker exec supabase-db pg_dumpall -U supabase_admin | gzip -6 > "$DUMPS/supabase.sql.gz.tmp"
mv "$DUMPS/supabase.sql.gz.tmp" "$DUMPS/supabase.sql.gz"
# pg_dump omits this installation's extension-owned GraphQL compatibility
# function. Preserve its definition for a blank-cluster restore before its ACLs.
docker exec supabase-db psql -X -At -U supabase_admin -d postgres -c \
  "select pg_get_functiondef('graphql_public.graphql(text,text,jsonb,jsonb)'::regprocedure)" \
  > "$DUMPS/graphql-wrapper.sql.tmp"
test -s "$DUMPS/graphql-wrapper.sql.tmp"
mv "$DUMPS/graphql-wrapper.sql.tmp" "$DUMPS/graphql-wrapper.sql"
docker exec jasom-db pg_dumpall -U jasom | gzip -6 > "$DUMPS/jasom.sql.gz.tmp"
mv "$DUMPS/jasom.sql.gz.tmp" "$DUMPS/jasom.sql.gz"
crontab -u openclaw -l > "$DUMPS/crontab-openclaw.txt" 2>/dev/null || true

# Recovery also needs runtime configuration, private application state, host
# tooling and the database encryption-key volume, not only logical SQL dumps.
EXTRA=(
  /etc/jasom /etc/developed /etc/developed-youtube /etc/developed-tunnels /etc/developed-health
  /etc/ssh /etc/ufw /etc/fail2ban /etc/logrotate.d /etc/webhook.conf /etc/nftables.conf
  /usr/local/bin /usr/local/sbin
  /home/openclaw/.cloudflared /home/openclaw/.config/systemd/user
  /var/lib/jasom /var/lib/jasom-worker /var/lib/developed-health
  /opt/developed-accounts/mail-workers /opt/developed-accounts/marketing
  /var/lib/docker/volumes/supabase_db-config/_data
  /var/lib/docker/volumes/deploy_ntfy-etc/_data
  /home/openclaw/Dev/supabase/docker/docker-compose.yml
  /home/openclaw/Dev/supabase/docker/volumes/db
)
/usr/local/sbin/developed-backup-manifest > "$DUMPS/runtime-manifest.json.tmp"
mv "$DUMPS/runtime-manifest.json.tmp" "$DUMPS/runtime-manifest.json"
restic backup --quiet --tag nightly --exclude '*.bak*' \
  --exclude /home/openclaw/Dev/supabase/docker/volumes/db/data \
  "$DUMPS" "${EXTRA[@]}" \
  /home/openclaw/pg-backup \
  /home/openclaw/Dev/supabase/docker/.env \
  /home/openclaw/Dev/supabase/docker/docker-compose.override.yml \
  /home/openclaw/Dev/supabase/docker/volumes/api \
  /home/openclaw/Dev/supabase/docker/volumes/storage \
  /home/openclaw/.secrets /home/openclaw/.zsh_secrets /home/openclaw/.ssh /home/openclaw/.config/rclone \
  /etc/caddy /etc/systemd/system /etc/developed-apps /etc/developed-accounts /etc/docker \
  /opt/developed-control \
  /var/lib/developed-kestrek /var/lib/developed-youtube /var/lib/mega-youtube /var/lib/karak2 \
  /var/lib/mega-music-macos-publisher /srv/mega-music /var/www

restic forget --quiet --prune --keep-daily 14 --keep-weekly 8 --keep-monthly 12

# Written only after the remote backup and retention operation both succeeded.
install -d -m 700 /var/lib/developed-backup
date -Is > /var/lib/developed-backup/last-success.tmp
mv /var/lib/developed-backup/last-success.tmp /var/lib/developed-backup/last-success
