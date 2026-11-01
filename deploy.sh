#!/usr/bin/env bash
# Deploys Slotwise to your own server over SSH: build locally, upload a new release, migrate, switch, reload.
# Rolls back to the previous release if the health check fails. Works on macOS and Linux/WSL.
#
# Server details are never stored in the repo. Put them in ./deploy.env (gitignored) or the environment:
#   REMOTE=my-server            # an SSH host or alias from ~/.ssh/config
#   APP_DIR=/srv/slotwise       # where releases live on the server
#   DOMAIN=booking.example.com  # public hostname, used for the health check
#   DB_NAME=slotwise            # optional, defaults to "slotwise"
#   DEPLOY_AS=slotwise          # optional: when REMOTE logs in as root, run every server step as this user
#   API_URL=http://127.0.0.1:4130  # the server's API address; Next.js bakes its /api rewrite in at build time
# Before the first deploy, create $APP_DIR/shared/.env on the server and set Redis to `noeviction` + AOF.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f deploy.env ] && . ./deploy.env

: "${REMOTE:?Set REMOTE in deploy.env (see the top of deploy.sh)}"
: "${APP_DIR:?Set APP_DIR in deploy.env (see the top of deploy.sh)}"
: "${DOMAIN:?Set DOMAIN in deploy.env (see the top of deploy.sh)}"
DB_NAME="${DB_NAME:-slotwise}"
: "${API_URL:?Set API_URL in deploy.env (the API address on the server, e.g. http://127.0.0.1:4130)}"
export API_URL
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

RELEASE="$(date -u +%Y%m%d%H%M%S)"

# Runs a script from stdin on the server (as DEPLOY_AS when set), passing the remaining arguments to it.
remote() {
  local args cmd
  args="$(printf '%q ' "$@")"
  cmd="bash -s -- $args"
  if [ -n "${DEPLOY_AS:-}" ]; then
    cmd="su - $DEPLOY_AS -c $(printf '%q' "$cmd")"
  fi
  ssh "$REMOTE" "$cmd"
}
CHOWN=()
[ -n "${DEPLOY_AS:-}" ] && CHOWN=(--chown="$DEPLOY_AS:$DEPLOY_AS")

echo "▸ Building locally (never on the server)"
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build

echo "▸ Uploading release $RELEASE"
remote "$APP_DIR" "$RELEASE" <<'MKDIR'
mkdir -p "$1/releases/$2" "$1/shared" "$1/backups"
MKDIR
rsync -az --delete "${CHOWN[@]}" \
  --exclude '.git' --exclude 'node_modules' --exclude '.env' --exclude '.env.*' --exclude 'tmp/' \
  --exclude '.turbo' --exclude 'apps/web/.next/cache' --exclude 'CLAUDE.md' --exclude 'PRD.md' --exclude 'deploy.env' --exclude 'plan.md' \
  ./ "$REMOTE:$APP_DIR/releases/$RELEASE/"

echo "▸ Installing, migrating and switching on the server"
remote "$APP_DIR" "$RELEASE" "$DB_NAME" "$KEEP_RELEASES" "$KEEP_DUMPS" <<'REMOTE_SCRIPT'
set -euo pipefail
APP_DIR="$1"; RELEASE="$2"; DB_NAME="$3"; KEEP_RELEASES="$4"; KEEP_DUMPS="$5"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh"
command -v pnpm >/dev/null || pnpm() { corepack pnpm "$@"; }
cd "$APP_DIR/releases/$RELEASE"
ln -sfn "$APP_DIR/shared/.env" .env
pnpm install --prod --frozen-lockfile

# Dump the live database before any pending migration (keep the last few dumps).
if ! pnpm --filter @slotwise/api exec prisma migrate status >/dev/null 2>&1; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/shared/.env" | cut -d= -f2- | tr -d '"')"
  pg_dump "$DATABASE_URL" | gzip > "$APP_DIR/backups/$DB_NAME-$RELEASE.sql.gz"
  ls -1t "$APP_DIR/backups/"*.sql.gz | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm --
fi
pnpm --filter @slotwise/api exec prisma migrate deploy

PREVIOUS="$(readlink "$APP_DIR/current" || true)"
echo "$PREVIOUS" > "$APP_DIR/previous-release"
ln -sfn "$APP_DIR/releases/$RELEASE" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
# Delete + start (not reload): PM2 keeps the resolved release path, so a reload would run the old code.
cd "$APP_DIR/current"
pm2 delete ecosystem.config.cjs >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs
pm2 save >/dev/null

# Old releases (never the current or previous one).
ls -1dt "$APP_DIR/releases/"*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf --
REMOTE_SCRIPT

echo "▸ Checking https://$DOMAIN"
# The API needs a few seconds to boot; until then the web app's /api proxy answers 500. Wait up to 30 s.
for _ in $(seq 1 15); do
  sleep 2
  web=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/")
  health=$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/health")
  [ "$web" = "200" ] && [ "$health" = "200" ] && break
done
if [ "$web" = "200" ] && [ "$health" = "200" ]; then
  echo "✓ Deployed $RELEASE — https://$DOMAIN is up (web $web, health $health)"
else
  echo "✗ Check failed (web $web, health $health) — rolling back"
  remote "$APP_DIR" <<'ROLLBACK'
set -euo pipefail
APP_DIR="$1"
PREVIOUS="$(cat "$APP_DIR/previous-release")"
[ -n "$PREVIOUS" ] || { echo "no previous release to roll back to"; exit 1; }
ln -sfn "$PREVIOUS" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
cd "$APP_DIR/current" && { pm2 delete ecosystem.config.cjs >/dev/null 2>&1 || true; pm2 start ecosystem.config.cjs; pm2 save >/dev/null; }
ROLLBACK
  exit 1
fi
