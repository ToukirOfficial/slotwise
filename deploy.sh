#!/usr/bin/env bash
# Deploys Slotwise to the VPS (SSH alias "vps"): build locally, upload a new release, migrate, switch, reload.
# Rolls back to the previous release if the health check fails. Works on macOS and WSL.
#
# First deploy: confirm APP_DIR, DOMAIN and DB_NAME against ~/projects/SETUP.md (section 3), create
# $APP_DIR/shared/.env on the server, and check Redis is `noeviction` + AOF (PRD open question 3).
set -euo pipefail

REMOTE="${REMOTE:-vps}"
APP_DIR="${APP_DIR:-/home/slotwise/htdocs/slotwise}"      # CloudPanel site directory (confirm in SETUP.md)
DOMAIN="${DOMAIN:-slotwise.toukirahmedrony.com}"
DB_NAME="${DB_NAME:-slotwise}"
KEEP_RELEASES=3
KEEP_DUMPS=5

# Node: nvm first, Homebrew only as a fallback.
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || true
elif [ -x /opt/homebrew/bin/node ]; then
  export PATH="/opt/homebrew/bin:$PATH"
elif [ -x /usr/local/bin/node ]; then
  export PATH="/usr/local/bin:$PATH"
fi
command -v pnpm >/dev/null || { echo "pnpm not found"; exit 1; }

cd "$(dirname "$0")"
RELEASE="$(date -u +%Y%m%d%H%M%S)"

echo "▸ Building locally (never on the VPS)"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build

echo "▸ Uploading release $RELEASE"
ssh "$REMOTE" "mkdir -p '$APP_DIR/releases/$RELEASE' '$APP_DIR/shared' '$APP_DIR/backups'"
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude '.env.*' --exclude 'tmp/' \
  --exclude '.turbo' --exclude 'apps/web/.next/cache' --exclude 'CLAUDE.md' --exclude 'PRD.md' \
  ./ "$REMOTE:$APP_DIR/releases/$RELEASE/"

echo "▸ Installing, migrating and switching on the server"
ssh "$REMOTE" bash -s -- "$APP_DIR" "$RELEASE" "$DB_NAME" "$KEEP_RELEASES" "$KEEP_DUMPS" <<'REMOTE_SCRIPT'
set -euo pipefail
APP_DIR="$1"; RELEASE="$2"; DB_NAME="$3"; KEEP_RELEASES="$4"; KEEP_DUMPS="$5"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
cd "$APP_DIR/releases/$RELEASE"
ln -sfn "$APP_DIR/shared/.env" .env
pnpm install --prod --frozen-lockfile

# Dump the live database before any pending migration (keep the last few dumps).
if ! pnpm --filter @slotwise/api exec prisma migrate status >/dev/null 2>&1; then
  pg_dump "$DB_NAME" | gzip > "$APP_DIR/backups/$DB_NAME-$RELEASE.sql.gz"
  ls -1t "$APP_DIR/backups/"*.sql.gz | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm --
fi
pnpm --filter @slotwise/api exec prisma migrate deploy

PREVIOUS="$(readlink "$APP_DIR/current" || true)"
echo "$PREVIOUS" > "$APP_DIR/previous-release"
ln -sfn "$APP_DIR/releases/$RELEASE" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
cd "$APP_DIR/current"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save >/dev/null

# Old releases (never the current or previous one).
ls -1dt "$APP_DIR/releases/"*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf --
REMOTE_SCRIPT

echo "▸ Checking https://$DOMAIN"
sleep 3
web=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")
health=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health")
if [ "$web" = "200" ] && [ "$health" = "200" ]; then
  echo "✓ Deployed $RELEASE — https://$DOMAIN is up (web $web, health $health)"
else
  echo "✗ Check failed (web $web, health $health) — rolling back"
  ssh "$REMOTE" bash -s -- "$APP_DIR" <<'ROLLBACK'
set -euo pipefail
APP_DIR="$1"
PREVIOUS="$(cat "$APP_DIR/previous-release")"
[ -n "$PREVIOUS" ] || { echo "no previous release to roll back to"; exit 1; }
ln -sfn "$PREVIOUS" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
cd "$APP_DIR/current" && pm2 startOrReload ecosystem.config.cjs --update-env
ROLLBACK
  exit 1
fi
