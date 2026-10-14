#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_DIR="${1:?release directory is required}"
ENV_FILE="${2:?mailcow env file is required}"
APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
APP_DIR="$APP_ROOT/app"
BACKUP_DIR="$APP_ROOT/backups"
STATE_DIR="$APP_ROOT/shared"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
# Used for file operations that need root when the deploy user is not root.
HELPER_IMAGE="${DEPLOY_HELPER_IMAGE:-alpine:3.20}"

if [ ! -d "$RELEASE_DIR" ]; then
  echo "Release directory not found: $RELEASE_DIR" >&2
  exit 1
fi
RELEASE_DIR="$(cd "$RELEASE_DIR" && pwd)"

if [ ! -f "$ENV_FILE" ]; then
  echo "Mailcow environment file not found: $ENV_FILE" >&2
  exit 1
fi

required=(
  MAILCOW_HOSTNAME TZ COMPOSE_PROJECT_NAME DBPASS DBROOT REDISPASS
  HTTP_PORT HTTPS_PORT SMTP_PORT SMTPS_PORT SUBMISSION_PORT
  IMAP_PORT IMAPS_PORT POP_PORT POPS_PORT SIEVE_PORT
)

missing=()
for name in "${required[@]}"; do
  if ! grep -Eq "^${name}=.+" "$ENV_FILE"; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "mailcow.conf is missing required values: ${missing[*]}" >&2
  exit 1
fi

if ! grep -Eq '^MAILCOW_HOSTNAME=mail\.rabbittech\.com\.np$' "$ENV_FILE"; then
  echo "MAILCOW_HOSTNAME must be mail.rabbittech.com.np for this deployment." >&2
  exit 1
fi

# Mailcow containers re-own several bind-mounted directories (rspamd maps, the Twig
# cache), so the files there can only be updated as root. Docker access is already
# root-equivalent, so a non-root deploy user runs those steps in a throwaway container.
as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    docker run --rm --network none \
      -v "$APP_ROOT:$APP_ROOT" \
      -v "$RELEASE_DIR:$RELEASE_DIR:ro" \
      "$HELPER_IMAGE" "$@"
  fi
}

mkdir -p "$APP_DIR" "$BACKUP_DIR" "$STATE_DIR"

if [ -f "$APP_DIR/mailcow.conf" ]; then
  cp "$APP_DIR/mailcow.conf" "$BACKUP_DIR/mailcow.conf.$(date -u +%Y%m%d%H%M%S)"
fi

as_root sh "$RELEASE_DIR/scripts/sync-release.sh" "$RELEASE_DIR" "$APP_DIR" "$STATE_DIR"

install -m 600 "$ENV_FILE" "$APP_DIR/mailcow.conf"
ln -sfn mailcow.conf "$APP_DIR/.env"

as_root sh -c '
  mkdir -p "$1/data/assets/ssl" "$1/data/conf/rspamd/override.d"
  if [ ! -f "$1/data/conf/rspamd/override.d/worker-controller-password.inc" ]; then
    printf "# Placeholder\n" > "$1/data/conf/rspamd/override.d/worker-controller-password.inc"
  fi
' sh "$APP_DIR"

cd "$APP_DIR"

docker compose pull
docker compose up -d --remove-orphans

# Containers read their config at start (SOGo also copies its web files into a volume
# that nginx serves), so restart the services whose config changed in this release.
restart=()
while IFS= read -r path; do
  case "$path" in
    data/conf/acme/*) service=acme-mailcow ;;
    data/conf/clamav/*) service=clamd-mailcow ;;
    data/conf/dovecot/*) service=dovecot-mailcow ;;
    data/conf/mysql/*) service=mysql-mailcow ;;
    data/conf/nginx/*) service=nginx-mailcow ;;
    data/conf/phpfpm/*) service=php-fpm-mailcow ;;
    data/conf/postfix/*) service=postfix-mailcow ;;
    data/conf/redis/*) service=redis-mailcow ;;
    data/conf/rspamd/*) service=rspamd-mailcow ;;
    data/conf/sogo/*) service=sogo-mailcow ;;
    data/conf/unbound/*) service=unbound-mailcow ;;
    *) continue ;;
  esac
  if [[ " ${restart[*]} " != *" $service "* ]]; then
    restart+=("$service")
  fi
done < "$STATE_DIR/release-changes"

if [ "${#restart[@]}" -gt 0 ]; then
  echo "Restarting services with changed config: ${restart[*]}"
  docker compose restart "${restart[@]}"
fi

docker compose ps

# Keep the newest releases for reference; older ones only use disk space.
if [ "$(dirname "$RELEASE_DIR")" = "$APP_ROOT/releases" ]; then
  ls -1dt "$APP_ROOT"/releases/*/ 2>/dev/null \
    | tail -n +"$((KEEP_RELEASES + 1))" \
    | while IFS= read -r old; do
        [ "${old%/}" = "$RELEASE_DIR" ] || rm -rf -- "$old"
      done
fi
