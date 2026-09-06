#!/usr/bin/env bash
# Provision a fresh Ubuntu host to run Corelith (huchu) against the shared
# Vercel/Neon environment.
#
# Steps, in order:
#   1. Install Node 22 (NodeSource), pnpm, git.
#   2. Clone (or update) the repo at $BRANCH into $APP_DIR.
#   3. Install dependencies.
#   4. Install the Vercel CLI and pull env vars into .env
#      ($VERCEL_TOKEN makes this non-interactive; otherwise `vercel login`
#      prompts in the terminal).
#   5. prisma generate + prisma db push (schema sync — additive changes only;
#      the script stops if Prisma reports destructive changes).
#   6. Sync the commercial feature catalog into the DB.
#   7. Repair leaked mining-ops feature flags (idempotent backfill).
#   8. Seed the system document templates.
#
# Usage (as root on the server):
#   bash scripts/server-setup.sh
#   BRANCH=main bash scripts/server-setup.sh
#   VERCEL_TOKEN=xxxx bash scripts/server-setup.sh
#
# Re-running is safe: every step is idempotent.
set -euo pipefail

REPO_URL=${REPO_URL:-https://github.com/tate2301/huchu.git}
BRANCH=${BRANCH:-claude/workspace-feature-resolution-9dvi54}
APP_DIR=${APP_DIR:-/opt/huchu}
VERCEL_PROJECT=${VERCEL_PROJECT:-huchu}
VERCEL_SCOPE=${VERCEL_SCOPE:-christophers-projects-8a0fd708}
VERCEL_ENVIRONMENT=${VERCEL_ENVIRONMENT:-production}

log() { printf '\n[setup] %s\n' "$*"; }

log "1/8 base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y git curl ca-certificates build-essential

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  log "installing Node 22 (NodeSource)"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node --version

if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@10
fi
pnpm --version

log "2/8 repo checkout ($BRANCH)"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

log "3/8 dependencies"
pnpm install --frozen-lockfile

log "4/8 Vercel CLI + env pull"
if ! command -v vercel >/dev/null 2>&1; then
  npm install -g vercel@latest
fi
VC_ARGS=()
if [ -n "${VERCEL_TOKEN:-}" ]; then
  VC_ARGS+=(--token "$VERCEL_TOKEN")
else
  log "VERCEL_TOKEN not set — 'vercel login' will prompt (create a token at vercel.com/account/tokens for unattended runs)"
  vercel login
fi
vercel link --yes --project "$VERCEL_PROJECT" --scope "$VERCEL_SCOPE" "${VC_ARGS[@]}"
vercel env pull .env --environment "$VERCEL_ENVIRONMENT" --yes "${VC_ARGS[@]}"
if ! grep -q '^DATABASE_URL=' .env; then
  echo "[setup] ERROR: .env has no DATABASE_URL after vercel env pull — check the project/environment." >&2
  exit 1
fi

log "5/8 prisma generate + db push"
pnpm db:generate
pnpm db:push

log "6/8 sync commercial feature catalog"
npx tsx scripts/platform/sync-catalog.ts

log "7/8 repair mining-ops feature flags"
npx tsx scripts/backfill-mining-ops-feature-flags.ts --apply

log "8/8 seed system document templates"
npx tsx scripts/seed-document-templates.ts

log "done. Next steps:"
echo "  cd $APP_DIR"
echo "  pnpm build && pnpm start        # production server on :3000"
echo "  pnpm manage-platform --help     # platform ops CLI (templates, addons, tenants)"
