#!/usr/bin/env bash
# Put a new version of Shop.co live on the server (used by setup.sh, and for every update).
#
#   sudo bash /var/www/shopco/deploy/oracle/deploy.sh ~/shopco.tar.gz
#
# 1. Unpacks the code archive made by upload.ps1 into /var/www/shopco. Never touched: the
#    settings (backend/.env, .env.local) and backend/storage (logs, cache, backups).
# 2. Database changes (migrations), storefront build, then restarts PHP and the storefront.
# 3. Checks that both answer. Pages can fail while the storefront is being rebuilt (a few minutes
#    on this server), so don't update during a client demo.
#
# Options used by setup.sh: --code-only (step 1 only), --skip-code (steps 2-3 only).
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo bash $0 <code archive>"; exit 1; fi
MODE=all; ARCHIVE=""
for arg in "$@"; do
  case "$arg" in
    --code-only) MODE=code ;;
    --skip-code) MODE=build ;;
    *) ARCHIVE="$arg" ;;
  esac
done
APP=/var/www/shopco
OWNER="${SUDO_USER:-ubuntu}"
PHPV="$(php -r 'echo PHP_MAJOR_VERSION.".".PHP_MINOR_VERSION;')"

if [ "$MODE" != build ]; then
  if [ ! -f "$ARCHIVE" ]; then echo "Usage: sudo bash $0 <code archive .tar.gz>"; exit 1; fi
  echo "==> Unpacking $(basename "$ARCHIVE")"
  NEW="$(mktemp -d)"
  tar -xzf "$ARCHIVE" -C "$NEW"
  if [ ! -f "$NEW/package.json" ] || [ ! -f "$NEW/backend/public/index.php" ]; then
    rm -rf "$NEW"; echo "$ARCHIVE is not a Shop.co code archive."; exit 1
  fi
  mkdir -p "$APP"
  # --delete removes files that the new version no longer has, except what lives only here.
  rsync -a --delete \
    --exclude '/backend/.env' --exclude '/backend/.env.testing' --exclude '/.env.local' \
    --exclude '/backend/storage/' --exclude '/backend/public/uploads/' \
    --exclude '/node_modules/' --exclude '/.next/' \
    "$NEW"/ "$APP"/
  if [ ! -d "$APP/backend/storage" ]; then cp -a "$NEW/backend/storage" "$APP/backend/storage"; fi
  rm -rf "$NEW"
  mkdir -p "$APP/backend/storage/logs" "$APP/backend/storage/cache" "$APP/backend/storage/backups"
  chown -R "$OWNER":"$OWNER" "$APP"
  chown -R www-data:www-data "$APP/backend/storage"
  if [ -f "$APP/backend/.env" ]; then chown root:www-data "$APP/backend/.env"; chmod 640 "$APP/backend/.env"; fi
fi
[ "$MODE" = code ] && exit 0

echo "==> Database changes"
php "$APP/backend/migrations/migrate.php"
chown -R www-data:www-data "$APP/backend/storage"   # files written by the step above as root

echo "==> Storefront build (a few minutes)"
systemctl restart "php${PHPV}-fpm"   # the build reads the shop's data through the API
sudo -H -u "$OWNER" bash -c "cd '$APP' && npm ci --no-audit --no-fund && npm run build"

echo "==> Restarting"
systemctl restart shopco-web
ok=0
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:8080/api/v1/health && curl -fsS -o /dev/null http://127.0.0.1:3000/; then ok=1; break; fi
  sleep 2
done
if [ "$ok" = 1 ]; then
  echo "==> Live: the API and the storefront both answer."
else
  echo "==> The shop did not answer within a minute. See: journalctl -u shopco-web -n 50   and   $APP/backend/storage/logs/"
  exit 1
fi
