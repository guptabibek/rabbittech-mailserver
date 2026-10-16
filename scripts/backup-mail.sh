#!/usr/bin/env bash
# Nightly backup of the mail data: mailboxes, database, DKIM and other keys, Redis, spam filter
# and Postfix data. The work is done by mailcow's helper-scripts/backup_and_restore.sh; this
# wrapper decides when to run it, checks the result, removes old backups and reports to the
# Overview (Redis key RT_BACKUP_STATUS).
#
# Cron runs it every hour (installed by scripts/deploy-vps.sh). A backup runs once a day after
# RT_BACKUP_HOUR in the mail server's time zone, and right away when the last one is over 26 hours
# old, so a night the server was down is caught up.
#
# Settings in mailcow.conf:
#   RT_BACKUP=y               n turns automatic backups off
#   RT_BACKUP_HOUR=2          hour of the day (0-23, TZ from mailcow.conf) after which it runs
#   RT_BACKUP_KEEP_DAYS=7     older backups are deleted; the newest two are always kept
#   RT_BACKUP_RSYNC_TARGET=   optional copy to another server over SSH, e.g. backup@nas:/srv/mail
#   RT_RESTORE_TEST=y         n turns the restore test off
#   RT_RESTORE_TEST_DAYS=7    days between restore tests (scripts/restore-test.sh), which run
#                             right after a backup; after a failed test, again after the next one
#
# Back up right now: RT_BACKUP_NOW=1 bash scripts/backup-mail.sh
# tests/backup/test-backup.sh swaps in a fake helper, clock, Redis and free space through
# RT_BACKUP_HELPER, RT_BACKUP_CLOCK, RT_BACKUP_REDIS_CMD, RT_BACKUP_FREE_BYTES and
# RT_RESTORE_SCRIPT.
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
STATE_DIR="${RT_BACKUP_STATE_DIR:-$APP_ROOT/backups}"
BACKUP_ROOT="${RT_BACKUP_DIR:-$STATE_DIR/mail}"
HELPER="${RT_BACKUP_HELPER:-$APP_DIR/helper-scripts/backup_and_restore.sh}"
NOW="${RT_BACKUP_CLOCK:-$(date +%s)}"
ARCHIVES="vmail crypt redis rspamd postfix mariadb"
DAY=86400

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Values from mailcow.conf, read without running the file
conf() {
  local value
  value=$(sed -n "s/^$1=//p" "$APP_DIR/mailcow.conf" 2>/dev/null | tail -n 1)
  value=${value%\"}; value=${value#\"}
  printf '%s' "${value:-${2:-}}"
}

json_string() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  printf '"%s"' "$(printf '%s' "$s" | tr '\n\r\t' '   ')"
}

# Stores the status the Overview shows. Redis being down must not fail the backup.
report() {
  local json=$1
  if [ -n "${RT_BACKUP_REDIS_CMD:-}" ]; then
    printf '%s' "$json" | sh -c "$RT_BACKUP_REDIS_CMD" || log "Could not store the backup status"
    return 0
  fi
  (cd "$APP_DIR" && docker compose exec -T redis-mailcow sh -c 'REDISCLI_AUTH="$REDISPASS" redis-cli SET RT_BACKUP_STATUS "$1" >/dev/null' sh "$json") \
    || log "Could not store the backup status in Redis"
}

# "epoch size name" of the last good backup, kept next to the backups so it survives Redis
read_last() {
  LAST_TIME=0 LAST_SIZE=0 LAST_NAME=""
  if [ -f "$STATE_DIR/.last-backup" ]; then
    read -r LAST_TIME LAST_SIZE LAST_NAME < "$STATE_DIR/.last-backup" || true
  fi
  [[ "$LAST_TIME" =~ ^[0-9]+$ ]] || LAST_TIME=0
  [[ "$LAST_SIZE" =~ ^[0-9]+$ ]] || LAST_SIZE=0
}

status_json() {
  local ok=$1 error=${2:-} offsite=${3:-off}
  printf '{"enabled":true,"time":%s,"ok":%s,"error":%s,"last_success":%s,"last_size":%s,"last_name":%s,"offsite":%s,"keep_days":%s,"hour":%s,"restore_days":%s}' \
    "$NOW" "$ok" "$(json_string "$error")" "$LAST_TIME" "$LAST_SIZE" "$(json_string "$LAST_NAME")" \
    "$(json_string "$offsite")" "$KEEP_DAYS" "$HOUR" "$RESTORE_DAYS"
}

fail() {
  trap - ERR
  log "Backup failed: $1"
  printf '%s\n' "$NOW" > "$STATE_DIR/.last-failure"
  report "$(status_json false "$1")"
  exit 1
}

backups() { find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'mailcow-*' 2>/dev/null | LC_ALL=C sort; }
free_bytes() {
  if [ -n "${RT_BACKUP_FREE_BYTES:-}" ]; then echo "$RT_BACKUP_FREE_BYTES"; return; fi
  df -PB1 "$BACKUP_ROOT" | awk 'NR == 2 { print $4 }'
}
dir_bytes() { du -sb "$1" 2>/dev/null | awk '{ print $1 }'; }

# Size of the mailboxes and database before compression, for the first backup
estimate_first() {
  local project volume total=0 size
  project=$(conf COMPOSE_PROJECT_NAME | tr -cd '0-9A-Za-z_-')
  for volume in vmail-vol-1 mysql-vol-1; do
    size=$(docker run --rm --network none -v "${project}_${volume}:/v:ro" "${RT_BACKUP_DU_IMAGE:-alpine:3.20}" du -sb /v 2>/dev/null | awk '{ print $1 }') || size=0
    total=$((total + ${size:-0}))
  done
  echo "$total"
}

[ -f "$APP_DIR/mailcow.conf" ] || { log "No mailcow.conf in $APP_DIR"; exit 1; }
mkdir -p "$STATE_DIR"

ENABLED=$(conf RT_BACKUP y)
HOUR=$(conf RT_BACKUP_HOUR 2)
KEEP_DAYS=$(conf RT_BACKUP_KEEP_DAYS 7)
TARGET=$(conf RT_BACKUP_RSYNC_TARGET)
ZONE=$(conf TZ UTC)
[[ "$HOUR" =~ ^[0-9]+$ ]] && [ "$HOUR" -le 23 ] || HOUR=2
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] && [ "$KEEP_DAYS" -ge 1 ] || KEEP_DAYS=7
# 0 tells the Overview that restore tests are off
RESTORE_DAYS=$(conf RT_RESTORE_TEST_DAYS 7)
[[ "$RESTORE_DAYS" =~ ^[0-9]+$ ]] && [ "$RESTORE_DAYS" -ge 1 ] || RESTORE_DAYS=7
RESTORE=$(conf RT_RESTORE_TEST y)
[[ "${RESTORE,,}" =~ ^(y|yes)$ ]] || RESTORE_DAYS=0

exec 9> "$STATE_DIR/.backup.lock"
if ! flock -n 9; then
  [ -n "${RT_BACKUP_NOW:-}" ] && log "Another backup is still running"
  exit 0
fi

if [[ ! "${ENABLED,,}" =~ ^(y|yes)$ ]]; then
  # Tell the Overview once; cron keeps calling every hour
  if [ ! -f "$STATE_DIR/.backup-off" ]; then
    report '{"enabled":false}'
    touch "$STATE_DIR/.backup-off"
  fi
  exit 0
fi
rm -f "$STATE_DIR/.backup-off"

read_last
if [ -z "${RT_BACKUP_NOW:-}" ]; then
  today=$(TZ="$ZONE" date -d "@$NOW" +%F)
  last_day=$(TZ="$ZONE" date -d "@$LAST_TIME" +%F)
  hour_now=$(TZ="$ZONE" date -d "@$NOW" +%-H)
  if [ "$last_day" = "$today" ]; then
    exit 0
  fi
  if [ "$hour_now" -lt "$HOUR" ] && [ $((NOW - LAST_TIME)) -le $((26 * 3600)) ]; then
    exit 0
  fi
  # After a failure, try again after a few hours rather than every hour
  if [ -f "$STATE_DIR/.last-failure" ] && [ $((NOW - $(cat "$STATE_DIR/.last-failure"))) -lt $((4 * 3600)) ]; then
    exit 0
  fi
fi

trap 'fail "The backup script stopped unexpectedly at line $LINENO"' ERR
mkdir -p "$BACKUP_ROOT"
# backup_and_restore.sh insists that others can read the backup folder; the parent folder
# ($APP_ROOT is 750) is what keeps other users out
chmod 755 "$BACKUP_ROOT"
log "Starting backup into $BACKUP_ROOT"

# Room for the new backup: half again the size of the last one (first time: the size of the
# mailboxes and database). Old backups beyond the newest one make room if needed.
if [ "$LAST_SIZE" -gt 0 ]; then
  need=$((LAST_SIZE * 3 / 2))
else
  need=$(estimate_first)
fi
while [ "$(free_bytes)" -lt "$need" ]; do
  mapfile -t existing < <(backups)
  [ "${#existing[@]}" -gt 1 ] || fail "Not enough disk space: about $((need / 1048576)) MiB needed, $(( $(free_bytes) / 1048576 )) MiB free"
  log "Deleting ${existing[0]##*/} to make room"
  rm -rf -- "${existing[0]}"
done

# The helper lists every file it archives, so its output goes to a file of its own
RUN_LOG="$STATE_DIR/backup-last-run.log"
before=$(backups)
if ! MAILCOW_BACKUP_LOCATION="$BACKUP_ROOT" THREADS="${RT_BACKUP_THREADS:-1}" bash "$HELPER" backup all > "$RUN_LOG" 2>&1; then
  log "backup_and_restore.sh reported an error (see $RUN_LOG)"
fi
created=$(LC_ALL=C comm -13 <(printf '%s\n' "$before") <(backups) | tail -n 1)
[ -n "$created" ] || fail "backup_and_restore.sh did not create a backup folder (see $RUN_LOG)"

# The helper carries on after a failed step, so check every archive
missing=()
for name in $ARCHIVES; do
  [ -s "$created/backup_$name.tar.zst" ] || missing+=("$name")
done
if [ "${#missing[@]}" -gt 0 ]; then
  rm -rf -- "$created"
  fail "Missing or empty archives: ${missing[*]} (see $RUN_LOG)"
fi

LAST_TIME=$NOW
LAST_SIZE=$(dir_bytes "$created")
LAST_NAME=${created##*/}
printf '%s %s %s\n' "$LAST_TIME" "$LAST_SIZE" "$LAST_NAME" > "$STATE_DIR/.last-backup"
rm -f "$STATE_DIR/.last-failure"
log "Backup $LAST_NAME complete ($((LAST_SIZE / 1048576)) MiB)"

# Retention: older than RT_BACKUP_KEEP_DAYS, but never the newest two
mapfile -t existing < <(backups)
for ((i = 0; i < ${#existing[@]} - 2; i++)); do
  old=${existing[$i]}
  if [ $((NOW - $(stat -c %Y "$old"))) -gt $((KEEP_DAYS * DAY)) ]; then
    log "Deleting ${old##*/}, older than $KEEP_DAYS days"
    rm -rf -- "$old"
  fi
done

offsite=off
if [ -n "$TARGET" ]; then
  if rsync -a --delete -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" "$BACKUP_ROOT/" "$TARGET/"; then
    offsite=ok
    log "Copied the backups to $TARGET"
  else
    offsite=failed
    log "Copying the backups to $TARGET failed"
  fi
fi

report "$(status_json true "" "$offsite")"

# Restore test of the new backup when one is due. It reports on its own, so a failed test
# leaves this backup good. Half a day of slack keeps a weekly test on the same night.
trap - ERR
if [ "$RESTORE_DAYS" -gt 0 ]; then
  tested=0 passed=0
  if [ -f "$STATE_DIR/.last-restore-test" ]; then
    read -r tested passed _ < "$STATE_DIR/.last-restore-test" || true
  fi
  [[ "$tested" =~ ^[0-9]+$ ]] || tested=0
  if [ "$passed" != 1 ] || [ $((NOW - tested)) -ge $((RESTORE_DAYS * DAY - DAY / 2)) ]; then
    log "Restore test of $LAST_NAME"
    if bash "${RT_RESTORE_SCRIPT:-$(dirname "${BASH_SOURCE[0]}")/restore-test.sh}" "$created" > "$STATE_DIR/restore-test-last-run.log" 2>&1; then
      log "Restore test passed"
    else
      log "Restore test failed (see $STATE_DIR/restore-test-last-run.log)"
    fi
  fi
fi
