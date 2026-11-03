#!/usr/bin/env bash
# Deploys Slotwise to your own server over SSH: the server clones the pushed HEAD from GitHub into a new release,
# builds it there (so native packages match the server's CPU, e.g. ARM), migrates, switches and reloads.
# Rolls back to the previous release if the health check fails. Works from macOS and Linux/WSL
# (locally it only needs git and ssh).
#
#   ./deploy.sh          deploy the pushed HEAD
#   ./deploy.sh --seed   also load the demo business after switching (only when PUBLIC_DEMO=true on the server)
#
# Server details are never stored in the repo. Put them in ./deploy.env (gitignored) or the environment:
#   REMOTE=my-server            # an SSH host or alias from ~/.ssh/config
#   APP_DIR=/srv/slotwise       # where releases live on the server
#   DOMAIN=booking.example.com  # public hostname, checked after the deploy
#   DB_NAME=slotwise            # optional, defaults to "slotwise" (names the database dumps)
#   DEPLOY_AS=slotwise          # optional: when REMOTE logs in as root, run every server step as this user
#   API_URL=http://127.0.0.1:4130  # the server's API address; Next.js bakes its /api rewrite in at build time
#   BRANCH=main                 # optional, the branch the server clones
# Before the first deploy, create $APP_DIR/shared/.env on the server and set Redis to `noeviction` + AOF.
# The server needs git, Node 24, pnpm, PM2 and pg_dump.
set -euo pipefail

cd "$(dirname "$0")"
# shellcheck disable=SC1091
[ -f deploy.env ] && . ./deploy.env

: "${REMOTE:?Set REMOTE in deploy.env (see the top of deploy.sh)}"
: "${APP_DIR:?Set APP_DIR in deploy.env (see the top of deploy.sh)}"
: "${DOMAIN:?Set DOMAIN in deploy.env (see the top of deploy.sh)}"
DB_NAME="${DB_NAME:-slotwise}"
: "${API_URL:?Set API_URL in deploy.env (the API address on the server, e.g. http://127.0.0.1:4130)}"
BRANCH="${BRANCH:-main}"
KEEP_RELEASES=3
KEEP_DUMPS=5
# Public clone URL of this repo (the server needs no GitHub key).
REPO_URL="${REPO_URL:-$(git remote get-url origin | sed -E 's#^git@github.com:#https://github.com/#')}"

SEED=0
for a in "$@"; do
  case "$a" in
    --seed) SEED=1 ;;
    *) echo "Unknown option: $a" >&2; exit 1 ;;
  esac
done

# Node: nvm first, Homebrew only as a fallback (only git and ssh are used locally).
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use 24 >/dev/null 2>&1 || true
elif [ -x /opt/homebrew/bin/node ]; then
  export PATH="/opt/homebrew/bin:$PATH"
fi

[ -z "$(git status --porcelain)" ] || { echo "✗ Commit or stash your changes first: deploys are built from HEAD"; exit 1; }
git fetch -q origin "$BRANCH"
SHA="$(git rev-parse HEAD)"
[ "$SHA" = "$(git rev-parse "origin/$BRANCH")" ] || { echo "✗ HEAD is not origin/$BRANCH: push first (the server clones from GitHub)"; exit 1; }
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

echo "▸ Building ${SHA:0:7} on the server as release $RELEASE, migrating and switching"
remote "$APP_DIR" "$RELEASE" "$DB_NAME" "$KEEP_RELEASES" "$KEEP_DUMPS" "$REPO_URL" "$BRANCH" "$SHA" "$API_URL" "$SEED" <<'REMOTE_SCRIPT'
set -euo pipefail
APP_DIR="$1"; RELEASE="$2"; DB_NAME="$3"; KEEP_RELEASES="$4"; KEEP_DUMPS="$5"
REPO_URL="$6"; BRANCH="$7"; SHA="$8"; API_URL="$9"; SEED="${10}"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null
command -v pnpm >/dev/null || pnpm() { corepack pnpm "$@"; }
test -f "$APP_DIR/shared/.env" || { echo "✗ Missing $APP_DIR/shared/.env on the server" >&2; exit 1; }
mkdir -p "$APP_DIR/releases" "$APP_DIR/shared" "$APP_DIR/backups"
R="$APP_DIR/releases/$RELEASE"
ok=""
trap '[ -n "$ok" ] || rm -rf "$R"' EXIT
git clone -q --branch "$BRANCH" "$REPO_URL" "$R"
git -C "$R" checkout -q "$SHA"
cd "$R"
rm -rf .git PRD.md plan.md
export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0 NEXT_TELEMETRY_DISABLED=1
pnpm install --frozen-lockfile >/dev/null
# prisma generate reads DATABASE_URL from its config but never connects: a placeholder is enough to build.
API_URL="$API_URL" DATABASE_URL="postgresql://build:build@localhost:5432/build" pnpm build >/dev/null
# Next.js bakes the /api rewrite into the build: refuse to ship one that points anywhere else.
grep -q "$API_URL" apps/web/.next/routes-manifest.json || { echo "✗ The web build doesn't proxy /api to $API_URL"; exit 1; }
# Keep only production dependencies (Prisma's CLI stays: it is a production dependency of the API).
pnpm install --prod --frozen-lockfile >/dev/null
rm -rf apps/web/.next/cache .turbo
ln -sfn "$APP_DIR/shared/.env" .env

# Dump the live database before any pending migration (keep the last few dumps).
DATABASE_URL="$(grep -E '^DATABASE_URL=' "$APP_DIR/shared/.env" | cut -d= -f2- | tr -d '"')"
export DATABASE_URL
if ! pnpm --filter @slotwise/api exec prisma migrate status >/dev/null 2>&1; then
  pg_dump "$DATABASE_URL" | gzip > "$APP_DIR/backups/$DB_NAME-$RELEASE.sql.gz"
  ls -1t "$APP_DIR/backups/"*.sql.gz | tail -n +$((KEEP_DUMPS + 1)) | xargs -r rm --
fi
pnpm --filter @slotwise/api exec prisma migrate deploy
unset DATABASE_URL

PREVIOUS="$(readlink "$APP_DIR/current" || true)"
echo "$PREVIOUS" > "$APP_DIR/previous-release"
start() {
  ln -sfn "$1" "$APP_DIR/current.tmp" && mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
  # Delete + start (not reload): PM2 keeps the resolved release path, so a reload would run the old code.
  cd "$APP_DIR/current"
  pm2 delete ecosystem.config.cjs >/dev/null 2>&1 || true
  pm2 start ecosystem.config.cjs >/dev/null
  pm2 save >/dev/null
}
ok=1
start "$R"
if [ "$SEED" = 1 ]; then
  grep -q '^PUBLIC_DEMO=true' "$APP_DIR/shared/.env" || { echo "✗ --seed is only allowed when PUBLIC_DEMO=true" >&2; exit 1; }
  (cd "$APP_DIR/current/apps/api" && node --env-file=../../.env dist/demo/seed-cli.js)
fi

# The API needs a few seconds to boot; until then the web app's /api proxy answers 500. Wait up to 60 s.
WEB_PORT="$(grep -E '^WEB_PORT=' "$APP_DIR/shared/.env" | cut -d= -f2- | tr -d '"')"
web=000; health=000
for _ in $(seq 1 30); do
  sleep 2
  web=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/" || true)
  health=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/api/health" || true)
  [ "$web" = "200" ] && [ "$health" = "200" ] && break
done
if [ "$web" != "200" ] || [ "$health" != "200" ]; then
  echo "✗ Check failed (web $web, health $health)"
  if [ -n "$PREVIOUS" ]; then echo "  rolling back to $PREVIOUS"; start "$PREVIOUS"; fi
  exit 1
fi
echo "  server check: web $web, health $health"

# Old releases (never the current or previous one).
ls -1dt "$APP_DIR/releases/"*/ | tail -n +$((KEEP_RELEASES + 1)) | xargs -r rm -rf --
REMOTE_SCRIPT

echo "▸ Checking https://$DOMAIN"
web=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://$DOMAIN/" || true)
health=$(curl -s -o /dev/null -m 20 -w '%{http_code}' "https://$DOMAIN/api/health" || true)
if [ "$web" = "200" ] && [ "$health" = "200" ]; then
  echo "✓ Deployed $RELEASE — https://$DOMAIN is up (web $web, health $health)"
else
  echo "! Deployed $RELEASE and the server is healthy, but https://$DOMAIN answered web $web, health $health (DNS or TLS not pointing here yet?)"
fi
