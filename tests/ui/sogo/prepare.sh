#!/usr/bin/env bash
# Builds the webmail mock used by tests/ui/smoke.mjs. SOGo can't run without its database and
# mail services, so the mock loads SOGo's own stylesheets and scripts (Angular Material,
# CKEditor 5) at the version mailcow runs, our data/conf/sogo files, and pages whose markup is
# copied from SOGo's templates. It also builds the "live" Mail page (live.py): SOGo's real page
# rendered from its .wox templates, which runs against the fake server in backend.mjs.
# Output: tests/ui/.cache/sogo-root (served as the web root on port 8095), live page in live/.
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)
cache="$here/../.cache"
mkdir -p "$cache"

version=$(grep -o 'ghcr.io/mailcow/sogo:[0-9.]*' "$repo/docker-compose.yml" | head -n 1 | sed 's/.*sogo://; s/\.$//')
src="$cache/sogo-$version"
# Web resources, the .wox templates and the English strings (for the live page, see live.py)
parts="UI/WebServerResources/css UI/WebServerResources/js UI/WebServerResources/img UI/Templates
  UI/Common/English.lproj UI/MailerUI/English.lproj UI/PreferencesUI/English.lproj"
if [ ! -d "$src/UI/WebServerResources/js" ]; then
  rm -rf "$src"
  git -c advice.detachedHead=false clone --quiet --depth 1 --branch "SOGo-$version" --filter=blob:none --sparse https://github.com/Alinto/sogo.git "$src"
fi
if [ ! -f "$src/UI/MailerUI/English.lproj/Localizable.strings" ] || [ ! -d "$src/UI/WebServerResources/img" ]; then
  # shellcheck disable=SC2086
  git -C "$src" sparse-checkout set $parts
fi

icons="$cache/material-icons"
if [ ! -f "$icons/MaterialIcons-Regular.woff2" ]; then
  rm -rf "$icons" && mkdir -p "$icons"
  (cd "$icons" && npm pack --silent material-icons@1.13.12 >/dev/null && tar -xzf material-icons-*.tgz \
    && cp package/iconfont/material-icons.woff2 MaterialIcons-Regular.woff2)
fi

root="$cache/sogo-root"
web="$root/SOGo.woa/WebServerResources"
rm -rf "$root"
mkdir -p "$web/js" "$web/fonts" "$web/img"
ln -s "$src/UI/WebServerResources/css" "$web/css"
for f in "$src"/UI/WebServerResources/js/*; do
  ln -s "$f" "$web/js/$(basename "$f")"
done
# Our files take the place of SOGo's sample theme, as the docker-compose mounts do
rm -f "$web/js/theme.js"
ln -s "$repo/data/conf/sogo/custom-theme.js" "$web/js/theme.js"
ln -s "$repo/data/conf/sogo/custom-sogo.js" "$web/js/custom-sogo.js"
for f in "$src"/UI/WebServerResources/img/*; do
  ln -s "$f" "$web/img/$(basename "$f")"
done
# The images mailcow mounts over SOGo's (docker-compose.yml)
for pair in custom-favicon.ico:sogo.ico custom-shortlogo.svg:sogo-compact.svg custom-fulllogo.svg:sogo-full.svg custom-fulllogo.png:sogo-logo.png; do
  ln -sfn "$repo/data/conf/sogo/${pair%%:*}" "$web/img/${pair##*:}"
done
cp "$icons/MaterialIcons-Regular.woff2" "$web/fonts/"
# Same origin as the console: Inter and the logos come from data/web
ln -s "$repo/data/web/fonts" "$root/fonts"
ln -s "$repo/data/web/img" "$root/img"
# The installable webmail's manifest, linked from every webmail page
ln -s "$repo/data/web/webmail.webmanifest" "$root/webmail.webmanifest"

python3 "$here/build.py" "$root"

# The live page: SOGo's real templates, patched like mailcow's bootstrap-sogo.sh does at boot
templates="$cache/sogo-templates"
rm -rf "$templates"
cp -r "$src/UI/Templates" "$templates"
patch -R -s "$templates/UIxTopnavToolbar.wox" < "$repo/data/Dockerfiles/sogo/navMailcowBtns.diff"
python3 "$here/live.py" "$src" "$templates" "$root/live"
echo "Webmail mock for SOGo $version in $root"
