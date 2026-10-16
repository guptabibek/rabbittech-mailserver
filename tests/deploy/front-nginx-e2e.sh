#!/usr/bin/env bash
# Runs the host nginx's mail site (deploy/nginx/mail-front.conf.template, rendered by
# scripts/front-nginx.sh) in real nginx, in front of a stub mailcow that echoes what reaches it.
# Both share one network namespace, as the host nginx and mailcow's published ports do. The
# image's own default site stays, standing in for the server's other sites.
# Run: bash tests/deploy/front-nginx-e2e.sh   (needs Docker; RT_E2E_NGINX_IMAGE picks the image)
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
IMAGE="${RT_E2E_NGINX_IMAGE:-nginx:1.24-alpine}"
E2E="rt-front-e2e-$$"
W=$(mktemp -d)
cleanup() {
  docker rm -f "$E2E-front" "$E2E-stub" >/dev/null 2>&1 || true
  rm -rf -- "${W:?}"
}
trap cleanup EXIT
failures=0 passed=0
check() {
  if eval "$2"; then
    passed=$((passed + 1)); echo "  ok   $1"
  else
    failures=$((failures + 1)); echo "  FAIL $1"
    [ -f "$W/out" ] && head -c 600 "$W/out" | sed 's/^/         | /'
  fi
}

H=mail.rabbittech.com.np
APP="$W/app"
mkdir -p "$APP/data/assets/ssl" "$W/stub" "$W/front"
cat > "$APP/mailcow.conf" <<CONF
MAILCOW_HOSTNAME=$H
HTTP_BIND=127.0.0.1
HTTP_PORT=8088
HTTPS_BIND=127.0.0.1
HTTPS_PORT=8448
RT_FRONT_NGINX=y
CONF
# mailcow's certificate: the mail hostname and the names of the mail domains (a test CA signs it,
# so curl can check which certificate the front serves)
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=Test CA" -keyout "$W/ca.key" -out "$W/ca.pem" 2>/dev/null
openssl req -newkey rsa:2048 -nodes -subj "/CN=$H" -keyout "$APP/data/assets/ssl/key.pem" -out "$W/cert.csr" 2>/dev/null
printf 'subjectAltName=DNS:%s,DNS:mta-sts.rabbittech.com.np,DNS:autodiscover.rabbittech.com.np,DNS:mta-sts.shop.example\n' "$H" > "$W/san.ext"
openssl x509 -req -in "$W/cert.csr" -CA "$W/ca.pem" -CAkey "$W/ca.key" -CAcreateserial -days 2 -extfile "$W/san.ext" -out "$APP/data/assets/ssl/cert.pem" 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=mailcow-stub" -keyout "$W/stub/key.pem" -out "$W/stub/cert.pem" 2>/dev/null
chmod 644 "$APP/data/assets/ssl/"*.pem "$W/stub/"*.pem "$W/ca.pem"

APP_DIR="$APP" bash "$ROOT/scripts/front-nginx.sh" render > "$W/front/mail.conf"
# Without IPv6 in the containers (some Docker hosts), nginx can't listen on [::]
if ! docker run --rm "$IMAGE" test -f /proc/net/if_inet6; then
  sed -i '/listen \[::\]/d' "$W/front/mail.conf"
  echo "(no IPv6 in containers here: the site's [::] listen lines are left out)"
fi

# The stub mailcow: HTTP on 8088 and HTTPS on 8448, answering with what it was sent. Uploads go
# through to a third server, so the whole body has to arrive.
cat > "$W/stub/stub.conf" <<'CONF'
server {
    listen 8088;
    location / { return 200 "stub http host=$host uri=$request_uri\n"; }
}
server {
    listen 8448 ssl;
    ssl_certificate /stub/cert.pem;
    ssl_certificate_key /stub/key.pem;
    client_max_body_size 0;
    location /upload {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header X-Length $content_length;
    }
    location / {
        return 200 "stub https host=$host sni=$ssl_server_name xff=$http_x_forwarded_for real=$http_x_real_ip proto=$http_x_forwarded_proto uri=$request_uri\n";
    }
}
server {
    listen 8090;
    client_max_body_size 0;
    location / { return 200 "received $http_x_length bytes\n"; }
}
CONF

: > "$W/stub/empty.conf"
# The stub drops the image's default site; the front keeps it
docker run -d --name "$E2E-stub" -v "$W/stub:/stub:ro" -v "$W/stub/stub.conf:/etc/nginx/conf.d/stub.conf:ro" \
  -v "$W/stub/empty.conf:/etc/nginx/conf.d/default.conf:ro" "$IMAGE" >/dev/null
# The front shares the stub's network, so 127.0.0.1:8088 and :8448 are "mailcow"
docker run -d --name "$E2E-front" --network "container:$E2E-stub" -v "$APP:$APP:ro" -v "$W/front/mail.conf:/etc/nginx/conf.d/mail.conf:ro" "$IMAGE" >/dev/null
for _ in $(seq 50); do docker exec "$E2E-front" sh -c 'nc -z 127.0.0.1 443 && nc -z 127.0.0.1 8448' 2>/dev/null && break; sleep 0.2; done
if [ "$(docker inspect -f '{{.State.Running}}' "$E2E-front")" != true ]; then
  docker logs "$E2E-front" 2>&1 | tail -n 5
  echo "The front nginx did not start"; exit 1
fi

# curl from inside the shared network: request(host, url, extra curl options…) prints the status
# code and body
request() {
  local host=$1 url=$2; shift 2
  docker cp "$W/ca.pem" "$E2E-stub:/tmp/ca.pem" >/dev/null 2>&1 || true
  docker exec "$E2E-stub" curl -s --cacert /tmp/ca.pem --resolve "$host:443:127.0.0.1" --resolve "$host:80:127.0.0.1" \
    -o /dev/stdout -w '\nstatus=%{http_code} location=%{redirect_url}\n' "$@" "$url" > "$W/out" 2>&1 || true
}

echo "Front nginx (real nginx, $IMAGE)"
docker exec "$E2E-front" nginx -t > "$W/out" 2>&1 && rc=0 || rc=$?
check "nginx -t accepts the site, with no warnings" '[ "$rc" = 0 ] && ! grep -q "\[warn\]" "$W/out"'

request "$H" "http://$H/sogo?x=1"
check "HTTP goes to HTTPS, keeping the path" 'grep -q "status=301 location=https://$H/sogo?x=1" "$W/out"'
request "$H" "http://$H/.well-known/acme-challenge/token123"
check "Let's Encrypt checks on HTTP reach mailcow's port 8088 directly" 'grep -q "stub http host=$H uri=/.well-known/acme-challenge/token123" "$W/out" && grep -q "status=200" "$W/out"'
request "mta-sts.shop.example" "http://mta-sts.shop.example/.well-known/acme-challenge/t"
check "... for the mail domains' names too" 'grep -q "stub http host=mta-sts.shop.example" "$W/out"'

request "$H" "https://$H/SOGo/so/" -H "X-Forwarded-For: 203.0.113.9"
check "HTTPS reaches mailcow on 8448 with the name in Host and SNI, and mailcow's certificate" 'grep -q "stub https host=$H sni=$H " "$W/out" && grep -q "status=200" "$W/out"'
check "the visitor's address and the scheme are passed on" 'grep -q "proto=https" "$W/out" && grep -Eq "xff=203.0.113.9, 127.0.0.1 real=127.0.0.1" "$W/out"'
request "mta-sts.shop.example" "https://mta-sts.shop.example/.well-known/mta-sts.txt"
check "an MTA-STS policy request for a mail domain reaches mailcow with its name (certificate checked)" 'grep -q "stub https host=mta-sts.shop.example sni=mta-sts.shop.example .*uri=/.well-known/mta-sts.txt" "$W/out"'
request "autodiscover.rabbittech.com.np" "https://autodiscover.rabbittech.com.np/autodiscover/autodiscover.xml"
check "autodiscover reaches mailcow too" 'grep -q "stub https host=autodiscover.rabbittech.com.np" "$W/out"'

head -c 20971520 /dev/zero > "$W/upload.bin"
docker cp "$W/upload.bin" "$E2E-stub:/tmp/upload.bin" >/dev/null
request "$H" "https://$H/upload" --data-binary @/tmp/upload.bin -H "Content-Type: application/octet-stream"
check "a 20 MB upload (a large attachment) gets through whole" 'grep -q "received 20971520 bytes" "$W/out"'

request "shop.example.com" "http://shop.example.com/"
check "other sites are untouched: an unrelated name still gets the default site" 'grep -q "Welcome to nginx" "$W/out"'

docker exec "$E2E-front" nginx -T 2>/dev/null > "$W/out"
check "ActiveSync requests may stay open for an hour (push)" 'awk "/location \\^~ \\/Microsoft-Server-ActiveSync/,/}/" "$W/out" | grep -q "proxy_read_timeout 3650;"'

echo
echo "$passed passed, $failures failed"
[ "$failures" -eq 0 ]
