#!/usr/bin/env bash
# The migration history and the split schema must describe the same database.
#
# Runs against the database DATABASE_URL points at, which must be a scratch
# database this script is free to migrate (CI uses a throwaway service
# container). It applies every migration, then diffs the resulting database
# against prisma/schema/: any output is drift, and the exit code says so.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm exec prisma migrate deploy
pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema --script --exit-code
echo "schema and migrations agree"
