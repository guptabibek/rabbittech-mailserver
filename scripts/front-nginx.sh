#!/usr/bin/env bash
# The host nginx's site for the mail server, when another nginx owns ports 80 and 443 and mailcow
# runs behind it (RT_FRONT_NGINX=y in mailcow.conf). The site comes from
# deploy/nginx/mail-front.conf.template; the root helper deploy/nginx/rabbittech-front-nginx
# installs it, checks it with "nginx -t" and puts the previous one back when it fails.
#
#   bash scripts/front-nginx.sh setup [deploy-user]   once, as root: installs the helper and lets
#                                                     the deploy user run it (and only it) with sudo
#   bash scripts/front-nginx.sh install               every deploy (scripts/deploy-vps.sh)
#   bash scripts/front-nginx.sh reload                cron: reloads nginx after mailcow renews
#                                                     its certificate
#   bash scripts/front-nginx.sh render                prints the site config
#
# tests/deploy/test-front-nginx.sh swaps in a fake helper, sudo and curl with RT_FRONT_HELPER,
# PATH and RT_FRONT_CHECK_ADDRESS.
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_DIR="${APP_DIR:-$REPO}"
HELPER="${RT_FRONT_HELPER:-/usr/local/sbin/rabbittech-front-nginx}"
TEMPLATE="$REPO/deploy/nginx/mail-front.conf.template"

fail() { echo "$*" >&2; exit 1; }

# Values from mailcow.conf, read without running the file
conf() {
  local value
  value=$(sed -n "s/^$1=//p" "$APP_DIR/mailcow.conf" 2>/dev/null | tail -n 1)
  value=${value%\"}; value=${value#\"}
  printf '%s' "${value:-${2:-}}"
}

# mailcow's port on this host: its bind address (any address means the local one) and port
upstream() {
  local bind port
  bind=$(conf "$1_BIND")
  port=$(conf "$1_PORT" "$2")
  case "$bind" in ''|0.0.0.0|'::'|'[::]') bind=127.0.0.1 ;; esac
  [[ "$port" =~ ^[0-9]+$ ]] || fail "$1_PORT in mailcow.conf is not a port number: $port"
  [[ "$bind" =~ ^[0-9.]+$ ]] || fail "$1_BIND in mailcow.conf is not an IPv4 address: $bind"
  printf '%s:%s' "$bind" "$port"
}

mail_host() {
  MAIL_HOST=$(conf MAILCOW_HOSTNAME | tr '[:upper:]' '[:lower:]')
  [[ "$MAIL_HOST" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || fail "MAILCOW_HOSTNAME in mailcow.conf is not a host name: $MAIL_HOST"
}

# Called after mail_host
render() {
  local http https
  http=$(upstream HTTP 80)
  https=$(upstream HTTPS 443)
  sed -e "s|@HOSTNAME@|$MAIL_HOST|g" -e "s|@HTTP_UPSTREAM@|$http|g" -e "s|@HTTPS_UPSTREAM@|$https|g" \
    -e "s|@CERT@|$APP_DIR/data/assets/ssl/cert.pem|g" -e "s|@KEY@|$APP_DIR/data/assets/ssl/key.pem|g" "$TEMPLATE"
}

# The helper runs as root: directly for root, otherwise with sudo (never asking for a password)
helper() {
  if [ "$(id -u)" = 0 ]; then "$HELPER" "$@"; else sudo -n "$HELPER" "$@"; fi
}

case "${1:-}" in
  render)
    mail_host
    render
    ;;

  setup)
    [ "$(id -u)" = 0 ] || fail "Run setup as root: sudo bash $0 setup ${2:-deploy}"
    user=${2:-deploy}
    id "$user" >/dev/null 2>&1 || fail "There is no user $user. Give the user the deploy logs in as (VPS_USER)."
    command -v nginx >/dev/null 2>&1 || fail "nginx is not installed on this server"
    install -m 755 -o root -g root "$REPO/deploy/nginx/rabbittech-front-nginx" "$HELPER"
    echo "Installed $HELPER"
    if [ "$user" != root ]; then
      rule=$(mktemp)
      printf '%s ALL=(root) NOPASSWD: %s\n' "$user" "$HELPER" > "$rule"
      visudo -cf "$rule" >/dev/null || { rm -f "$rule"; fail "visudo rejected the sudo rule"; }
      install -m 440 -o root -g root "$rule" /etc/sudoers.d/rabbittech-front-nginx
      rm -f "$rule"
      echo "$user may now run $HELPER with sudo, and nothing else"
    fi
    if [[ "$(conf RT_FRONT_NGINX n)" =~ ^[yY] ]]; then
      bash "$0" install
    else
      echo "Set RT_FRONT_NGINX=y in MAILCOW_ENV_FILE; the next deploy installs the nginx site."
    fi
    ;;

  install)
    [[ "$(conf RT_FRONT_NGINX n)" =~ ^[yY] ]] || exit 0
    if [ ! -x "$HELPER" ]; then
      fail "The nginx site for the mail server can't be installed: $HELPER is missing. Run once on the server, as root: bash $APP_DIR/scripts/front-nginx.sh setup $(id -un)"
    fi
    if ! cmp -s "$HELPER" "$REPO/deploy/nginx/rabbittech-front-nginx"; then
      echo "Note: $HELPER differs from this release's deploy/nginx/rabbittech-front-nginx. Run as root: bash $APP_DIR/scripts/front-nginx.sh setup $(id -un)" >&2
    fi
    mail_host
    site=$(render)
    rc=0
    printf '%s\n' "$site" | helper install "$MAIL_HOST" || rc=$?
    # 3: mailcow has no Let's Encrypt certificate yet, so the current site stays as it is
    [ "$rc" = 3 ] && exit 0
    [ "$rc" = 0 ] || fail "The nginx site for $MAIL_HOST was not changed (see above)."
    # The new site must reach mailcow; a 502 or no answer means it doesn't, so it goes back
    code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 --resolve "$MAIL_HOST:443:${RT_FRONT_CHECK_ADDRESS:-127.0.0.1}" "https://$MAIL_HOST/" || true)
    case "$code" in
      000|502|503|504)
        helper restore "$MAIL_HOST" || true
        fail "https://$MAIL_HOST/ answered ${code/000/nothing} through the new nginx site, so the previous site was put back."
        ;;
    esac
    ;;

  reload)
    # Cron, every 15 minutes: nginx reloads only when mailcow renewed its certificate
    [[ "$(conf RT_FRONT_NGINX n)" =~ ^[yY] ]] && [ -x "$HELPER" ] || exit 0
    helper reload-if-changed
    ;;

  *)
    echo "Usage: bash scripts/front-nginx.sh setup [deploy-user] | install | reload | render" >&2
    exit 2
    ;;
esac
