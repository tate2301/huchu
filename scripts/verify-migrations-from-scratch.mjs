/**
 * Prove that `prisma/migrations` can build the schema from nothing.
 *
 *   pnpm verify:migrations
 *
 * ## Why this exists
 *
 * `20260820130000_script_applied_schema_catchup` was verified with
 * `prisma migrate diff --from-migrations --to-schema`, and its header records
 * the result: "the result is empty". That check is real but it compares **end
 * states**. It cannot see a migration that will not execute in order, because
 * it never executes anything.
 *
 * So this shipped, and went unnoticed for eleven days:
 *
 *   20260819090000_scope_trim_drop_dropped_module_schema
 *   ERROR: column "sourceType" does not exist
 *
 * `StockMovement."sourceType"` was added by script rather than by migration, so
 * the only migration that creates it is the catch-up — which sorts *after* the
 * migration referencing it. Every existing database already had the column from
 * the script, so every existing database was fine. Only a from-scratch build
 * failed: a new developer, CI, or a restore from migrations.
 *
 * ## What it checks
 *
 * Two things, and the first is the one that was missing:
 *
 *   1. **Every migration executes, in order, against an empty database.**
 *      Nothing else in the repo does this.
 *   2. **The result equals `schema.prisma`.** The end-state check, kept.
 *
 * It builds a throwaway database, runs both, and drops it again — pass or fail.
 */

import { spawnSync } from "node:child_process";

const KEEP = process.argv.includes("--keep");
const DB = "huchu_migration_verify";

const source = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!source) {
  console.error("Set DATABASE_URL_TEST (or DATABASE_URL) to a local server this may create a database on.");
  process.exit(1);
}

const admin = new URL(source);
const server = `${admin.hostname}:${admin.port || 5432}`;
if (!["localhost", "127.0.0.1", "::1"].includes(admin.hostname)) {
  console.error(`Refusing: ${server} is not local. This creates and drops a database.`);
  process.exit(1);
}

const target = new URL(source);
target.pathname = `/${DB}`;
const targetUrl = target.toString();

const adminUrl = new URL(source);
adminUrl.pathname = "/postgres";
adminUrl.username = process.env.E2E_ADMIN_USER ?? "postgres";
adminUrl.password = process.env.E2E_ADMIN_PASSWORD ?? "postgres";

const { Client } = await import("pg");

async function withAdmin(fn) {
  const client = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 8000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function recreate() {
  await withAdmin(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [DB],
    );
    await client.query(`DROP DATABASE IF EXISTS "${DB}"`);
    await client.query(`CREATE DATABASE "${DB}" OWNER "${decodeURIComponent(target.username)}"`);
  });
}

async function drop() {
  await withAdmin(async (client) => {
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()`,
      [DB],
    );
    await client.query(`DROP DATABASE IF EXISTS "${DB}"`);
  });
}

function run(args, label) {
  const result = spawnSync("npx", args, {
    env: { ...process.env, DATABASE_URL: targetUrl },
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ok: result.status === 0, output, label };
}

let failed = false;

console.log(`Building ${DB} on ${server} from ${"prisma/migrations"}…\n`);
await recreate();

try {
  /* 1 — every migration executes, in order, on an empty database */
  const deploy = run(["prisma", "migrate", "deploy"], "migrate deploy");
  if (deploy.ok) {
    const applied = (deploy.output.match(/Applying migration/g) ?? []).length;
    console.log(`  ✓ all ${applied} migrations applied in order`);
  } else {
    failed = true;
    console.log("  ✗ migrate deploy FAILED\n");
    console.log(
      deploy.output
        .split("\n")
        .filter((line) => /Error|ERROR|Migration name|error code|Applying migration/.test(line))
        .slice(-12)
        .map((line) => `      ${line.trim()}`)
        .join("\n"),
    );
  }

  /* 2 — and the result is the schema */
  if (!failed) {
    const diff = run(
      ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"],
      "migrate diff",
    );
    if (diff.ok) {
      console.log("  ✓ result matches prisma/schema.prisma");
    } else {
      failed = true;
      console.log("  ✗ the built schema DIFFERS from prisma/schema.prisma\n");
      console.log(
        diff.output
          .split("\n")
          .filter(Boolean)
          .slice(-25)
          .map((line) => `      ${line}`)
          .join("\n"),
      );
    }
  }
} finally {
  if (KEEP) {
    console.log(`\n(kept ${DB} — --keep)`);
  } else {
    await drop();
  }
}

console.log(
  failed
    ? "\nprisma/migrations cannot rebuild the schema. See docs/testing/e2e-plan-2026-09-01.md §10."
    : "\nprisma/migrations rebuilds the schema from nothing. ✓",
);
process.exit(failed ? 1 : 0);
