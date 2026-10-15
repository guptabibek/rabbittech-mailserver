#!/usr/bin/env bash
# Tests scripts/backup-mail.sh with a fake backup_and_restore.sh, docker and rsync, a fixed clock
# and Redis replaced by a file. Run: bash tests/backup/test-backup.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/backup-mail.sh"
failures=0 passed=0

check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
  fi
}

# Local times in Asia/Kathmandu (the TZ in the test mailcow.conf)
at() { TZ=Asia/Kathmandu date -d "$1" +%s; }

# A fresh server: app dir with mailcow.conf, fake tools on PATH
setup() {
  T=$(mktemp -d)
  mkdir -p "$T/app" "$T/bin" "$T/backups"
  cat > "$T/app/mailcow.conf" <<CONF
TZ=Asia/Kathmandu
COMPOSE_PROJECT_NAME=rabbittechmail
RT_BACKUP_HOUR=2
RT_BACKUP_KEEP_DAYS=7
$1
CONF
  # backup_and_restore.sh: one folder per run, every archive unless FAKE_SKIP names one
  cat > "$T/helper.sh" <<'HELPER'
#!/usr/bin/env bash
echo run >> "$FAKE_RUNS"
dir="$MAILCOW_BACKUP_LOCATION/mailcow-$(date -u -d "@$RT_BACKUP_CLOCK" +%Y-%m-%d-%H-%M-%S)"
mkdir -p "$dir"
for name in vmail crypt redis rspamd postfix mariadb; do
  [ "$name" = "${FAKE_SKIP:-}" ] || head -c 2048 /dev/urandom > "$dir/backup_$name.tar.zst"
done
echo "tar: listing every file"
HELPER
  printf '#!/bin/sh\necho "1000 /v"\n' > "$T/bin/docker"
  printf '#!/bin/sh\nexit "${FAKE_RSYNC_EXIT:-0}"\n' > "$T/bin/rsync"
  chmod +x "$T/helper.sh" "$T/bin/docker" "$T/bin/rsync"
  : > "$T/runs"
}

run() {
  local clock=$1; shift
  env PATH="$T/bin:$PATH" APP_ROOT="$T" APP_DIR="$T/app" RT_BACKUP_HELPER="$T/helper.sh" \
    RT_BACKUP_CLOCK="$clock" RT_BACKUP_REDIS_CMD="cat > '$T/status.json'" FAKE_RUNS="$T/runs" \
    "$@" bash "$SCRIPT" > "$T/out" 2>&1
}
runs() { wc -l < "$T/runs" | tr -d ' '; }
status() { php -r 'echo json_encode(json_decode(file_get_contents($argv[1]), true)[$argv[2]] ?? null);' "$T/status.json" "$1"; }

echo "Backups"

setup ""
run "$(at '2026-10-15 14:00')" && rc=0 || rc=$?
check "first run backs up right away, whatever the hour" '[ "$rc" = 0 ] && [ "$(runs)" = 1 ]'
check "status reports success with the backup name and size" '[ "$(status ok)" = true ] && [ "$(status last_name)" = "\"mailcow-2026-10-15-08-15-00\"" ] && [ "$(status last_size)" -gt 0 ]'
check "the helper output stays out of the cron log" '! grep -q "listing every file" "$T/out" && grep -q "listing every file" "$T/backups/backup-last-run.log"'
run "$(at '2026-10-15 23:00')"
check "no second backup the same day" '[ "$(runs)" = 1 ]'
run "$(at '2026-10-16 01:17')"
check "next day, before RT_BACKUP_HOUR: waits" '[ "$(runs)" = 1 ]'
run "$(at '2026-10-16 02:17')"
check "next day, after RT_BACKUP_HOUR: backs up" '[ "$(runs)" = 2 ]'
run "$(at '2026-10-17 01:17')" RT_BACKUP_NOW=1
check "RT_BACKUP_NOW=1 backs up at any time" '[ "$(runs)" = 3 ]'
rm -rf "$T"

setup ""
printf '%s 5000 mailcow-old\n' "$(at '2026-10-13 02:17')" > "$T/backups/.last-backup"
run "$(at '2026-10-15 01:17')"
check "a missed night is caught up before RT_BACKUP_HOUR" '[ "$(runs)" = 1 ]'
rm -rf "$T"

setup ""
run "$(at '2026-10-15 03:00')" FAKE_SKIP=mariadb && rc=0 || rc=$?
check "a missing archive fails the backup" '[ "$rc" = 1 ] && [ "$(status ok)" = false ] && grep -q mariadb "$T/status.json"'
check "the incomplete folder is removed" '[ -z "$(ls "$T/backups/mail")" ]'
run "$(at '2026-10-15 05:00')"
check "no retry within 4 hours of a failure" '[ "$(runs)" = 1 ]'
run "$(at '2026-10-15 07:30')"
check "retries after 4 hours" '[ "$(runs)" = 2 ] && [ "$(status ok)" = true ]'
rm -rf "$T"

setup ""
mkdir -p "$T/backups/mail"
for d in 2026-10-01 2026-10-02 2026-10-03; do
  mkdir "$T/backups/mail/mailcow-$d-02-17-00"
  touch -d "$d 02:17" "$T/backups/mail/mailcow-$d-02-17-00"
done
run "$(date +%s)" RT_BACKUP_NOW=1
check "old backups are deleted, but the newest two are kept" '[ "$(ls "$T/backups/mail" | wc -l)" = 2 ] && [ -d "$T/backups/mail/mailcow-2026-10-03-02-17-00" ]'
rm -rf "$T"

setup ""
mkdir -p "$T/backups/mail/mailcow-2026-10-01-02-17-00" "$T/backups/mail/mailcow-2026-10-02-02-17-00"
printf '%s 1000000 mailcow-2026-10-02-02-17-00\n' "$(at '2026-10-02 02:17')" > "$T/backups/.last-backup"
run "$(at '2026-10-15 03:00')" RT_BACKUP_FREE_BYTES=1000 && rc=0 || rc=$?
check "without disk space the backup is skipped and reported" '[ "$rc" = 1 ] && [ "$(runs)" = 0 ] && grep -q "Not enough disk space" "$T/status.json"'
check "old backups make room, but the last one is kept" '[ "$(ls "$T/backups/mail")" = mailcow-2026-10-02-02-17-00 ]'
rm -rf "$T"

setup "RT_BACKUP_RSYNC_TARGET=backup@nas:/srv/mail"
run "$(at '2026-10-15 03:00')" FAKE_RSYNC_EXIT=12
check "a failed off-site copy is reported, the backup still counts" '[ "$(status ok)" = true ] && [ "$(status offsite)" = "\"failed\"" ]'
rm -rf "$T"

setup "RT_BACKUP=n"
run "$(at '2026-10-15 03:00')"
check "RT_BACKUP=n: no backup, the Overview is told once" '[ "$(runs)" = 0 ] && [ "$(status enabled)" = false ]'
rm -f "$T/status.json"
run "$(at '2026-10-15 04:00')"
check "... and not again every hour" '[ ! -e "$T/status.json" ]'
rm -rf "$T"

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
