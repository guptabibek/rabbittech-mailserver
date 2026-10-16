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
  # restore-test.sh: notes the folder and writes its state file; FAKE_RESTORE_OK=0 fails it
  cat > "$T/restore.sh" <<'RESTORE'
#!/usr/bin/env bash
echo "$1" >> "$FAKE_RESTORES"
echo "restore test output"
printf '%s %s %s\n' "$RT_BACKUP_CLOCK" "${FAKE_RESTORE_OK:-1}" "${1##*/}" > "$RT_BACKUP_STATE_DIR/.last-restore-test"
[ "${FAKE_RESTORE_OK:-1}" = 1 ]
RESTORE
  printf '#!/bin/sh\necho "1000 /v"\n' > "$T/bin/docker"
  printf '#!/bin/sh\nexit "${FAKE_RSYNC_EXIT:-0}"\n' > "$T/bin/rsync"
  chmod +x "$T/helper.sh" "$T/restore.sh" "$T/bin/docker" "$T/bin/rsync"
  : > "$T/runs"
  : > "$T/restores"
}

run() {
  local clock=$1; shift
  env PATH="$T/bin:$PATH" APP_ROOT="$T" APP_DIR="$T/app" RT_BACKUP_HELPER="$T/helper.sh" \
    RT_BACKUP_CLOCK="$clock" RT_BACKUP_REDIS_CMD="cat > '$T/status.json'" FAKE_RUNS="$T/runs" \
    RT_RESTORE_SCRIPT="$T/restore.sh" FAKE_RESTORES="$T/restores" RT_BACKUP_STATE_DIR="$T/backups" \
    "$@" bash "$SCRIPT" > "$T/out" 2>&1
}
runs() { wc -l < "$T/runs" | tr -d ' '; }
restores() { wc -l < "$T/restores" | tr -d ' '; }
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

echo "Restore tests"

setup ""
run "$(at '2026-10-15 02:17')"
check "the first backup is restore-tested right away" '[ "$(restores)" = 1 ] && [ "$(cat "$T/restores")" = "$T/backups/mail/mailcow-2026-10-14-20-32-00" ]'
check "its output goes to restore-test-last-run.log" 'grep -q "restore test output" "$T/backups/restore-test-last-run.log" && grep -q "Restore test passed" "$T/out"'
check "the Overview learns the interval" '[ "$(status restore_days)" = 7 ]'
for day in 16 17 18 19 20 21; do run "$(at "2026-10-$day 02:17")"; done
check "not again for the next six nights" '[ "$(runs)" = 7 ] && [ "$(restores)" = 1 ]'
run "$(at '2026-10-22 02:17')"
check "a week later, again" '[ "$(restores)" = 2 ]'
run "$(at '2026-10-29 02:10')"
check "a backup a few minutes earlier in the day still counts as a week" '[ "$(restores)" = 3 ]'
rm -rf "$T"

setup ""
run "$(at '2026-10-15 02:17')" FAKE_RESTORE_OK=0 && rc=0 || rc=$?
check "a failed restore test leaves the backup good" '[ "$rc" = 0 ] && [ "$(status ok)" = true ] && grep -q "Restore test failed (see" "$T/out"'
run "$(at '2026-10-16 02:17')"
check "after a failure, the next backup is tested again" '[ "$(restores)" = 2 ]'
run "$(at '2026-10-17 02:17')"
check "... and once it passes, it waits a week again" '[ "$(restores)" = 2 ]'
rm -rf "$T"

setup ""
run "$(at '2026-10-15 03:00')" FAKE_SKIP=vmail || true
check "a failed backup is not restore-tested" '[ "$(restores)" = 0 ]'
rm -rf "$T"

setup "RT_RESTORE_TEST_DAYS=3"
run "$(at '2026-10-15 02:17')"
run "$(at '2026-10-17 02:17')"
check "RT_RESTORE_TEST_DAYS sets the interval" '[ "$(restores)" = 1 ] && [ "$(status restore_days)" = 3 ]'
run "$(at '2026-10-18 02:17')"
check "... three days later, again" '[ "$(restores)" = 2 ]'
rm -rf "$T"

setup "RT_RESTORE_TEST=n"
run "$(at '2026-10-15 02:17')"
check "RT_RESTORE_TEST=n: no restore test, the Overview is told" '[ "$(runs)" = 1 ] && [ "$(restores)" = 0 ] && [ "$(status restore_days)" = 0 ]'
rm -rf "$T"

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
