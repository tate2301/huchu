#!/usr/bin/env bash
#
# Prove that a production database can be built from the migration history.
#
# Until S-3.2 this was not true, and nobody knew: every migration in this
# project had been applied to the dev database by hand with psql, and the dev
# database itself was built by `prisma db push`. The history had never once
# been replayed from empty, so it had quietly stopped working — forty tables
# were missing from it, and the first person to find out would have been
# whoever provisioned the first real school.
#
# Run this whenever a migration is added. It builds a throwaway database from
# nothing but prisma/migrations, then asserts the result matches
# prisma/schema.prisma in BOTH directions. The second check is the one that
# matters: a deploy that succeeds into the wrong schema has fixed nothing.
#
#   PGUSER=huchu PGPASSWORD=… ./scripts/verify-migration-replay.sh
#
# Connection details are read from the standard libpq environment variables, so
# if psql already reaches your database this script does too.
#
# Needs a Postgres role that may CREATE DATABASE. If yours may not — the dev
# role here cannot — set SCRATCH_ADMIN to a superuser wrapper:
#
#   SCRATCH_ADMIN='su postgres -c' PGUSER=huchu PGPASSWORD=… \
#     ./scripts/verify-migration-replay.sh
#
set -euo pipefail

DB_NAME="${SCRATCH_DB:-huchu_migration_replay_$$}"

# Connection details come from the standard libpq variables — PGHOST, PGPORT,
# PGUSER, PGPASSWORD — or from .pgpass, so this script carries no credentials
# of its own. Only the database name is ours; everything else is wherever your
# psql already points.
HOST="${PGHOST:-localhost}"
PORT="${PGPORT:-5432}"
USER="${PGUSER:-$(id -un)}"
if [ -n "${PGPASSWORD:-}" ]; then
  SCRATCH_URL="postgresql://${USER}:${PGPASSWORD}@${HOST}:${PORT}/${DB_NAME}"
else
  SCRATCH_URL="postgresql://${USER}@${HOST}:${PORT}/${DB_NAME}"
fi

admin() {
  if [ -n "${SCRATCH_ADMIN:-}" ]; then
    # The admin wrapper is a different role by definition, so it must not
    # inherit the connection identity the replay itself uses — `su postgres`
    # carrying PGUSER=huchu fails peer authentication.
    $SCRATCH_ADMIN "env -u PGUSER -u PGPASSWORD $1"
  else
    eval "$1"
  fi
}

cleanup() {
  admin "dropdb --if-exists ${DB_NAME}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "==> Building ${DB_NAME} from prisma/migrations alone"
admin "dropdb --if-exists ${DB_NAME}" >/dev/null 2>&1 || true
admin "createdb ${DB_NAME}"
if [ -n "${SCRATCH_ADMIN:-}" ]; then
  admin "psql -q -c 'GRANT ALL ON DATABASE ${DB_NAME} TO ${USER}'"
fi

DATABASE_URL="$SCRATCH_URL" npx prisma migrate deploy

echo
echo "==> Asserting the result matches prisma/schema.prisma"

forward=$(DATABASE_URL="$SCRATCH_URL" npx prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --script 2>/dev/null |
  grep -v '^Loaded Prisma config' | grep -v '^\s*$' || true)

reverse=$(DATABASE_URL="$SCRATCH_URL" npx prisma migrate diff \
  --from-schema prisma/schema.prisma --to-config-datasource --script 2>/dev/null |
  grep -v '^Loaded Prisma config' | grep -v '^\s*$' || true)

status=0
for direction in forward reverse; do
  out="${!direction}"
  if [ "$out" = "-- This is an empty migration." ]; then
    echo "    ${direction}: clean"
  else
    echo "    ${direction}: DRIFT"
    echo "$out" | sed 's/^/      /'
    status=1
  fi
done

echo
if [ "$status" -eq 0 ]; then
  echo "PASS — the migration history builds this schema from empty."
else
  echo "FAIL — the migration history does not build prisma/schema.prisma."
  echo "Write a migration for the drift above rather than reaching for db push."
fi
exit "$status"
