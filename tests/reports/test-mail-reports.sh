#!/usr/bin/env bash
# Tests scripts/mail-reports.sh with a fake docker: doveadm works on folders of messages
# (fake-doveadm.php), the PHP side runs for real but keeps its state in a file instead of Redis.
# Run: bash tests/reports/test-mail-reports.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$ROOT/tests/reports"
failures=0 passed=0

check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
  fi
}

# A fresh server: mailcow.conf with $1 added, an empty reports mailbox, fake docker on PATH
setup() {
  T=$(mktemp -d)
  mkdir -p "$T/app" "$T/bin" "$T/shared" "$T/mail/reports@rabbittech.com.np"
  printf 'TZ=Asia/Kathmandu\n%s\n' "$1" > "$T/app/mailcow.conf"
  cat > "$T/bin/docker" <<'DOCKER'
#!/usr/bin/env bash
[ "$1 $2 $3" = "compose exec -T" ] || { echo "fake docker: unexpected call: $*" >&2; exit 99; }
service=$4; shift 4
echo "$service $*" >> "$FAKE_CALLS"
case "$service" in
  dovecot-mailcow) [ "$1" = doveadm ] && shift && exec php "$FAKE_DOVEADM" "$@" ;;
  php-fpm-mailcow) [ "$1 $2" = "php /web/inc/lib/rabbittech-mail-reports.php" ] && shift 2 && exec php "$FAKE_REPORTS_PHP" "$@" ;;
esac
echo "fake docker: unexpected call: $service $*" >&2
exit 99
DOCKER
  chmod +x "$T/bin/docker"
  : > "$T/calls"
}

# A message in the reports mailbox: uid, then message.php's kind and report id
deliver() { php "$HERE/message.php" "$T/mail/reports@rabbittech.com.np/$1.eml" "$2" "${3:-$1}"; }

run() {
  env PATH="$T/bin:$PATH" APP_ROOT="$T" APP_DIR="$T/app" FAKE_CALLS="$T/calls" FAKE_MAIL="$T/mail" \
    FAKE_DOVEADM="$HERE/fake-doveadm.php" FAKE_REPORTS_PHP="$ROOT/data/web/inc/lib/rabbittech-mail-reports.php" \
    RT_REPORTS_STATE_FILE="$T/state.json" RT_REPORTS_NO_PTR=1 RT_REPORTS_CLOCK="${CLOCK:-1792130400}" \
    "$@" bash "$ROOT/scripts/mail-reports.sh" > "$T/out" 2>&1
}

# A value from the stored state, e.g. state '$s["status"]["ok"]'
state() { php -r '$s = json_decode(file_get_contents($argv[1]), true); echo json_encode('"$1"', JSON_UNESCAPED_SLASHES);' "$T/state.json"; }
flags() { cat "$T/mail/reports@rabbittech.com.np/$1.flags" 2>/dev/null || true; }
calls() { grep -c "$1" "$T/calls" || true; }

echo "Turned off"
setup ""
run
check "no RT_REPORTS_MAILBOX: the Overview is told reports are off" "[ \"\$(state '\$s[\"status\"][\"enabled\"]')\" = false ]"
check "...and Dovecot is not asked" "[ \$(calls dovecot) = 0 ]"
run
check "...once: later runs do nothing" "[ \$(calls php-fpm) = 1 ]"

echo "Reading reports"
setup "RT_REPORTS_MAILBOX=Reports@RabbitTech.com.np"
deliver 1 dmarc 4271520983447207164
deliver 2 hello
deliver 3 tls 2026-10-15T00:00:00Z_rabbittech.com.np
run
check "reads a DMARC and a TLS report" "[ \"\$(state 'array_keys(\$s[\"dmarc\"])')\" = '[\"google.com|4271520983447207164\"]' ] && [ \"\$(state 'count(\$s[\"tls\"])')\" = 1 ]"
check "the mailbox name is used in lower case" "grep -q 'doveadm search -u reports@rabbittech.com.np mailbox INBOX NOT KEYWORD rtreport' \"\$T/calls\""
check "status: read now, without errors" "[ \"\$(state '[\$s[\"status\"][\"ok\"], \$s[\"status\"][\"time\"], \$s[\"status\"][\"mailbox\"]]')\" = '[true,1792130400,\"reports@rabbittech.com.np\"]' ]"
check "every message read is marked, so it isn't read again" "[ \"\$(flags 1)\" = 'rtreport \\Seen' ] && [ \"\$(flags 2)\" = rtreport ] && [ \"\$(flags 3)\" = 'rtreport \\Seen' ]"
check "an ordinary message stays unread for you" "! grep -q Seen \"\$T/mail/reports@rabbittech.com.np/2.flags\""
check "the log says what was read" "grep -q 'Read 3 new messages in reports@rabbittech.com.np: 2 with reports' \"\$T/out\""

CLOCK=1792131300 run
check "nothing new: no fetch, but the status says when it looked" "[ \$(calls 'doveadm -f json fetch') = 1 ] && [ \"\$(state '\$s[\"status\"][\"time\"]')\" = 1792131300 ] && [ ! -s \"\$T/out\" ]"

deliver 4 dmarc 4271520983447207164
deliver 5 dmarc 99
run
check "a report sent twice is kept once" "[ \"\$(state 'array_keys(\$s[\"dmarc\"])')\" = '[\"google.com|4271520983447207164\",\"google.com|99\"]' ]"

echo "Many messages"
setup "RT_REPORTS_MAILBOX=reports@rabbittech.com.np"
for uid in $(seq 1 60); do deliver "$uid" dmarc "r$uid"; done
run
check "read 25 at a time" "[ \$(calls 'doveadm -f json fetch') = 3 ] && grep -q 'uid text mailbox INBOX uid 51,52,53,54,55,56,57,58,59,60$' \"\$T/calls\""
check "all 60 kept and marked" "[ \"\$(state 'count(\$s[\"dmarc\"])')\" = 60 ] && [ \$(grep -l rtreport \"\$T\"/mail/*/*.flags | wc -l) = 60 ]"
setup "RT_REPORTS_MAILBOX=reports@rabbittech.com.np"
for uid in $(seq 1 60); do deliver "$uid" hello; done
run RT_REPORTS_LIMIT=30
check "a full mailbox is read a part per run" "[ \$(ls \"\$T\"/mail/*/*.flags | wc -l) = 30 ]"
run RT_REPORTS_LIMIT=30
check "...and the rest on the next" "[ \$(ls \"\$T\"/mail/*/*.flags | wc -l) = 60 ] && [ \$(calls 'doveadm -f json fetch') = 4 ]"

echo "Problems"
setup "RT_REPORTS_MAILBOX=dmarc@rabbittech.com.np"
rc=0; run || rc=$?
check "a mailbox that doesn't exist fails, saying so" "[ \$rc = 1 ] && [ \"\$(state '\$s[\"status\"][\"ok\"]')\" = false ] && state '\$s[\"status\"][\"error\"]' | grep -q 'There is no mailbox dmarc@rabbittech.com.np. Create it in the console'"
setup "RT_REPORTS_MAILBOX=reports"
rc=0; run || rc=$?
check "a setting that isn't an email address fails" "[ \$rc = 1 ] && state '\$s[\"status\"][\"error\"]' | grep -q 'RT_REPORTS_MAILBOX is not an email address: reports' && [ \$(calls dovecot) = 0 ]"

setup "RT_REPORTS_MAILBOX=reports@rabbittech.com.np"
deliver 1 dmarc 1
run
deliver 2 dmarc 2
rc=0; run FAKE_FAIL=fetch || rc=$?
check "a failed fetch fails the run and keeps what was read before" "[ \$rc = 1 ] && state '\$s[\"status\"][\"error\"]' | grep -q 'Dovecot could not fetch messages 2' && [ \"\$(state 'count(\$s[\"dmarc\"])')\" = 1 ]"
check "...the status keeps the last good run" "[ \"\$(state '\$s[\"status\"][\"last_success\"]')\" = 1792130400 ]"
check "...and the message waits for the next run" "[ -z \"\$(flags 2)\" ]"
run
check "the next run reads it" "[ \"\$(state 'count(\$s[\"dmarc\"])')\" = 2 ] && [ \"\$(state '\$s[\"status\"][\"ok\"]')\" = true ]"
rc=0; run FAKE_FAIL=search || rc=$?
check "a failed search names Dovecot's error" "[ \$rc = 1 ] && state '\$s[\"status\"][\"error\"]' | grep -q 'Dovecot could not search reports@rabbittech.com.np: Error: Internal error occurred'"

setup "RT_REPORTS_MAILBOX=reports@rabbittech.com.np"
deliver 1 dmarc 1
exec 8> "$T/shared/.mail-reports.lock"
flock -n 8
rc=0; run || rc=$?
check "a second run while one is going does nothing" "[ \$rc = 0 ] && [ ! -s \"\$T/calls\" ]"
exec 8>&-

echo
echo "$passed passed, $failures failed"
exit $((failures > 0))
