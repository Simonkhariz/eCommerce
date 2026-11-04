#!/usr/bin/env bash
# One-time setup of a fresh Oracle Cloud "Always Free" Ubuntu 24.04 server for Shop.co.
# Everything runs on this one server: nginx (https) -> Next.js storefront (127.0.0.1:3000)
# -> PHP API (127.0.0.1:8080, never public) -> MariaDB. Pictures stay in Cloudflare R2.
#
#   sudo bash setup.sh <public ip> <code archive> [<database backup folder>]
#   e.g. sudo bash setup.sh 129.151.10.20 ~/shopco.tar.gz ~/backup/2026-11-02_093000
#
# The code archive and the backup folder are uploaded by upload.ps1 on your PC (README.md).
# With a backup folder, your shop's database (products, settings, admin accounts) is copied in.
# Without one, the database starts empty and the first administrator is created through an SSH
# tunnel (README.md): the public site never offers the setup page.
#
# Safe to run again: steps already done are kept (the database password and secrets are not
# changed, an existing database is never overwritten).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash $0 ..."; exit 1; fi
IP="${1:-}"; ARCHIVE="${2:-}"; BACKUP="${3:-}"
if ! [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: sudo bash $0 <public ip> <code archive .tar.gz> [<database backup folder>]"; exit 1
fi
if [ -n "$BACKUP" ] && [ ! -f "$BACKUP/manifest.json" ]; then
  echo "$BACKUP is not a backup folder (no manifest.json)."; exit 1
fi

HOST="${IP//./-}.sslip.io"          # free fixed address, no domain needed
APP=/var/www/shopco
OWNER="${SUDO_USER:-ubuntu}"        # the login user owns the code; PHP (www-data) owns storage
HERE="$(cd "$(dirname "$0")" && pwd)"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a   # no questions from the package tools
step() { printf '\n==> %s\n' "$1"; }

step "System packages"
apt-get update -q
echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections
echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections
apt-get install -y -q nginx mariadb-server mariadb-client php-fpm php-cli php-mysql php-curl \
  php-mbstring php-xml certbot python3-certbot-nginx rsync curl ca-certificates \
  unattended-upgrades iptables-persistent
PHPV="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"
apt-get install -y -q "php${PHPV}-opcache"
dpkg-reconfigure -f noninteractive unattended-upgrades   # security updates install themselves

step "Node.js 22 (Ubuntu's own is too old for Next.js 16)"
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -q nodejs
fi
node --version

step "Swap (2 GB): room for the storefront build"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "Firewall: open web ports (Oracle's Ubuntu blocks everything but SSH)"
for port in 80 443; do
  iptables -C INPUT -p tcp -m state --state NEW --dport "$port" -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp -m state --state NEW --dport "$port" -j ACCEPT
done
netfilter-persistent save

step "PHP ${PHPV}: limits and OPcache"
for sapi in fpm cli; do
  cat > "/etc/php/${PHPV}/${sapi}/conf.d/99-shopco.ini" <<'INI'
; Shop.co (deploy/oracle/setup.sh). Pictures up to 5 MB; long admin actions up to 120 s.
upload_max_filesize = 8M
post_max_size = 10M
max_execution_time = 120
memory_limit = 256M
expose_php = Off
opcache.enable = 1
opcache.memory_consumption = 128
opcache.max_accelerated_files = 20000
; Code changes only through deploy.sh, which restarts PHP: no need to re-check files.
opcache.validate_timestamps = 0
INI
done
POOL="/etc/php/${PHPV}/fpm/pool.d/www.conf"
sed -i -E 's/^;?pm\.max_children = .*/pm.max_children = 12/; s/^;?request_terminate_timeout = .*/request_terminate_timeout = 130/' "$POOL"
grep -q '^request_terminate_timeout' "$POOL" || echo 'request_terminate_timeout = 130' >> "$POOL"

step "MariaDB: memory and character set"
# Plenty for a small shop's data. This limit is not what keeps the server out of Oracle's "idle"
# group: the pool only takes memory as data is read. The server's size does that (README step 8).
cat > /etc/mysql/mariadb.conf.d/99-shopco.cnf <<'CNF'
[mysqld]
bind-address = 127.0.0.1
innodb_buffer_pool_size = 256M
max_connections = 100
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
CNF
systemctl restart mariadb

step "Code"
mkdir -p "$APP"
SECRETS=/root/shopco-secrets
if [ ! -f "$SECRETS" ]; then
  # In a subshell: the tight umask must not apply to the files made later in this script.
  ( umask 077; printf 'DB_PASSWORD=%s\nREVALIDATE_SECRET=%s\n' "$(openssl rand -hex 18)" "$(openssl rand -hex 24)" > "$SECRETS" )
fi
# shellcheck disable=SC1090
. "$SECRETS"
bash "$HERE/deploy.sh" --code-only "$ARCHIVE"

step "Database"
mysql -e "CREATE DATABASE IF NOT EXISTS shopco CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
# Both names: the shop connects to 127.0.0.1, which MariaDB may or may not treat as "localhost".
for dbhost in localhost 127.0.0.1; do
  mysql -e "CREATE USER IF NOT EXISTS 'shopco'@'${dbhost}' IDENTIFIED BY '${DB_PASSWORD}'"
  mysql -e "ALTER USER 'shopco'@'${dbhost}' IDENTIFIED BY '${DB_PASSWORD}'"
  mysql -e "GRANT ALL PRIVILEGES ON shopco.* TO 'shopco'@'${dbhost}'"
done
mysql -e "FLUSH PRIVILEGES"

step "Settings (backend/.env and .env.local)"
ENV="$APP/backend/.env"
setenv() { # setenv FILE KEY VALUE: replace (or add) the KEY= line; the value is taken as-is
  KEY="$2" VAL="$3" awk 'BEGIN { k = ENVIRON["KEY"]; v = ENVIRON["VAL"] }
    index($0, k "=") == 1 { print k "=" v; done = 1; next } { print }
    END { if (!done) print k "=" v }' "$1" > "$1.new"
  cat "$1.new" > "$1" && rm -f "$1.new"   # keeps the file's owner and permissions
}
if [ ! -f "$ENV" ]; then
  cp "$APP/backend/.env.example" "$ENV"
  echo
  echo "Cloudflare R2 (the pictures). Use NEW keys made for this server (README step 4)."
  read -r -p "  R2 endpoint (https://<account id>.r2.cloudflarestorage.com): " S3_ENDPOINT
  read -r -p "  Bucket name [shopco-media]: " S3_BUCKET; S3_BUCKET="${S3_BUCKET:-shopco-media}"
  read -r -p "  Access Key ID: " S3_ACCESS_KEY_ID
  read -r -s -p "  Secret Access Key (hidden): " S3_SECRET_ACCESS_KEY; echo
  read -r -p "  Shop WhatsApp number for payments, e.g. 2348012345678: " WHATSAPP
  for kv in "APP_ENV=production" "APP_DEBUG=false" "APP_URL=https://${HOST}" "FRONTEND_URL=https://${HOST}" \
            "CORS_ALLOWED_ORIGINS=https://${HOST}" "TRUSTED_PROXIES=127.0.0.1,::1" \
            "DB_HOST=127.0.0.1" "DB_PORT=3306" "DB_DATABASE=shopco" "DB_USERNAME=shopco" "DB_PASSWORD=${DB_PASSWORD}" \
            "STORE_WHATSAPP_PHONE=${WHATSAPP}" "PAYMENT_WHATSAPP_ENABLED=true" \
            "PAYMENT_MONNIFY_ENABLED=false" "PAYMENT_KORA_ENABLED=false" \
            "STORAGE_DRIVER=s3" "S3_ENDPOINT=${S3_ENDPOINT}" "S3_REGION=auto" "S3_BUCKET=${S3_BUCKET}" \
            "S3_ACCESS_KEY_ID=${S3_ACCESS_KEY_ID}" "S3_SECRET_ACCESS_KEY=${S3_SECRET_ACCESS_KEY}" \
            "BACKUP_S3_PREFIX=backups/" "MAIL_MAILER=log" "SSE_ENABLED=false" \
            "STOREFRONT_REVALIDATE_URL=http://127.0.0.1:3000/api/revalidate" "REVALIDATE_SECRET=${REVALIDATE_SECRET}"; do
    setenv "$ENV" "${kv%%=*}" "${kv#*=}"
  done
  echo "  Saved. Change any of it later in $ENV, then: sudo systemctl restart php${PHPV}-fpm"
fi
chown root:www-data "$ENV"; chmod 640 "$ENV"
WEBENV="$APP/.env.local"
if [ ! -f "$WEBENV" ]; then
  printf 'BACKEND_ORIGIN=http://127.0.0.1:8080\nREVALIDATE_SECRET=%s\n' "$REVALIDATE_SECRET" > "$WEBENV"
fi
chown "$OWNER":"$OWNER" "$WEBENV"; chmod 600 "$WEBENV"

TABLES="$(mysql -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='shopco'")"
if [ "$TABLES" != "0" ]; then
  if [ -n "$BACKUP" ]; then echo "The database already has tables: the backup was NOT loaded (nothing is ever overwritten)."; fi
elif [ -n "$BACKUP" ]; then
  step "Copying your shop's database from $BACKUP"
  php "$APP/backend/scripts/restore_database.php" --backup="$BACKUP" --database=shopco
else
  step "New empty database: tables and the sample catalogue"
  php "$APP/backend/migrations/migrate.php"
  php "$APP/backend/seeds/seed.php"
fi

step "Web server (nginx) for https://${HOST}"
sed -e "s|__HOST__|${HOST}|g" -e "s|__PHPV__|${PHPV}|g" -e "s|__APP__|${APP}|g" \
  "$HERE/nginx-shopco.conf" > /etc/nginx/sites-available/shopco
ln -sf /etc/nginx/sites-available/shopco /etc/nginx/sites-enabled/shopco
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

step "Storefront service (starts on boot, restarts if it stops)"
sed -e "s|__OWNER__|${OWNER}|g" -e "s|__APP__|${APP}|g" "$HERE/shopco-web.service" > /etc/systemd/system/shopco-web.service
systemctl daemon-reload
systemctl enable shopco-web

step "Scheduled jobs (emails, unpaid orders, database check, nightly backup to R2)"
sed -e "s|__APP__|${APP}|g" "$HERE/shopco.cron" > /etc/cron.d/shopco
chmod 644 /etc/cron.d/shopco

step "Build, migrate and start"
bash "$HERE/deploy.sh" --skip-code

step "HTTPS certificate (Let's Encrypt, renews itself)"
# Also on re-runs: the nginx file above was rewritten, so the existing certificate is put back.
CERT=ok
certbot --nginx -d "$HOST" --redirect --keep-until-expiring --agree-tos --register-unsafely-without-email --non-interactive || CERT=failed

step "First backup, copied to R2 (this also proves the backup job and the R2 keys work)"
BACKUPS=ok
sudo -u www-data php "$APP/backend/scripts/backup.php" \
  && sudo -u www-data php "$APP/backend/scripts/backup_to_bucket.php" || BACKUPS=failed

echo
if [ "$CERT" = ok ]; then
  printf 'The shop: https://%s   (admin: https://%s/admin)\n' "$HOST" "$HOST"
else
  echo "NOT READY: the https certificate failed. Check that ports 80 and 443 are open in Oracle's"
  echo "security list (README step 3), then run this script again. Sign-in needs https."
fi
if [ "$BACKUPS" != ok ]; then
  echo "PROBLEM: the backup or its copy to R2 failed (message above). Check the R2 keys in $ENV."
fi
free -m | awk '/Mem:/ { pct = $3 * 100 / $2; printf "Memory in use: %d of %d MB (%.0f%%). Oracle treats under 20%% as idle; see README step 8.\n", $3, $2, pct }'
