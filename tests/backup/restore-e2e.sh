#!/usr/bin/env bash
# Runs scripts/restore-test.sh in real containers on a small backup made the way mailcow's
# backup_and_restore.sh makes one:
#   database  MariaDB with mailcow's tables, copied with mariabackup --backup and --prepare
#   mail      messages saved by Dovecot compressed (lz4) and encrypted (mail_crypt with global
#             keys), as mailcow stores them
#   redis     DKIM keys in Redis, saved to dump.rdb
# Then it breaks copies of the backup in the ways the restore test must catch. The live server
# is a fixture (RT_RESTORE_LIVE_CMD). Needs Docker; the images are the ones docker-compose.yml
# runs, and RT_RESTORE_{SQL,REDIS,DOVECOT,TOOLS}_IMAGE swap them.
# Run: bash tests/backup/restore-e2e.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/restore-test.sh"
failures=0 passed=0

check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
  fi
}

compose_image() {
  awk -v s="$1:" '$1 == s { found = 1; next } found && $1 == "image:" { print $2; exit }' "$ROOT/docker-compose.yml"
}
export RT_RESTORE_SQL_IMAGE="${RT_RESTORE_SQL_IMAGE:-$(compose_image mysql-mailcow)}"
export RT_RESTORE_REDIS_IMAGE="${RT_RESTORE_REDIS_IMAGE:-$(compose_image redis-mailcow)}"
export RT_RESTORE_DOVECOT_IMAGE="${RT_RESTORE_DOVECOT_IMAGE:-$(compose_image dovecot-mailcow)}"
export RT_RESTORE_TOOLS_IMAGE="${RT_RESTORE_TOOLS_IMAGE:-$(sed -n 's/^DEBIAN_DOCKER_IMAGE="\(.*\)"/\1/p' "$ROOT/helper-scripts/backup_and_restore.sh")}"

W=$(mktemp -d)
E2E=rt-e2e-$$
cleanup() {
  docker rm -f "$E2E-sql" "$E2E-redis" >/dev/null 2>&1 || true
  # Files the containers wrote belong to their users, so a container removes them
  docker run --rm -v "$W:/w" --entrypoint /bin/sh "$RT_RESTORE_TOOLS_IMAGE" -c 'rm -rf /w/* /w/.[!.]*' >/dev/null 2>&1 || true
  rm -rf "$W" 2>/dev/null || true
}
trap cleanup EXIT

# The backup: $W/mail/mailcow-<date>, archives with absolute paths like backup_and_restore.sh's
NAME=mailcow-2026-10-10-02-00-00
GOOD="$W/mail/$NAME"
BUILD="$W/build"
mkdir -p "$GOOD" "$BUILD"/{vmail,crypt,other-crypt,redis,rspamd,postfix}
chmod 777 "$W/mail" "$GOOD"
# pack NAME DIR [BACKUP]: DIR becomes /NAME in backup_NAME.tar.zst
pack() {
  docker run --rm -v "$2:/$1:ro" -v "${3:-$GOOD}:/backup" --entrypoint /bin/sh "$RT_RESTORE_TOOLS_IMAGE" \
    -c "tar --use-compress-program=zstd -Pcpf /backup/backup_$1.tar.zst /$1"
}

echo "Building a backup"

# ---- database
docker run -d --name "$E2E-sql" -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=mailcow \
  -v "$GOOD:/backup" "$RT_RESTORE_SQL_IMAGE" >/dev/null
for i in $(seq 1 120); do
  docker logs "$E2E-sql" 2>&1 | grep -q 'init process done' && docker exec "$E2E-sql" mariadb-admin -uroot -proot ping >/dev/null 2>&1 && break
  [ "$i" = 120 ] && { docker logs "$E2E-sql" | tail -n 20; echo "MariaDB did not start"; exit 1; }
  sleep 1
done
docker exec -i "$E2E-sql" mariadb -uroot -proot mailcow <<'SQL'
CREATE TABLE domain (domain VARCHAR(255) PRIMARY KEY, created DATETIME NOT NULL DEFAULT NOW(), active TINYINT(1) NOT NULL DEFAULT 1);
CREATE TABLE mailbox (username VARCHAR(255) PRIMARY KEY, local_part VARCHAR(255) NOT NULL, domain VARCHAR(255) NOT NULL,
  created DATETIME NOT NULL DEFAULT NOW(), active TINYINT(1) NOT NULL DEFAULT 1);
CREATE TABLE alias (id INT AUTO_INCREMENT PRIMARY KEY, address VARCHAR(255) NOT NULL, goto TEXT NOT NULL,
  domain VARCHAR(255) NOT NULL, created DATETIME NOT NULL DEFAULT NOW());
INSERT INTO domain (domain, created) VALUES ('example.com', '2026-01-05 10:00:00'), ('example.net', '2026-02-01 09:00:00');
INSERT INTO mailbox (username, local_part, domain, created) VALUES
  ('bibek@example.com', 'bibek', 'example.com', '2026-01-05 10:05:00'),
  ('sita@example.com', 'sita', 'example.com', '2026-01-06 11:00:00'),
  ('ram@example.net', 'ram', 'example.net', '2026-02-01 09:10:00');
INSERT INTO alias (address, goto, domain) VALUES ('bibek@example.com', 'bibek@example.com', 'example.com'),
  ('sita@example.com', 'sita@example.com', 'example.com'), ('ram@example.net', 'ram@example.net', 'example.net'),
  ('info@example.com', 'bibek@example.com,sita@example.com', 'example.com');
SQL
docker exec "$E2E-sql" sh -c 'mariadb-backup --user=root --password=root --backup --target-dir=/backup_mariadb >/dev/null 2>&1 &&
  mariadb-backup --prepare --target-dir=/backup_mariadb >/dev/null 2>&1 &&
  chown -R 999:999 /backup_mariadb &&
  tar --use-compress-program=zstd -Pcpf /backup/backup_mariadb.tar.zst /backup_mariadb'
docker rm -f "$E2E-sql" >/dev/null

# ---- mail: Dovecot set up like mailcow's (zlib + mail_crypt, global keys, Maildir in ~)
cat > "$BUILD/dovecot.conf" <<'CONF'
protocols =
ssl = no
log_path = /dev/stderr
mail_home = /vmail/%d/%n
mail_location = maildir:~/
mail_plugins = zlib mail_crypt
userdb {
  driver = static
  args = uid=5000 gid=5000
}
passdb {
  driver = static
  args = nopassword=y
}
plugin {
  mail_crypt_global_private_key = </crypt/ecprivkey.pem
  mail_crypt_global_public_key = </crypt/ecpubkey.pem
  mail_crypt_save_version = 2
  zlib_save = lz4
}
CONF
docker run --rm --network none -v "$BUILD:/build" -v "$BUILD/vmail:/vmail" -v "$BUILD/crypt:/crypt" \
  -v "$BUILD/other-crypt:/other" --entrypoint /bin/bash "$RT_RESTORE_DOVECOT_IMAGE" -c '
set -e
# The mailcow image (Alpine) has the vmail user already
if ! id vmail >/dev/null 2>&1; then
  if command -v useradd >/dev/null; then groupadd -g 5000 vmail && useradd -u 5000 -g 5000 -M -s /bin/false vmail
  else addgroup -g 5000 vmail && adduser -D -H -u 5000 -G vmail vmail; fi
fi
chown 5000:5000 /vmail
keys() {
  openssl ecparam -name prime256v1 -genkey | openssl pkey -out "$1/ecprivkey.pem"
  openssl pkey -in "$1/ecprivkey.pem" -pubout -out "$1/ecpubkey.pem"
  chmod 644 "$1"/*.pem
}
keys /crypt
keys /other
dovecot -c /build/dovecot.conf
sleep 1
msg() { printf "Return-Path: <%s>\r\nFrom: %s\r\nTo: %s\r\nSubject: %s\r\nDate: Fri, 09 Oct 2026 08:00:00 +0545\r\n\r\n%s\r\n" "$1" "$1" "$2" "$3" "$4"; }
msg sita@example.com bibek@example.com "Restore check" "Hello from the backup." | doveadm -c /build/dovecot.conf save -u bibek@example.com
msg ram@example.net bibek@example.com "Quarterly numbers" "$(head -c 20000 /dev/zero | tr "\0" x)" | doveadm -c /build/dovecot.conf save -u bibek@example.com
msg bibek@example.com sita@example.com "Lunch" "At one?" | doveadm -c /build/dovecot.conf save -u sita@example.com
doveadm -c /build/dovecot.conf mailbox create -u sita@example.com Sent
msg sita@example.com bibek@example.com "Re: Lunch" "Yes." | doveadm -c /build/dovecot.conf save -u sita@example.com -m Sent
msg bibek@example.com ram@example.net "Welcome" "Welcome aboard." | doveadm -c /build/dovecot.conf save -u ram@example.net
doveadm -c /build/dovecot.conf stop
' > "$W/dovecot.log" 2>&1 || { cat "$W/dovecot.log"; echo "Dovecot could not save the messages"; exit 1; }
pack vmail "$BUILD/vmail"
pack crypt "$BUILD/crypt"

# ---- redis: DKIM keys the way mailcow stores them; nokey/ lacks example.net's private key
docker run -d --name "$E2E-redis" --network none -v "$BUILD/redis:/data" "$RT_RESTORE_REDIS_IMAGE" \
  redis-server --dir /data --save '' --appendonly no >/dev/null
for i in $(seq 1 30); do
  [ "$(docker exec "$E2E-redis" redis-cli ping 2>/dev/null)" = PONG ] && break
  sleep 1
done
docker exec -i "$E2E-redis" sh -c 'mkdir -p /data/good /data/nokey
redis-cli HSET DKIM_PUB_KEYS example.com MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAcom example.net MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnet >/dev/null
redis-cli HSET DKIM_SELECTORS example.com dkim example.net dkim >/dev/null
redis-cli HSET DKIM_PRIV_KEYS dkim.example.com "-----BEGIN PRIVATE KEY-----com" dkim.example.net "-----BEGIN PRIVATE KEY-----net" >/dev/null
redis-cli SET RL_VALUE example 1 >/dev/null
redis-cli SAVE >/dev/null && cp /data/dump.rdb /data/good/dump.rdb
redis-cli HDEL DKIM_PRIV_KEYS dkim.example.net >/dev/null
redis-cli SAVE >/dev/null && cp /data/dump.rdb /data/nokey/dump.rdb
chmod -R a+rX /data'
docker rm -f "$E2E-redis" >/dev/null
pack redis "$BUILD/redis/good"

# ---- the rest
echo "spam stats" > "$BUILD/rspamd/stats.db"
echo "postfix queue" > "$BUILD/postfix/queue"
pack rspamd "$BUILD/rspamd"
pack postfix "$BUILD/postfix"
cat > "$GOOD/mailcow.conf" <<'CONF'
MAILCOW_HOSTNAME=mail.example.com
DBNAME=mailcow
DBUSER=mailcow
DBPASS=backup-db-pass
DBROOT=backup-db-root
CONF

# ---- the live server: what the fixture answers is in $W/live/<question>
mkdir -p "$W/live" "$W/app"
printf '%s\n' example.com example.net > "$W/live/domains"
printf '%s\n' bibek@example.com sita@example.com ram@example.net > "$W/live/mailboxes"
printf '%s\n' example.com/bibek example.com/sita example.net/ram > "$W/live/mail"
printf '%s\n' example.com example.net > "$W/live/dkim"
cat > "$W/live.sh" <<'LIVE'
#!/usr/bin/env bash
L=${E2E_LIVE:?}
echo "$*" >> "$L/asked"
case "$1:$2" in
  sql:*"FROM domain WHERE created <"*) cat "$L/domains" ;;
  sql:*"FROM mailbox WHERE created <"*) cat "$L/mailboxes" ;;
  redis:HKEYS) cat "$L/dkim" ;;
  mail:*) cat "$L/mail" ;;
  database_size:*) echo 52428800 ;;
  *) echo "unexpected question: $*" >&2; exit 1 ;;
esac
LIVE
chmod +x "$W/live.sh"

# restore [BACKUP] [VAR=value...]: the restore test with a fresh state folder
restore() {
  local backup=$1; shift
  rm -rf "$W/state" "$W/result.json"
  mkdir -p "$W/state"
  env APP_ROOT="$W" APP_DIR="$W/app" RT_BACKUP_STATE_DIR="$W/state" RT_BACKUP_DIR="$W/mail" \
    RT_RESTORE_REDIS_CMD="cat > '$W/result.json'" RT_RESTORE_LIVE_CMD="$W/live.sh" E2E_LIVE="$W/live" "$@" \
    bash "$SCRIPT" ${backup:+"$backup"} > "$W/out" 2>&1
}
result() { php -r '$r = json_decode(file_get_contents($argv[1]), true); echo json_encode(array_reduce(explode(".", $argv[2]), fn($v, $k) => $v[$k] ?? null, $r), JSON_UNESCAPED_SLASHES);' "$W/result.json" "$1"; }
detail() { php -r 'foreach (json_decode(file_get_contents($argv[1]), true)["checks"] as $c) if ($c["name"] === $argv[2]) echo ($c["ok"] ? "ok " : "FAIL ") . $c["detail"];' "$W/result.json" "$1"; }
leftovers() { { docker ps -aq --filter label=rabbittech.restore-test; docker volume ls -q --filter label=rabbittech.restore-test; } | wc -l; }
# variant NAME: a copy of the good backup to break
variant() {
  V="$W/variants/$1/$NAME"
  mkdir -p "$V" && chmod 777 "$V"
  cp "$GOOD"/* "$V/"
}
show() { sed 's/^/      /' "$W/out"; }

echo "A good backup"
restore "$GOOD" && code=0 || code=$?
show
check "passes" '[ "$code" = 0 ] && [ "$(result ok)" = true ] || { show; false; }'
check "runs all five checks" '[ "$(result checks | php -r "echo count(json_decode(stream_get_contents(STDIN)));")" = 5 ]'
check "config names the host" '[ "$(detail config)" = "ok mailcow.conf for mail.example.com" ]'
check "archives: all six read" '[ "$(detail archives)" = "ok 6 archives" ]'
check "database counts what MariaDB restored" '[ "$(detail database)" = "ok 2 domains, 3 mailboxes, 4 aliases" ]'
check "mail opens a message with the backup's keys" '[[ "$(detail mail)" == "ok 5 messages in 3 mailboxes; a message to "*"@example."*" opens with the backup'"'"'s keys" ]]'
check "dkim keys for both domains" '[ "$(detail dkim)" = "ok DKIM keys for 2 domains" ]'
check "names the backup and its time" '[ "$(result backup)" = "\"$NAME\"" ] && [ "$(result backup_time)" = "$(date -d "2026-10-10 02:00:00" +%s)" ]'
check "state file says passed" '[ "$(cut -d" " -f2,3 "$W/state/.last-restore-test")" = "1 $NAME" ]'
check "leaves no containers or volumes" '[ "$(leftovers)" = 0 ]'
check "asked the live server read-only questions" 'grep -q "^mail" "$W/live/asked" && grep -q "^redis HKEYS DKIM_PUB_KEYS" "$W/live/asked"'

echo "By hand, without a folder"
mkdir -p "$W/mail/mailcow-2026-10-11-02-00-00"
echo "1 1 $NAME" > "$W/state-last"
rm -rf "$W/state"; mkdir -p "$W/state"; cp "$W/state-last" "$W/state/.last-backup"
env APP_ROOT="$W" APP_DIR="$W/app" RT_BACKUP_STATE_DIR="$W/state" RT_BACKUP_DIR="$W/mail" RT_RESTORE_LIVE=off \
  RT_RESTORE_REDIS_CMD="cat > '$W/result.json'" bash "$SCRIPT" > "$W/out" 2>&1 && code=0 || code=$?
check "tests the last good backup, not a newer folder still being written" '[ "$code" = 0 ] && [ "$(result backup)" = "\"$NAME\"" ] || { show; false; }'
rmdir "$W/mail/mailcow-2026-10-11-02-00-00"

echo "Compared with the live server"
echo new@example.com >> "$W/live/mailboxes"
restore "$GOOD" || true
check "a mailbox the copy lacks fails the database check" '[ "$(detail database)" = "FAIL Mailboxes missing from the copy: new@example.com" ] && [ "$(result ok)" = false ]'
check "the error names it" '[ "$(result error)" = "\"database: Mailboxes missing from the copy: new@example.com\"" ]'
sed -i '/new@example.com/d' "$W/live/mailboxes"
echo example.net/ghost >> "$W/live/mail"
restore "$GOOD" || true
check "a mailbox with mail live but none in the backup fails the mail check" '[ "$(detail mail)" = "FAIL Mailboxes with mail but none in the backup: ghost@example.net" ]'
# The backup is from 2026-10-10 02:00; only mail a day older than that counts
since=$(( ($(date +%s) - $(date -d "2026-10-10 02:00:00" +%s)) / 60 + 1440 ))
check "asks only for mail a day older than the backup" 'grep -qE "^mail ($since|$((since - 1)))\$" "$W/live/asked"'
sed -i '/ghost/d' "$W/live/mail"
echo example.org >> "$W/live/dkim"
restore "$GOOD" || true
check "a DKIM key of a domain added after the backup is not asked for" '[ "$(result ok)" = true ]'
echo example.org >> "$W/live/domains"
restore "$GOOD" || true
check "a DKIM key the backup lacks fails the dkim check" '[ "$(detail dkim)" = "FAIL No DKIM key in the backup for example.org" ]'
sed -i '/example.org/d' "$W/live/dkim" "$W/live/domains"

echo "Broken backups"
variant damaged-db
head -c 2000 "$GOOD/backup_mariadb.tar.zst" > "$V/backup_mariadb.tar.zst"
restore "$V" || true
check "a cut-off database archive fails archives and database" '[ "$(detail archives)" = "FAIL Archives that can'"'"'t be read: mariadb (damaged)" ] && [ "$(detail database)" = "FAIL The database archive could not be unpacked" ]'
check "the error is the first failed check" '[[ "$(result error)" == "\"archives: "* ]]'
check "leaves no containers or volumes after a failure" '[ "$(leftovers)" = 0 ]'

variant damaged-mail
head -c "$(( $(stat -c %s "$GOOD/backup_vmail.tar.zst") / 2 ))" "$GOOD/backup_vmail.tar.zst" > "$V/backup_vmail.tar.zst"
restore "$V" || true
check "a cut-off mail archive fails the mail check" '[ "$(detail mail)" = "FAIL The mail archive is damaged (it can'"'"'t be read to the end)" ]'

variant other-keys
rm "$V/backup_crypt.tar.zst"
pack crypt "$BUILD/other-crypt" "$V"
restore "$V" || true
check "keys that don't match the mail fail the mail check" '[[ "$(detail mail)" == "FAIL A message to "*" does not open with the backup'"'"'s keys: "*"private key"* ]] || { show; false; }'

variant no-keys
rm "$V/backup_crypt.tar.zst"
pack crypt "$BUILD/rspamd" "$V"
restore "$V" || true
check "a crypt archive without keys fails the mail check" '[ "$(detail mail)" = "FAIL The backup has no mail encryption keys (crypt archive), so its mail can'"'"'t be opened" ]'

variant no-dkim
rm "$V/backup_redis.tar.zst"
pack redis "$BUILD/redis/nokey" "$V"
restore "$V" || true
check "a Redis copy without a private DKIM key fails the dkim check" '[ "$(detail dkim)" = "FAIL No DKIM key in the backup for example.net" ]'

variant no-rdb
rm "$V/backup_redis.tar.zst"
pack redis "$BUILD/postfix" "$V"
restore "$V" || true
check "a Redis archive without dump.rdb fails the dkim check" '[ "$(detail dkim)" = "FAIL The Redis archive has no dump.rdb" ]'

variant no-conf
rm "$V/mailcow.conf"
restore "$V" || true
check "a backup without mailcow.conf fails the config check" '[ "$(detail config)" = "FAIL The backup has no mailcow.conf" ]'

echo "Before anything is unpacked"
restore "$GOOD" RT_RESTORE_FREE_BYTES=1000 || true
check "too little disk space stops the test" '[[ "$(result error)" == "\"Not enough disk space for a restore test: about 260 MiB needed, 0 MiB free\"" ]] && [ "$(result checks | php -r "echo count(json_decode(stream_get_contents(STDIN)));")" = 1 ]'
restore "$W/nowhere" || true
check "a missing folder fails" '[ "$(result error)" = "\"Backup folder not found: '"$W"'/nowhere\"" ]'
check "leaves no containers or volumes at the end" '[ "$(leftovers)" = 0 ]'

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
