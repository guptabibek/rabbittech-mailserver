#!/usr/bin/env bash
# Tests scripts/check-health.sh and the rollback in scripts/deploy-vps.sh without a mail server:
# docker, curl and crontab are fakes, SMTP and IMAP are tiny local servers.
# Run: bash tests/deploy/test-deploy.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
T=$(mktemp -d)
pids=()
cleanup() {
  for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done
  rm -rf -- "${T:?}"
}
trap cleanup EXIT
failures=0 passed=0
check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
    [ -f "$T/out" ] && tail -n 8 "$T/out" | sed 's/^/         | /'
  fi
}

# ------------------------------------------------------------------ fakes
mkdir -p "$T/bin"
cat > "$T/bin/docker" <<'FAKE'
#!/bin/bash
# docker compose answers from files; "docker run ... IMAGE cmd" (deploy-vps.sh's as_root) runs cmd
case "$1 $2" in
  "compose config") printf '%s\n' $FAKE_SERVICES ;;
  "compose ps") if [ "${3:-}" = --all ]; then cat "$FAKE_PS"; fi ;;
  "compose pull"|"compose up"|"compose restart") ;;
  run\ *)
    shift
    while [ $# -gt 0 ]; do case "$1" in --rm) shift ;; --network|-v) shift 2 ;; *) break ;; esac; done
    shift
    exec "$@" ;;
esac
FAKE
cat > "$T/bin/curl" <<'FAKE'
#!/bin/bash
out=/dev/null
while [ $# -gt 0 ]; do [ "$1" = -o ] && out=$2; shift; done
printf '%s' "${FAKE_PAGE-<html><body>Sign in</body></html>}" > "$out"
printf '%s' "${FAKE_CODE:-200}"
FAKE
cat > "$T/bin/crontab" <<'FAKE'
#!/bin/bash
if [ "$1" = -l ]; then cat "$FAKE_CRONTAB" 2>/dev/null; else cat > "$FAKE_CRONTAB.new"; mv "$FAKE_CRONTAB.new" "$FAKE_CRONTAB"; fi
FAKE
chmod +x "$T/bin/"*
export PATH="$T/bin:$PATH" FAKE_PS="$T/ps" FAKE_CRONTAB="$T/crontab"
export FAKE_SERVICES="nginx-mailcow postfix-mailcow dovecot-mailcow"
healthy_ps() { printf '%s running\n' $FAKE_SERVICES > "$T/ps"; }

# SMTP and IMAP greetings on local ports
python3 - "$T/ports" <<'PY' &
import socket, sys, threading
def serve(greeting, ports):
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    s.bind(('127.0.0.1', 0)); s.listen(); ports.append(s.getsockname()[1])
    def loop():
        while True:
            c, _ = s.accept(); c.sendall(greeting); c.close()
    threading.Thread(target=loop, daemon=True).start()
ports = []
serve(b'220 mail.rabbittech.com.np ESMTP\r\n', ports)
serve(b'* OK [CAPABILITY IMAP4rev1] Dovecot ready.\r\n', ports)
import os
open(sys.argv[1] + '.tmp', 'w').write(' '.join(map(str, ports)) + '\n')
os.rename(sys.argv[1] + '.tmp', sys.argv[1])
threading.Event().wait()
PY
pids+=($!)
for _ in $(seq 50); do [ -s "$T/ports" ] && break; sleep 0.1; done
read -r SMTP IMAP < "$T/ports"

conf() {
  cat <<CONF
MAILCOW_HOSTNAME=mail.rabbittech.com.np
TZ=Asia/Kathmandu
COMPOSE_PROJECT_NAME=rabbittechmail
DBPASS=x
DBROOT=x
REDISPASS=x
HTTP_BIND=127.0.0.1
HTTP_PORT=8088
HTTPS_BIND=127.0.0.1
HTTPS_PORT=8448
SMTP_PORT=127.0.0.1:$SMTP
SMTPS_PORT=465
SUBMISSION_PORT=587
IMAP_PORT=127.0.0.1:$IMAP
IMAPS_PORT=993
POP_PORT=110
POPS_PORT=995
SIEVE_PORT=4190
CONF
}

# ------------------------------------------------------------------ health check
echo "Health check"
mkdir -p "$T/app"
conf > "$T/app/mailcow.conf"
health() { HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-2} HEALTH_INTERVAL=1 bash "$ROOT/scripts/check-health.sh" "$T/app" > "$T/out" 2>&1; }

healthy_ps
health && rc=0 || rc=$?
check "a healthy server passes" '[ "$rc" = 0 ]'
printf 'nginx-mailcow running\npostfix-mailcow exited\n' > "$T/ps"
health && rc=0 || rc=$?
check "a stopped or missing service fails it, by name" '[ "$rc" = 1 ] && grep -q "postfix-mailcow is exited" "$T/out" && grep -q "dovecot-mailcow is not created" "$T/out"'
healthy_ps
FAKE_CODE=502 health && rc=0 || rc=$?
check "a console that answers 502 fails it" '[ "$rc" = 1 ] && grep -q "answers HTTP 502" "$T/out"'
FAKE_PAGE="<center>Connection to database failed.</center>" health && rc=0 || rc=$?
check "a console without its database fails it" '[ "$rc" = 1 ] && grep -q "console" "$T/out"'
sed -i "s/^SMTP_PORT=.*/SMTP_PORT=127.0.0.1:1/" "$T/app/mailcow.conf"
health && rc=0 || rc=$?
check "SMTP not answering fails it" '[ "$rc" = 1 ] && grep -q "SMTP on 127.0.0.1:1" "$T/out"'
conf > "$T/app/mailcow.conf"
printf 'nginx-mailcow restarting\n' > "$T/ps"
(sleep 2; healthy_ps) &
HEALTH_TIMEOUT=15 health && rc=0 || rc=$?
check "services that are still starting get time" '[ "$rc" = 0 ]'

# ------------------------------------------------------------------ rollback
echo "Rollback"
APP_ROOT="$T/root"
export APP_ROOT
mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared" "$APP_ROOT/app"
# Files the containers write at runtime, which deploy-vps.sh waits for
for f in data/conf/dovecot/dovecot-master.passwd data/conf/dovecot/sogo-sso.conf data/conf/phpfpm/sogo-sso/sogo-sso.pass \
    data/conf/sogo/sieve.creds data/conf/sogo/cron.creds data/conf/postfix/custom_transport.pcre data/conf/postfix/sql/mysql_virtual_alias_maps.cf; do
  mkdir -p "$APP_ROOT/app/$(dirname "$f")"; : > "$APP_ROOT/app/$f"
done
healthy_ps

# A release of this checkout whose health check passes (ok) or fails (fail)
release() {
  local dir="$APP_ROOT/releases/$1"
  mkdir -p "$dir"
  (cd "$ROOT" && git ls-files --cached --others --exclude-standard -z | tar --null -T - -cf -) | tar -xf - -C "$dir"
  printf '#!/bin/bash\n' > "$dir/scripts/check-health.sh"
  [ "$2" = ok ] && echo 'exit 0' >> "$dir/scripts/check-health.sh" || echo 'echo "Health check failed" >&2; exit 1' >> "$dir/scripts/check-health.sh"
  echo "$1" > "$dir/RELEASE"
  touch -d "@$(( $(date +%s) + ${#1} ))" "$dir"
}
deploy() {
  conf > "$T/env.$1"
  bash "$APP_ROOT/releases/$1/scripts/deploy-vps.sh" "$APP_ROOT/releases/$1" "$T/env.$1" > "$T/out" 2>&1
}

release first fail
deploy first && rc=0 || rc=$?
check "a first release that fails has nothing to roll back to" '[ "$rc" = 1 ] && grep -q "no earlier healthy release" "$T/out" && [ ! -e "$APP_ROOT/shared/current-release" ]'
release one ok
deploy one && rc=0 || rc=$?
check "a healthy release is recorded as the one to return to" '[ "$rc" = 0 ] && [ "$(cat "$APP_ROOT/shared/current-release")" = "$APP_ROOT/releases/one" ] && [ -f "$APP_ROOT/shared/last-good-mailcow.conf" ]'
check "the backup cron entry is installed" 'grep -q "scripts/backup-mail.sh" "$T/crontab"'
release twotwo fail
echo "only in release two" > "$APP_ROOT/releases/twotwo/ONLY-IN-TWO"
deploy twotwo && rc=0 || rc=$?
check "an unhealthy release fails the deploy" '[ "$rc" = 1 ]'
check "... and the last healthy release is back" 'grep -q "Rolled back: the mail server runs one again" "$T/out" && [ "$(cat "$APP_ROOT/app/RELEASE")" = one ] && [ ! -e "$APP_ROOT/app/ONLY-IN-TWO" ]'
check "... still recorded as the release to return to" '[ "$(cat "$APP_ROOT/shared/current-release")" = "$APP_ROOT/releases/one" ]'
printf '#!/bin/bash\nexit 1\n' > "$APP_ROOT/releases/one/scripts/check-health.sh"
release three fail
deploy three && rc=0 || rc=$?
check "when the previous release fails too, it stops and says so" '[ "$rc" = 1 ] && grep -q "not healthy either" "$T/out" && [ "$(grep -c "Rolling back" "$T/out")" = 1 ]'

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
