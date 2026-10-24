#!/bin/bash
# Reviewed host hook for /usr/local/bin/deploy-developed-web.
# Runs only as developed-webhook, without sudo, Docker or operator credentials.
# Publish a curated public Git snapshot; never touch the development checkout.
set -euo pipefail
test "$#" -eq 0
test "$(id -un)" = developed-webhook
umask 077
export PATH=/usr/bin:/bin
export GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_TERMINAL_PROMPT=0
state=/var/lib/developed-webhook
repo="$state/source.git"
webroot=/var/www/developed.sk
test -d "$webroot" && test ! -L "$webroot"
exec 9>"$state/deploy.lock"
# Serialize deliveries so a push arriving during a fetch is not silently lost.
flock 9
if test ! -d "$repo"; then git init --bare "$repo"; fi
git --git-dir="$repo" -c core.hooksPath=/dev/null -c credential.helper= \
  fetch --depth=1 --no-tags https://github.com/edemko/developed-web.git \
  +refs/heads/main:refs/heads/main
release_sha=$(git --git-dir="$repo" rev-parse --verify 'refs/heads/main^{commit}')
release_dir=$(mktemp -d /tmp/developed-marketing-release-XXXXXX)
# This trap only removes the exact private directory just created by mktemp.
trap 'rm -r -- "$release_dir"' EXIT
git --git-dir="$repo" archive "$release_sha" -- \
  .well-known DevelopED.png assets cookies en favicon.png index.html \
  ochrana-osobnych-udajov og-image.png podmienky-pouzivania pravne-informacie \
  robots.txt script.js sitemap.xml styles.css \
  airsoft kestrek mega-music odonto-ai otazkomat screen-time vocabulum | tar -x -C "$release_dir"
test -f "$release_dir/index.html"
test -f "$release_dir/styles.css"
/usr/local/bin/check-publication "$release_dir"
# webroot contains only this application's static marketing release. Account
# services, repositories, environment files and build dependencies never belong here.
# Apply the public modes even under the hook's private umask (including new assets).
rsync -rltp --delete-delay --delay-updates --chmod=D755,F644 "$release_dir/" "$webroot/"
echo "deployed static marketing $release_sha at $(date -Is)"
