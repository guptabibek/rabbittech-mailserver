#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_DIR="${1:?release directory is required}"
ENV_FILE="${2:?mailcow env file is required}"
APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
APP_DIR="$APP_ROOT/app"
BACKUP_DIR="$APP_ROOT/backups"

if [ ! -d "$RELEASE_DIR" ]; then
  echo "Release directory not found: $RELEASE_DIR" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Mailcow environment file not found: $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$APP_DIR" "$BACKUP_DIR"

if [ -f "$APP_DIR/mailcow.conf" ]; then
  cp "$APP_DIR/mailcow.conf" "$BACKUP_DIR/mailcow.conf.$(date -u +%Y%m%d%H%M%S)"
fi

rsync -a --delete \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'mailcow.conf' \
  --exclude 'data/assets/ssl/' \
  "$RELEASE_DIR"/ "$APP_DIR"/

install -m 600 "$ENV_FILE" "$APP_DIR/mailcow.conf"
ln -sfn mailcow.conf "$APP_DIR/.env"

cd "$APP_DIR"

required=(
  MAILCOW_HOSTNAME TZ COMPOSE_PROJECT_NAME DBPASS DBROOT REDISPASS
  HTTP_PORT HTTPS_PORT SMTP_PORT SMTPS_PORT SUBMISSION_PORT
  IMAP_PORT IMAPS_PORT POP_PORT POPS_PORT SIEVE_PORT
)

missing=()
for name in "${required[@]}"; do
  if ! grep -Eq "^${name}=.+" mailcow.conf; then
    missing+=("$name")
  fi
done

if [ "${#missing[@]}" -gt 0 ]; then
  echo "mailcow.conf is missing required values: ${missing[*]}" >&2
  exit 1
fi

if ! grep -Eq '^MAILCOW_HOSTNAME=mail\.rabbittech\.com\.np$' mailcow.conf; then
  echo "MAILCOW_HOSTNAME must be mail.rabbittech.com.np for this deployment." >&2
  exit 1
fi

mkdir -p data/assets/ssl data/conf/rspamd/override.d
if [ ! -f data/conf/rspamd/override.d/worker-controller-password.inc ]; then
  printf '# Placeholder\n' > data/conf/rspamd/override.d/worker-controller-password.inc
fi

docker compose pull
docker compose up -d --remove-orphans
docker compose ps
