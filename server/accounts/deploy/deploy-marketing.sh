#!/bin/bash
# Reviewed host hook for /usr/local/bin/deploy-developed-web.
# Publish a curated remote Git snapshot; never reset the shared development tree.
set -euo pipefail
repo=/home/openclaw/Dev/developed-web
webroot=/var/www/developed.sk
mkdir -p /home/openclaw/.local/state
exec 9>/home/openclaw/.local/state/developed-marketing-deploy.lock
flock 9
cd "$repo"
git fetch origin main
release_sha=$(git rev-parse --verify origin/main)
release_dir=$(mktemp -d /tmp/developed-marketing-release-XXXXXX)
# This trap only removes the exact private directory just created by mktemp.
trap 'rm -r -- "$release_dir"' EXIT
git archive "$release_sha" -- \
  .well-known DevelopED.png assets cookies en favicon.png index.html \
  ochrana-osobnych-udajov og-image.png podmienky-pouzivania pravne-informacie \
  robots.txt script.js sitemap.xml styles.css | tar -x -C "$release_dir"
test -f "$release_dir/index.html"
test -f "$release_dir/styles.css"
/usr/local/bin/check-publication "$release_dir"
# webroot contains only this application's static marketing release. Account
# services, repositories, environment files and build dependencies never belong here.
rsync -a --delete --chmod=D755,F644 "$release_dir/" "$webroot/"
echo "deployed static marketing $release_sha at $(date -Is)"
