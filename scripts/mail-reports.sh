#!/usr/bin/env bash
# Reads the reports mail providers send about your domains: DMARC aggregate reports (who sent
# mail as the domain, and whether it passed SPF and DKIM) and TLS reports (whether servers could
# deliver to yours over TLS). The Overview shows a 30-day summary and warns about failures.
#
# Cron runs it every 15 minutes (installed by scripts/deploy-vps.sh). Each new message in the
# reports mailbox's inbox is read once and gets the keyword "rtreport". Reports are marked as read
# and kept for 31 days in Redis (RT_MAIL_REPORTS); other messages stay unread for you. Nothing is
# deleted from the mailbox.
#
# Settings in mailcow.conf:
#   RT_REPORTS_MAILBOX=   the mailbox the reports go to, e.g. reports@rabbittech.com.np (create it
#                         in the console first). Empty: reports are not read.
#
# tests/reports/test-mail-reports.sh swaps in a fake docker and keeps the reports in a file.
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
STATE_DIR="${RT_REPORTS_STATE_DIR:-$APP_ROOT/shared}"
BATCH=25
# A first run on a full mailbox reads this many messages; the rest follow on the next runs
LIMIT="${RT_REPORTS_LIMIT:-500}"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Values from mailcow.conf, read without running the file
conf() {
  local value
  value=$(sed -n "s/^$1=//p" "$APP_DIR/mailcow.conf" 2>/dev/null | tail -n 1)
  value=${value%\"}; value=${value#\"}
  printf '%s' "${value:-${2:-}}"
}

doveadm() { (cd "$APP_DIR" && docker compose exec -T dovecot-mailcow doveadm "$@"); }
reports() { (cd "$APP_DIR" && docker compose exec -T php-fpm-mailcow php /web/inc/lib/rabbittech-mail-reports.php "$@"); }

fail() {
  log "Reading the reports failed: $1"
  reports failed "$MAILBOX" "$1" || log "Could not store the status"
  exit 1
}

[ -f "$APP_DIR/mailcow.conf" ] || { log "No mailcow.conf in $APP_DIR"; exit 1; }
mkdir -p "$STATE_DIR"
exec 9> "$STATE_DIR/.mail-reports.lock"
flock -n 9 || exit 0

MAILBOX=$(conf RT_REPORTS_MAILBOX | tr '[:upper:]' '[:lower:]')
if [ -z "$MAILBOX" ]; then
  # Tell the Overview once; cron keeps calling
  if [ ! -f "$STATE_DIR/.mail-reports-off" ]; then
    reports off && touch "$STATE_DIR/.mail-reports-off"
  fi
  exit 0
fi
rm -f "$STATE_DIR/.mail-reports-off"
[[ "$MAILBOX" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || fail "RT_REPORTS_MAILBOX is not an email address: $MAILBOX"

# "<mailbox guid> <uid>" per message not read yet. doveadm exits with 67 for an unknown user.
rc=0
found=$(doveadm search -u "$MAILBOX" mailbox INBOX NOT KEYWORD rtreport 2>&1) || rc=$?
if [ "$rc" = 67 ]; then
  fail "There is no mailbox $MAILBOX. Create it in the console, or set RT_REPORTS_MAILBOX to one that exists"
elif [ "$rc" != 0 ]; then
  fail "Dovecot could not search $MAILBOX: $(printf '%s' "$found" | tail -n 1)"
fi
mapfile -t uids < <(printf '%s\n' "$found" | awk 'NF == 2 && $2 ~ /^[0-9]+$/ { print $2 }' | head -n "$LIMIT")

if [ "${#uids[@]}" -eq 0 ]; then
  # Nothing new; the status still says when the mailbox was last looked at
  printf '[]' | reports read "$MAILBOX" >/dev/null || fail "The status could not be stored"
  exit 0
fi

read_count=0 report_count=0
for ((i = 0; i < ${#uids[@]}; i += BATCH)); do
  set=$(IFS=,; echo "${uids[*]:i:BATCH}")
  messages=$(doveadm -f json fetch -u "$MAILBOX" 'uid text' mailbox INBOX uid "$set") || fail "Dovecot could not fetch messages $set"
  had_reports=$(printf '%s' "$messages" | reports read "$MAILBOX") || fail "Messages $set could not be read"
  doveadm flags add -u "$MAILBOX" rtreport mailbox INBOX uid "$set" || fail "Messages $set could not be marked as done"
  if [ -n "$had_reports" ]; then
    doveadm flags add -u "$MAILBOX" '\Seen' mailbox INBOX uid "${had_reports// /,}" || fail "Reports $had_reports could not be marked as read"
    report_count=$((report_count + $(wc -w <<< "$had_reports")))
  fi
  read_count=$((read_count + $(tr ',' '\n' <<< "$set" | wc -l)))
done
log "Read $read_count new messages in $MAILBOX: $report_count with reports"
