#!/usr/bin/env bash
set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/opt/rabbittech-mailserver}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root." >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates cron curl git rsync openssh-server ufw

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker

if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi

usermod -aG docker "$DEPLOY_USER"
mkdir -p "$APP_ROOT/app" "$APP_ROOT/releases" "$APP_ROOT/shared" "$APP_ROOT/backups"
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$APP_ROOT"
chmod 750 "$APP_ROOT" "$APP_ROOT/app" "$APP_ROOT/releases" "$APP_ROOT/shared"

ufw allow OpenSSH
ufw allow 25/tcp
ufw allow 80/tcp
ufw allow 110/tcp
ufw allow 143/tcp
ufw allow 443/tcp
ufw allow 465/tcp
ufw allow 587/tcp
ufw allow 993/tcp
ufw allow 995/tcp
ufw allow 4190/tcp

echo "Bootstrap complete."
echo "Install your GitHub Actions public deploy key into /home/$DEPLOY_USER/.ssh/authorized_keys."
echo "Then set GitHub secrets VPS_HOST, VPS_USER=$DEPLOY_USER, VPS_SSH_KEY, and MAILCOW_ENV_FILE."
echo "If another nginx on this server owns ports 80 and 443, also run (after the first deploy):"
echo "  bash $APP_ROOT/app/scripts/front-nginx.sh setup $DEPLOY_USER"
echo "and set RT_FRONT_NGINX=y in MAILCOW_ENV_FILE."
