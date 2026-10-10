#!/usr/bin/env bash
# Install a frozen, root-owned copy of developed-release from a committed revision of
# developed-web and point the openclaw user poll unit at it. Does NOT enable the timer.
#   install.sh [<developed-web commit>]   (default: origin/main)
set -euo pipefail
REPO=/home/openclaw/Dev/developed-web
SUB=server/accounts/deploy/release
git -C "$REPO" fetch --quiet origin main
SHA=$(git -C "$REPO" rev-parse --verify "${1:-origin/main}^{commit}")
git -C "$REPO" merge-base --is-ancestor "$SHA" origin/main || { echo "commit must be on origin/main" >&2; exit 1; }
DEST=/opt/developed-control/developed-release-${SHA:0:12}
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
git -C "$REPO" archive "$SHA" "$SUB" | tar -x -C "$TMP"
printf '%s\n' "${SHA:0:12}" > "$TMP/$SUB/VERSION"
/home/openclaw/.nvm/versions/node/v22.23.2/bin/node --test "$TMP/$SUB/developed-release.test.mjs" >/dev/null
if ! sudo test -d "$DEST"; then
  sudo cp -a "$TMP/$SUB" "$DEST.tmp"
  sudo chown -R root:root "$DEST.tmp"
  sudo chmod -R u=rwX,go=rX "$DEST.tmp"
  sudo mv -T "$DEST.tmp" "$DEST"
fi
UNITS=/home/openclaw/.config/systemd/user
mkdir -p "$UNITS" /home/openclaw/.cache/developed-release
sed "s#@TOOL@#$DEST#" "$TMP/$SUB/systemd/developed-release-poll.service" > "$UNITS/developed-release-poll.service"
cp "$TMP/$SUB/systemd/developed-release-poll.timer" "$UNITS/"
systemctl --user daemon-reload
echo "installed $DEST; poll unit points at it."
echo "enable with: systemctl --user enable --now developed-release-poll.timer"
