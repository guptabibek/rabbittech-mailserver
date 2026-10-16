#!/usr/bin/env bash
# Restore test: proves that a backup can be restored, without touching the live mail server.
# It restores the backup piece by piece into throwaway containers (no network, removed at the
# end) and checks what came back:
#   config    the backup's mailcow.conf has the database names and passwords
#   archives  every archive decompresses without errors
#   database  MariaDB starts from the database copy, with the domains, mailboxes and aliases
#   mail      the mail archive holds every mailbox that has mail, and a message from it opens
#             with the backup's own keys (mailcow compresses and encrypts stored mail)
#   dkim      the Redis copy holds a DKIM key for every domain that signs mail
# Mailboxes, domains and DKIM keys are compared with the live server, which is only read;
# anything created less than a day before the backup is left out. The result goes to the
# Overview (Redis key RT_RESTORE_TEST) and to $STATE_DIR/.last-restore-test.
#
# scripts/backup-mail.sh runs it after a backup when one is due (RT_RESTORE_TEST_DAYS).
# Run it by hand on the last good backup: bash scripts/restore-test.sh [backup folder]
# The tests in tests/backup swap in images, the live server, Redis and free space through the
# RT_RESTORE_* variables.
set -Euo pipefail

APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
APP_DIR="${APP_DIR:-$APP_ROOT/app}"
STATE_DIR="${RT_BACKUP_STATE_DIR:-$APP_ROOT/backups}"
BACKUP_ROOT="${RT_BACKUP_DIR:-$STATE_DIR/mail}"
NOW="${RT_RESTORE_CLOCK:-$(date +%s)}"
ID="rt-restore-$$"
LABEL=rabbittech.restore-test

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# A value from mailcow.conf (default: the live one), read without running the file
conf() {
  local value
  value=$(sed -n "s/^$1=//p" "${2:-$APP_DIR/mailcow.conf}" 2>/dev/null | tail -n 1)
  value=${value%\"}; value=${value#\"}
  printf '%s' "$value"
}

# The image a service runs in docker-compose.yml, so the test uses the versions the server runs
compose_image() {
  awk -v s="$1:" '$1 == s { found = 1; next } found && $1 == "image:" { print $2; exit }' "$APP_DIR/docker-compose.yml" 2>/dev/null
}
SQL_IMAGE="${RT_RESTORE_SQL_IMAGE:-$(compose_image mysql-mailcow)}"
REDIS_IMAGE="${RT_RESTORE_REDIS_IMAGE:-$(compose_image redis-mailcow)}"
DOVECOT_IMAGE="${RT_RESTORE_DOVECOT_IMAGE:-$(compose_image dovecot-mailcow)}"
# The image mailcow's backup script packs the archives with (tar and zstd)
TOOLS_IMAGE="${RT_RESTORE_TOOLS_IMAGE:-$(sed -n 's/^DEBIAN_DOCKER_IMAGE="\(.*\)"/\1/p' "$APP_DIR/helper-scripts/backup_and_restore.sh" 2>/dev/null)}"
TOOLS_IMAGE="${TOOLS_IMAGE:-ghcr.io/mailcow/backup:latest}"

json_string() {
  local s=${1//\\/\\\\}
  s=${s//\"/\\\"}
  printf '"%s"' "$(printf '%s' "$s" | tr '\n\r\t' '   ')"
}

# ------------------------------------------------------------------ results
NAMES=() OKS=() DETAILS=()
check() {
  NAMES+=("$1") OKS+=("$2") DETAILS+=("$3")
  if [ "$2" = true ]; then log "ok    $1: $3"; else log "FAIL  $1: $3"; fi
}

# Stores the result: the first failed check, or $1 when the test could not run at all. Redis
# being down must not change the result.
report() {
  local ok=true error="" i checks="" json
  for i in "${!NAMES[@]}"; do
    [ -n "$checks" ] && checks+=","
    checks+=$(printf '{"name":%s,"ok":%s,"detail":%s}' "$(json_string "${NAMES[$i]}")" "${OKS[$i]}" "$(json_string "${DETAILS[$i]}")")
    if [ "${OKS[$i]}" != true ] && [ "$ok" = true ]; then
      ok=false
      error="${NAMES[$i]}: ${DETAILS[$i]}"
    fi
  done
  if [ -n "${1:-}" ]; then ok=false; error=$1; fi
  json=$(printf '{"time":%s,"ok":%s,"backup":%s,"backup_time":%s,"error":%s,"checks":[%s]}' \
    "$NOW" "$ok" "$(json_string "${BACKUP##*/}")" "${BACKUP_TIME:-0}" "$(json_string "$error")" "$checks")
  printf '%s %s %s\n' "$NOW" "$([ "$ok" = true ] && echo 1 || echo 0)" "${BACKUP##*/}" > "$STATE_DIR/.last-restore-test"
  if [ -n "${RT_RESTORE_REDIS_CMD:-}" ]; then
    printf '%s' "$json" | sh -c "$RT_RESTORE_REDIS_CMD" || log "Could not store the result"
  else
    (cd "$APP_DIR" && docker compose exec -T redis-mailcow sh -c 'REDISCLI_AUTH="$REDISPASS" redis-cli SET RT_RESTORE_TEST "$1" >/dev/null' sh "$json") \
      || log "Could not store the result in Redis"
  fi
  if [ "$ok" = true ]; then log "Restore test passed"; else log "Restore test failed: $error"; fi
  [ "$ok" = true ]
}

# ------------------------------------------------------------------ the live server (read only)
# Prints the answer to one question about the live server, one item per line. Tests answer them
# through RT_RESTORE_LIVE_CMD; RT_RESTORE_LIVE=off leaves the comparisons out.
live() {
  if [ "${RT_RESTORE_LIVE:-on}" = off ]; then return 0; fi
  if [ -n "${RT_RESTORE_LIVE_CMD:-}" ]; then "$RT_RESTORE_LIVE_CMD" "$@"; return; fi
  case $1 in
    sql) # $2: a query in the mailcow database
      (cd "$APP_DIR" && docker compose exec -T mysql-mailcow sh -c \
        'MYSQL_PWD="$MYSQL_PASSWORD" mariadb -N -B -u"$MYSQL_USER" "$MYSQL_DATABASE" -e "$1"' sh "$2") ;;
    redis) # the rest: a Redis command
      shift
      (cd "$APP_DIR" && docker compose exec -T redis-mailcow sh -c \
        'REDISCLI_AUTH="$REDISPASS" redis-cli --no-auth-warning "$@"' sh "$@") ;;
    mail) # domain/user of every mailbox with a message in its inbox that has not changed for $2 minutes
      (cd "$APP_DIR" && docker compose exec -T dovecot-mailcow sh -c \
        'cd /var/vmail && find . -mindepth 4 -maxdepth 4 -type f \( -path "./*/*/cur/*" -o -path "./*/*/new/*" \) -cmin "+$1" | cut -d/ -f2,3 | sort -u' sh "$2") ;;
    database_size) # bytes the live database takes
      local volume
      volume="$(conf COMPOSE_PROJECT_NAME | tr -cd '0-9A-Za-z_-')_mysql-vol-1"
      # docker run would create a missing volume
      docker volume inspect "$volume" >/dev/null 2>&1 || return 0
      docker run --rm --network none -v "$volume:/v:ro" --entrypoint du "$TOOLS_IMAGE" -sb /v 2>/dev/null | awk '{ print $1 }' ;;
  esac
}

# Lines of the first list that are not in the second
missing() { LC_ALL=C comm -23 <(printf '%s\n' "$1" | sed '/^$/d' | LC_ALL=C sort -u) <(printf '%s\n' "$2" | sed '/^$/d' | LC_ALL=C sort -u); }
# "a, b, c and 2 more"
some() {
  local items count
  items=$(printf '%s\n' "$1" | sed '/^$/d')
  count=$(printf '%s\n' "$items" | sed '/^$/d' | wc -l)
  if [ "$count" -le 3 ]; then printf '%s' "$items" | paste -sd, - | sed 's/,/, /g'
  else printf '%s and %s more' "$(printf '%s\n' "$items" | head -n 3 | paste -sd, - | sed 's/,/, /g')" $((count - 3)); fi
}

# ------------------------------------------------------------------ throwaway containers
# Everything the test creates carries $LABEL. Under the lock, anything labelled is left over from
# a test that was killed, so it goes too.
cleanup() {
  docker ps -aq --filter "label=$LABEL" 2>/dev/null | xargs -r docker rm -f >/dev/null 2>&1 || true
  docker volume ls -q --filter "label=$LABEL" 2>/dev/null | xargs -r docker volume rm -f >/dev/null 2>&1 || true
}
# run IMAGE SCRIPT [ARGS]: a shell script in a container with no network that can read the
# backup ($1... are the ARGS)
run() {
  local image=$1 script=$2; shift 2
  docker run --rm --label "$LABEL" --network none --cpus 1 -v "$BACKUP:/backup:ro" -v "$ID-work:/work" \
    --entrypoint /bin/sh "$image" -c "$script" sh "$@"
}
untar() { printf 'tar --use-compress-program="zstd -d" -P %s /backup/backup_%s.tar.zst' "$1" "$2"; }

mkdir -p "$STATE_DIR"
exec 8> "$STATE_DIR/.restore-test.lock"
if ! flock -n 8; then
  log "Another restore test is still running"
  exit 0
fi
cleanup
trap cleanup EXIT
trap 'exit 1' INT TERM HUP

# ------------------------------------------------------------------ which backup
if [ -n "${1:-}" ]; then
  BACKUP=$(cd "$1" 2>/dev/null && pwd) || { BACKUP=$1; report "Backup folder not found: $1"; exit 1; }
else
  # The last good backup; the newest folder may be one that is still being written
  last=""
  [ -f "$STATE_DIR/.last-backup" ] && read -r _ _ last < "$STATE_DIR/.last-backup"
  if [ -n "$last" ] && [ -d "$BACKUP_ROOT/$last" ]; then
    BACKUP="$BACKUP_ROOT/$last"
  else
    BACKUP=$(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name 'mailcow-*' 2>/dev/null | LC_ALL=C sort | tail -n 1)
    [ -n "$BACKUP" ] || { BACKUP=none; report "There is no backup to test in $BACKUP_ROOT"; exit 1; }
  fi
fi
log "Restore test of ${BACKUP##*/}"
# mailcow-2026-10-16-02-00-00 is when the backup started (the server's local time)
stamp=$(sed -n 's/^mailcow-\([0-9-]\{10\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)-\([0-9]\{2\}\)$/\1 \2:\3:\4/p' <<< "${BACKUP##*/}")
BACKUP_TIME=$( { [ -n "$stamp" ] && date -d "$stamp" +%s; } 2>/dev/null || stat -c %Y "$BACKUP")
# Things created in the last day before the backup may not be in it; the margin also covers a
# database clock in another time zone than the host's
CUTOFF=$(date -d "@$((BACKUP_TIME - 86400))" '+%F %T')

# ------------------------------------------------------------------ config
need_conf=""
for key in MAILCOW_HOSTNAME DBNAME DBUSER DBPASS DBROOT; do
  [ -n "$(conf "$key" "$BACKUP/mailcow.conf")" ] || need_conf+=" $key"
done
if [ ! -s "$BACKUP/mailcow.conf" ]; then
  check config false "The backup has no mailcow.conf"
elif [ -n "$need_conf" ]; then
  check config false "mailcow.conf in the backup lacks$need_conf"
else
  check config true "mailcow.conf for $(conf MAILCOW_HOSTNAME "$BACKUP/mailcow.conf")"
fi
DBNAME=$(conf DBNAME "$BACKUP/mailcow.conf")
DBNAME=${DBNAME:-mailcow}

# ------------------------------------------------------------------ disk space
# The database copy is unpacked in full; mail is only listed and one message unpacked
db_bytes=$(live database_size || true)
[[ "${db_bytes:-}" =~ ^[0-9]+$ ]] || db_bytes=0
need=$((db_bytes * 12 / 10 + 200 * 1048576))
if [ -n "${RT_RESTORE_FREE_BYTES:-}" ]; then
  free=$RT_RESTORE_FREE_BYTES
else
  free=$(df -PB1 "$(docker info --format '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)" 2>/dev/null | awk 'NR == 2 { print $4 }')
fi
[[ "${free:-}" =~ ^[0-9]+$ ]] || free=0
if [ "$free" -lt "$need" ]; then
  report "Not enough disk space for a restore test: about $((need / 1048576)) MiB needed, $((free / 1048576)) MiB free"
  exit 1
fi
docker volume create --label "$LABEL" "$ID-work" >/dev/null

# ------------------------------------------------------------------ archives
bad=""
for name in crypt redis rspamd postfix mariadb vmail; do
  [ -s "$BACKUP/backup_$name.tar.zst" ] || bad+=" $name (missing)"
done
# The mail archive is read to the end below; the others are checked here
damaged=$(run "$TOOLS_IMAGE" 'for name in crypt redis rspamd postfix mariadb; do
  [ -s "/backup/backup_$name.tar.zst" ] && { zstd -tq "/backup/backup_$name.tar.zst" 2>/dev/null || echo "$name"; }
done' 2>&1) || damaged="${damaged:-the check could not run}"
for name in $damaged; do bad+=" $name (damaged)"; done
if [ -n "$bad" ]; then check archives false "Archives that can't be read:$bad"; else check archives true "6 archives"; fi

# ------------------------------------------------------------------ database
database() {
  # Unpacked the way backup_and_restore.sh restores it
  docker volume create --label "$LABEL" "$ID-sql" >/dev/null
  if ! docker run --rm --label "$LABEL" --network none --cpus 1 -v "$BACKUP:/backup:ro" -v "$ID-sql:/backup_mariadb" \
      --entrypoint /bin/sh "$SQL_IMAGE" -c "$(untar -xf mariadb)" >/dev/null 2>&1; then
    check database false "The database archive could not be unpacked"; return
  fi
  docker run -d --label "$LABEL" --name "$ID-sql" --network none --cpus 1 -v "$ID-sql:/var/lib/mysql" \
    --entrypoint mariadbd "$SQL_IMAGE" --user=mysql --datadir=/var/lib/mysql --skip-grant-tables --skip-networking >/dev/null 2>&1
  local i
  for i in $(seq 1 90); do
    docker exec "$ID-sql" mariadb-admin ping >/dev/null 2>&1 && break
    if [ "$(docker inspect -f '{{.State.Running}}' "$ID-sql" 2>/dev/null)" != true ] || [ "$i" = 90 ]; then
      check database false "MariaDB does not start from the copy: $(docker logs "$ID-sql" 2>&1 | grep -iE '\[error\]|fatal' | tail -n 1 | cut -c1-200)"
      return
    fi
    sleep 1
  done
  sql() { docker exec "$ID-sql" mariadb -N -B "$DBNAME" -e "$1" 2>/dev/null; }
  local counts domains mailboxes aliases lost_domains lost_mailboxes
  counts=$(sql "SELECT (SELECT COUNT(*) FROM domain), (SELECT COUNT(*) FROM mailbox), (SELECT COUNT(*) FROM alias)") \
    || { check database false "MariaDB started, but the $DBNAME database can't be read"; return; }
  read -r domains mailboxes aliases <<< "$counts"
  lost_domains=$(missing "$(live sql "SELECT domain FROM domain WHERE created < '$CUTOFF'")" "$(sql "SELECT domain FROM domain")")
  lost_mailboxes=$(missing "$(live sql "SELECT username FROM mailbox WHERE created < '$CUTOFF'")" "$(sql "SELECT username FROM mailbox")")
  if [ -n "$lost_domains" ]; then
    check database false "Domains missing from the copy: $(some "$lost_domains")"
  elif [ -n "$lost_mailboxes" ]; then
    check database false "Mailboxes missing from the copy: $(some "$lost_mailboxes")"
  else
    check database true "$domains domains, $mailboxes mailboxes, $aliases aliases"
  fi
  docker rm -f "$ID-sql" >/dev/null 2>&1
}
database

# ------------------------------------------------------------------ mail
mail() {
  # Listing the whole archive also proves it decompresses to the end
  local listing status summary count first boxes live_mail lost
  listing=$(mktemp)
  run "$TOOLS_IMAGE" "$(untar -tf vmail)" > "$listing" 2>/dev/null
  status=$?
  # Messages are /vmail/<domain>/<user>/{cur,new}/<file>, or /vmail/<domain>/<user>/.<folder>/{cur,new}/<file>.
  # The one to open: the smallest inbox message among the first thousand (Dovecot puts the size
  # in the name, S=<bytes>), so unpacking it stops early in the archive.
  summary=$(awk -F/ '
    /^\/vmail\/[^\/]+\/[^\/]+\/(\.[^\/]+\/)?(cur|new)\/[^\/]+$/ {
      count++; boxes[$3 "/" $4] = 1
      if (NF == 6 && count <= 1000) {
        size = match($6, /,S=[0-9]+/) ? substr($6, RSTART + 3, RLENGTH - 3) + 0 : 1e15
        if (first == "" || size < best) { first = $0; best = size }
      }
    }
    END { print count + 0; print first; for (b in boxes) print b }' "$listing")
  rm -f "$listing"
  if [ "$status" -ne 0 ]; then check mail false "The mail archive is damaged (it can't be read to the end)"; return; fi
  count=$(sed -n 1p <<< "$summary")
  first=$(sed -n 2p <<< "$summary")
  boxes=$(sed -n '3,$p' <<< "$summary")

  # Mailboxes with an inbox message from over a day before the backup (by when the file last
  # changed: Dovecot renames a message when its flags change, so this is never later than the
  # backup saw it). Mail that came later may be all a mailbox has.
  live_mail=$(live mail $(( (NOW - BACKUP_TIME) / 60 + 1440 )))
  lost=$(missing "$live_mail" "$boxes")
  if [ -n "$lost" ]; then check mail false "Mailboxes with mail but none in the backup: $(some "$(awk -F/ '{ print $2 "@" $1 }' <<< "$lost")")"; return; fi
  if [ "$count" -eq 0 ] || [ -z "$first" ]; then
    if [ -n "$live_mail" ]; then check mail false "The mail archive holds no messages"; else check mail true "No mail to restore yet"; fi
    return
  fi

  # One message, opened with the keys in the backup the way Dovecot reads it
  local who keys opened reason
  who=$(awk -F/ '{ print $4 "@" $3 }' <<< "$first")
  if ! run "$TOOLS_IMAGE" "$(untar -xOf vmail) --occurrence=1 \"\$1\" > /work/message && [ -s /work/message ]" "$first" >/dev/null 2>&1; then
    check mail false "A message to $who could not be unpacked from the mail archive"; return
  fi
  keys=$(run "$TOOLS_IMAGE" "cd /work && $(untar -xOf crypt) /crypt/ecprivkey.pem > ecprivkey.pem && $(untar -xOf crypt) /crypt/ecpubkey.pem > ecpubkey.pem
grep -q 'PRIVATE KEY' ecprivkey.pem && grep -q 'PUBLIC KEY' ecpubkey.pem && echo ok" 2>/dev/null)
  if [ "$keys" != ok ]; then
    check mail false "The backup has no mail encryption keys (crypt archive), so its mail can't be opened"; return
  fi
  opened=$(run "$DOVECOT_IMAGE" 'cd /work
if [ "$(head -c 7 message)" = CRYPTED ]; then
  doveadm -O fs get crypt "private_key_path=/work/ecprivkey.pem:public_key_path=/work/ecpubkey.pem:posix:" message > opened 2> error || { cat error; exit 0; }
else
  mv message opened
fi
# mailcow compresses mail before encrypting it (zlib_save = lz4); fs compress finds the method
doveadm -O fs get compress "gz:6:posix:" opened > text 2>/dev/null || mv opened text
head -c 8192 text' 2>&1)
  # A message starts with a header field; still compressed or encrypted, it starts with Dovecot's
  # magic bytes instead (small compressed messages keep their text readable after those)
  if head -n 1 <<< "$opened" | grep -qE '^[!-9;-~]+:' \
      && grep -qiE '^(received|from|date|subject|return-path|message-id|delivered-to|to):' <<< "$opened"; then
    check mail true "$count messages in $(wc -l <<< "$boxes") mailboxes; a message to $who opens with the backup's keys"
  else
    reason=$(grep -m1 -iE 'error|fatal' <<< "$opened" | sed 's/.*failed: //' | cut -c1-160)
    check mail false "A message to $who does not open with the backup's keys${reason:+: $reason}"
  fi
}
mail

# ------------------------------------------------------------------ dkim
dkim() {
  if ! run "$TOOLS_IMAGE" "$(untar -xOf redis) /redis/dump.rdb > /work/dump.rdb && [ -s /work/dump.rdb ]" >/dev/null 2>&1; then
    check dkim false "The Redis archive has no dump.rdb"; return
  fi
  docker run -d --label "$LABEL" --name "$ID-redis" --network none --cpus 1 -v "$ID-work:/work" --entrypoint redis-server "$REDIS_IMAGE" \
    --dir /work --dbfilename dump.rdb --save '' --appendonly no --port 0 --unixsocket /tmp/redis.sock >/dev/null 2>&1
  local i
  for i in $(seq 1 60); do
    [ "$(docker exec "$ID-redis" redis-cli -s /tmp/redis.sock ping 2>/dev/null)" = PONG ] && break
    if [ "$(docker inspect -f '{{.State.Running}}' "$ID-redis" 2>/dev/null)" != true ] || [ "$i" = 60 ]; then
      check dkim false "Redis does not load the copy: $(docker logs "$ID-redis" 2>&1 | tail -n 1 | cut -c1-200)"; return
    fi
    sleep 1
  done
  r() { docker exec "$ID-redis" redis-cli -s /tmp/redis.sock "$@" 2>/dev/null; }
  # A domain signs with a public key, a selector, and the private key under <selector>.<domain>
  local signed="" domain selector wanted lost
  while read -r domain; do
    [ -n "$domain" ] || continue
    selector=$(r HGET DKIM_SELECTORS "$domain")
    [ -n "$selector" ] && [ "$(r HEXISTS DKIM_PRIV_KEYS "$selector.$domain")" = 1 ] && signed+="$domain"$'\n'
  done < <(r HKEYS DKIM_PUB_KEYS)
  # Live domains with a DKIM key that existed a day before the backup
  wanted=$(live redis HKEYS DKIM_PUB_KEYS)
  [ -n "$wanted" ] && wanted=$(LC_ALL=C comm -12 <(printf '%s\n' "$wanted" | sed '/^$/d' | LC_ALL=C sort -u) \
    <(live sql "SELECT domain FROM domain WHERE created < '$CUTOFF'" | sed '/^$/d' | LC_ALL=C sort -u))
  lost=$(missing "$wanted" "$signed")
  if [ -n "$lost" ]; then
    check dkim false "No DKIM key in the backup for $(some "$lost")"
  else
    check dkim true "DKIM keys for $(printf '%s' "$signed" | sed '/^$/d' | wc -l) domains"
  fi
  docker rm -f "$ID-redis" >/dev/null 2>&1
}
dkim

report
