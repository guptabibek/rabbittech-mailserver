#!/usr/bin/env bash
# Tests the host nginx's mail site: the root helper (deploy/nginx/rabbittech-front-nginx) on a
# throwaway nginx tree, and scripts/front-nginx.sh around it. nginx, systemctl, sudo and curl are
# fakes; tests/deploy/front-nginx-e2e.sh runs the site in real nginx.
# Run: bash tests/deploy/test-front-nginx.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HELPER="$ROOT/deploy/nginx/rabbittech-front-nginx"
T=$(mktemp -d)
trap 'rm -rf -- "${T:?}"' EXIT
failures=0 passed=0
check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
    [ -f "$T/out" ] && tail -n 6 "$T/out" | sed 's/^/         | /'
  fi
}

# ------------------------------------------------------------------ fakes
mkdir -p "$T/bin"
cat > "$T/bin/nginx" <<'FAKE'
#!/bin/bash
# nginx -t fails with FAKE_NGINX=fail, warns about a second site with FAKE_NGINX=conflict
case "$*" in
  -t)
    case "${FAKE_NGINX:-ok}" in
      fail) echo 'nginx: [emerg] unknown directive "proxy_pas" in /etc/nginx/sites-enabled/mail.rabbittech.com.np:52' >&2; echo 'nginx: configuration file /etc/nginx/nginx.conf test failed' >&2; exit 1 ;;
      conflict) echo 'nginx: [warn] conflicting server name "mail.rabbittech.com.np" on 0.0.0.0:443, ignored' >&2 ;;
    esac
    echo 'nginx: configuration file /etc/nginx/nginx.conf test is successful' >&2 ;;
  "-s reload") echo reload >> "$FAKE_LOG" ;;
  *) exit 2 ;;
esac
FAKE
cat > "$T/bin/systemctl" <<'FAKE'
#!/bin/bash
case "$*" in
  "is-active --quiet nginx") [ -n "${FAKE_SYSTEMD:-}" ] ;;
  "reload nginx") echo "systemctl reload" >> "$FAKE_LOG" ;;
  *) exit 2 ;;
esac
FAKE
# sudo keeps the environment here, so the helper uses the test's nginx tree
printf '#!/bin/sh\necho "sudo $*" >> "$FAKE_LOG"\n[ "$1" = -n ] && shift\nexec "$@"\n' > "$T/bin/sudo"
cat > "$T/bin/curl" <<'FAKE'
#!/bin/bash
echo "curl $*" >> "$FAKE_LOG"
printf '%s' "${FAKE_CODE:-302}"
FAKE
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" FAKE_LOG="$T/log"
export RT_NGINX_DIR="$T/nginx" RT_FRONT_STATE="$T/state" RT_FRONT_BACKUPS="$T/backups"

# A Let's Encrypt-like certificate, and mailcow's placeholder (issued by "mailcow")
cert() { openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "$2" -keyout "$1/key.pem" -out "$1/cert.pem" 2>/dev/null; }
mkdir -p "$T/app/data/assets/ssl" "$T/placeholder"
cert "$T/app/data/assets/ssl" "/O=Let's Encrypt/CN=R11"
cert "$T/placeholder" "/C=DE/ST=NRW/L=Willich/O=mailcow/OU=mailcow/CN=mail.example.org"

H=mail.rabbittech.com.np
AVAILABLE="$RT_NGINX_DIR/sites-available/$H"
ENABLED="$RT_NGINX_DIR/sites-enabled/$H"
site() { # a site config: marker, a version line, the certificate
  printf '# RabbitTech mail front\n# version %s\nserver {\n    ssl_certificate %s;\n}\n' "$1" "${2:-$T/app/data/assets/ssl/cert.pem}"
}
install_site() { site "$@" | "$HELPER" install "$H" > "$T/out" 2>&1; }
# nginx reloads, by either route (not the "sudo … reload-if-changed" lines)
reloads() { cat "$FAKE_LOG" 2>/dev/null | grep -cxE 'reload|systemctl reload' || true; }
fresh() {
  rm -rf "$RT_NGINX_DIR" "$RT_FRONT_STATE" "$RT_FRONT_BACKUPS" "$FAKE_LOG"
  mkdir -p "$RT_NGINX_DIR/sites-available" "$RT_NGINX_DIR/sites-enabled"
  # The site as it was set up by hand: a file in sites-available and a copy in sites-enabled
  printf 'server { server_name %s; }  # by hand\n' "$H" | tee "$AVAILABLE" > "$ENABLED"
  printf 'server { server_name shop.example.com; }\n' > "$RT_NGINX_DIR/sites-enabled/shop.example.com"
}

echo "Helper"
fresh
install_site 1 && rc=0 || rc=$?
check "the first install replaces the site set up by hand, and reloads nginx" '[ "$rc" = 0 ] && grep -q "version 1" "$AVAILABLE" && [ "$(readlink "$ENABLED")" = "$AVAILABLE" ] && [ "$(reloads)" = 1 ]'
backup=$(ls -d "$RT_FRONT_BACKUPS/$H".*)
check "... keeping both hand-made files" 'grep -q "by hand" "$backup/sites-available" && grep -q "by hand" "$backup/sites-enabled" && [ ! -L "$backup/sites-enabled" ]'
check "... and leaving the other sites alone" 'grep -q shop.example.com "$RT_NGINX_DIR/sites-enabled/shop.example.com"'
install_site 1 && rc=0 || rc=$?
check "the same config again changes nothing and doesn't reload" '[ "$rc" = 0 ] && grep -q "up to date" "$T/out" && [ "$(reloads)" = 1 ] && [ "$(ls -d "$RT_FRONT_BACKUPS/$H".* | wc -l)" = 1 ]'
FAKE_SYSTEMD=1 install_site 2 && rc=0 || rc=$?
check "a new config is reloaded through systemd when nginx runs under it" '[ "$rc" = 0 ] && grep -q "version 2" "$AVAILABLE" && grep -q "systemctl reload" "$FAKE_LOG"'

FAKE_NGINX=fail install_site 3 && rc=0 || rc=$?
check "a config that fails nginx -t is taken back out, with nginx's error" '[ "$rc" = 1 ] && grep -q "version 2" "$AVAILABLE" && [ "$(readlink "$ENABLED")" = "$AVAILABLE" ] && grep -q "unknown directive" "$T/out" && grep -q "previous one was put back" "$T/out"'
fresh
FAKE_NGINX=fail install_site 1 && rc=0 || rc=$?
check "... also on the first install: the hand-made files come back exactly" '[ "$rc" = 1 ] && grep -q "by hand" "$AVAILABLE" && [ -f "$ENABLED" ] && [ ! -L "$ENABLED" ] && grep -q "by hand" "$ENABLED" && [ "$(reloads)" = 0 ]'
FAKE_NGINX=conflict install_site 1 && rc=0 || rc=$?
check "another site serving the same name is refused, naming the fix" '[ "$rc" = 1 ] && grep -q "by hand" "$AVAILABLE" && grep -q "another nginx site also serves $H" "$T/out" && [ "$(reloads)" = 0 ]'

printf 'server { listen 80; }\n' | "$HELPER" install "$H" > "$T/out" 2>&1 && rc=0 || rc=$?
check "a config without the RabbitTech marker is refused" '[ "$rc" = 1 ] && grep -q "not a RabbitTech mail site" "$T/out" && grep -q "by hand" "$AVAILABLE"'
site 1 | "$HELPER" install "../../etc/passwd" > "$T/out" 2>&1 && rc=0 || rc=$?
check "a host name with a path in it is refused" '[ "$rc" = 1 ] && grep -q "not a host name" "$T/out"'
{ site 1; head -c 70000 /dev/zero | tr '\0' '#'; } | "$HELPER" install "$H" > "$T/out" 2>&1 && rc=0 || rc=$?
check "a config over 64 KB is refused" '[ "$rc" = 1 ] && grep -q "over 64 KB" "$T/out"'
install_site 1 "$T/placeholder/cert.pem" && rc=0 || rc=$?
check "until mailcow has a real certificate the current site stays (exit 3)" '[ "$rc" = 3 ] && grep -q "placeholder" "$T/out" && grep -q "by hand" "$AVAILABLE"'
install_site 1 "$T/missing.pem" && rc=0 || rc=$?
check "a certificate that doesn't exist is refused" '[ "$rc" = 1 ] && grep -q "doesn.t exist" "$T/out"'

fresh
install_site 1
install_site 2
"$HELPER" restore "$H" > "$T/out" 2>&1 && rc=0 || rc=$?
check "restore puts back the config from before the last install" '[ "$rc" = 0 ] && grep -q "version 1" "$AVAILABLE" && [ "$(readlink "$ENABLED")" = "$AVAILABLE" ]'
rm -rf "$RT_FRONT_BACKUPS"
"$HELPER" restore "$H" > "$T/out" 2>&1 && rc=0 || rc=$?
check "restore without a backup says so" '[ "$rc" = 1 ] && grep -q "no earlier config" "$T/out"'
for v in $(seq 3 14); do install_site "$v"; done
check "the newest 10 backups are kept" '[ "$(ls -d "$RT_FRONT_BACKUPS/$H".* | wc -l)" = 10 ]'

fresh
install_site 1
: > "$FAKE_LOG"
"$HELPER" reload-if-changed > "$T/out" 2>&1
check "reload-if-changed: same certificate, no reload" '[ "$(reloads)" = 0 ]'
cert "$T/app/data/assets/ssl" "/O=Let's Encrypt/CN=R10"
"$HELPER" reload-if-changed > "$T/out" 2>&1
check "reload-if-changed: a renewed certificate reloads nginx once" '[ "$(reloads)" = 1 ] && grep -q "renewed certificate" "$T/out"'
"$HELPER" reload-if-changed > "$T/out" 2>&1
check "... and not again" '[ "$(reloads)" = 1 ]'

echo "Deploy side (scripts/front-nginx.sh)"
FRONT="$ROOT/scripts/front-nginx.sh"
conf() {
  cat > "$T/app/mailcow.conf" <<CONF
MAILCOW_HOSTNAME=Mail.RabbitTech.com.np
HTTP_BIND=
HTTP_PORT=8088
HTTPS_BIND=127.0.0.1
HTTPS_PORT=8448
$1
CONF
}
front() { env APP_DIR="$T/app" RT_FRONT_HELPER="$HELPER" "$@" bash "$FRONT" "$CMD" > "$T/out" 2>&1; }

fresh
conf ""
CMD=install front && rc=0 || rc=$?
check "without RT_FRONT_NGINX=y nothing happens" '[ "$rc" = 0 ] && [ ! -s "$T/out" ] && grep -q "by hand" "$AVAILABLE"'
conf RT_FRONT_NGINX=y
CMD=render front
check "render: the mail hostname, mailcow's ports and certificate" 'grep -q "server_name mail.rabbittech.com.np autodiscover.\* autoconfig.\* mta-sts.\*;" "$T/out" \
  && grep -q "proxy_pass http://127.0.0.1:8088;" "$T/out" && grep -q "proxy_pass https://127.0.0.1:8448;" "$T/out" \
  && grep -q "ssl_certificate $T/app/data/assets/ssl/cert.pem;" "$T/out" && ! grep -q @ "$T/out"'
CMD=install front RT_FRONT_HELPER="$T/nope" && rc=0 || rc=$?
check "a missing helper fails with the setup command to run" '[ "$rc" = 1 ] && grep -q "front-nginx.sh setup $(id -un)" "$T/out"'
CMD=install front && rc=0 || rc=$?
check "install: the rendered site is installed, and the site answers" '[ "$rc" = 0 ] && grep -q "proxy_pass https://127.0.0.1:8448;" "$AVAILABLE" \
  && grep -q -- "--resolve mail.rabbittech.com.np:443:127.0.0.1 https://mail.rabbittech.com.np/" "$FAKE_LOG"'
if [ "$(id -u)" != 0 ]; then
  check "... through sudo, never asking for a password" 'grep -q "^sudo -n $HELPER install mail.rabbittech.com.np" "$FAKE_LOG"'
fi
conf "RT_FRONT_NGINX=y
HTTPS_PORT=8449"
CMD=install front FAKE_CODE=502 && rc=0 || rc=$?
check "a site that answers 502 is put back and fails the deploy" '[ "$rc" = 1 ] && grep -q "answered 502" "$T/out" && grep -q "proxy_pass https://127.0.0.1:8448;" "$AVAILABLE"'
CMD=install front FAKE_CODE=000 && rc=0 || rc=$?
check "... as does one that doesn't answer" '[ "$rc" = 1 ] && grep -q "answered nothing" "$T/out"'
cp "$T/placeholder/"*.pem "$T/app/data/assets/ssl/"
CMD=install front && rc=0 || rc=$?
check "with mailcow's placeholder certificate the deploy goes on and the site stays" '[ "$rc" = 0 ] && grep -q "placeholder" "$T/out" && grep -q "proxy_pass https://127.0.0.1:8448;" "$AVAILABLE"'
cert "$T/app/data/assets/ssl" "/O=Let's Encrypt/CN=R12"
: > "$FAKE_LOG"
conf RT_FRONT_NGINX=y
CMD=reload front
check "reload (cron): nginx reloads after a renewal" '[ "$(reloads)" = 1 ]'
conf ""
: > "$FAKE_LOG"
cert "$T/app/data/assets/ssl" "/O=Let's Encrypt/CN=R13"
CMD=reload front
check "reload does nothing with RT_FRONT_NGINX off" '[ "$(reloads)" = 0 ]'
cp "$HELPER" "$T/helper-old"; echo "# older" >> "$T/helper-old"
conf RT_FRONT_NGINX=y
CMD=install front RT_FRONT_HELPER="$T/helper-old" && rc=0 || rc=$?
check "a server helper older than the release asks to run setup again" 'grep -q "differs from this release" "$T/out"'

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
