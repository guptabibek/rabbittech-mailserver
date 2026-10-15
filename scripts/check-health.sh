#!/usr/bin/env bash
# Checks that the mail server works: every service in docker-compose.yml is running, the console
# renders a complete page (PHP, database and Redis answer), and SMTP and IMAP greet. Waits up to
# HEALTH_TIMEOUT seconds (default 300) for services that are still starting, then prints what is
# failing. scripts/deploy-vps.sh runs it after every deploy and rolls back when it fails.
#
# Usage: check-health.sh [app-dir]
set -Eeuo pipefail

APP_DIR="${1:-${APP_DIR:-/opt/rabbittech-mailserver/app}}"
TIMEOUT="${HEALTH_TIMEOUT:-300}"
INTERVAL="${HEALTH_INTERVAL:-5}"
cd "$APP_DIR"

conf() {
  local value
  value=$(sed -n "s/^$1=//p" mailcow.conf 2>/dev/null | tail -n 1)
  value=${value%\"}; value=${value#\"}
  printf '%s' "${value:-${2:-}}"
}

# "port" or "address:port" (as in mailcow.conf) to "address port"; all addresses means this host
endpoint() {
  local address=127.0.0.1 port=$1
  if [[ "$1" == *:* ]]; then
    address=${1%:*}
    port=${1##*:}
  fi
  case "$address" in ''|0.0.0.0|'[::]'|::) address=127.0.0.1 ;; esac
  echo "$address $port"
}

HOST=$(conf MAILCOW_HOSTNAME)
read -r HTTPS_ADDR HTTPS_PORT < <(endpoint "$(conf HTTPS_BIND):$(conf HTTPS_PORT 443)")
read -r SMTP_ADDR SMTP_PORT < <(endpoint "$(conf SMTP_PORT 25)")
read -r IMAP_ADDR IMAP_PORT < <(endpoint "$(conf IMAP_PORT 143)")

# The first bytes a server sends after connecting
greeting() {
  timeout 10 bash -c 'exec 3<>"/dev/tcp/$1/$2" && head -c "$3" <&3' sh "$1" "$2" "$3" 2>/dev/null || true
}

problems() {
  local service state services states
  services=$(docker compose config --services 2>/dev/null) || { echo "docker compose config failed"; return; }
  states=$(docker compose ps --all --format '{{.Service}} {{.State}}' 2>/dev/null) || true
  for service in $services; do
    state=$(awk -v s="$service" '$1 == s { print $2 }' <<< "$states")
    [ "$state" = running ] || echo "$service is ${state:-not created}"
  done

  local page code
  page=$(mktemp)
  code=$(curl -sk --max-time 15 -o "$page" -w '%{http_code}' \
    --resolve "$HOST:$HTTPS_PORT:$HTTPS_ADDR" "https://$HOST:$HTTPS_PORT/" 2>/dev/null) || true
  if [ "$code" != 200 ] || ! grep -q '</html>' "$page"; then
    echo "the console at https://$HOST:$HTTPS_PORT/ answers HTTP ${code:-nothing} without a complete page"
  fi
  rm -f "$page"

  [ "$(greeting "$SMTP_ADDR" "$SMTP_PORT" 3)" = 220 ] || echo "SMTP on $SMTP_ADDR:$SMTP_PORT does not greet"
  [ "$(greeting "$IMAP_ADDR" "$IMAP_PORT" 4)" = '* OK' ] || echo "IMAP on $IMAP_ADDR:$IMAP_PORT does not greet"
}

deadline=$((SECONDS + TIMEOUT))
while :; do
  found=$(problems)
  if [ -z "$found" ]; then
    echo "Health check passed: all services run, the console, SMTP and IMAP answer"
    exit 0
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "Health check failed after ${TIMEOUT}s:" >&2
    sed 's/^/  - /' <<< "$found" >&2
    exit 1
  fi
  sleep "$INTERVAL"
done
