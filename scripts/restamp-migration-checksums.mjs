/**
 * Re-record the checksum of a migration whose file was corrected after it was
 * applied.
 *
 *   node scripts/restamp-migration-checksums.mjs            # report only
 *   node scripts/restamp-migration-checksums.mjs --apply
 *
 * ## When you need this
 *
 * On 2026-09-01, `20260819090000_scope_trim_drop_dropped_module_schema` was
 * corrected: it referenced `StockMovement."sourceType"` a step before the
 * migration that creates the column, so `prisma migrate deploy` could not
 * rebuild the schema from scratch. Fixing it meant editing a file that every
 * existing database had already applied.
 *
 * Prisma records a SHA-256 of each migration file in `_prisma_migrations`.
 * Measured against Prisma 7.2.0, an edited file affects exactly one command:
 *
 *   prisma migrate deploy   — unaffected. Applies pending migrations only.
 *   prisma migrate status   — unaffected. "Database schema is up to date!"
 *   prisma migrate dev      — REFUSES: "The migration … was modified after it
 *                             was applied. We need to reset the schema."
 *
 * So production and staging need nothing. Developer databases need this, once,
 * or the next `migrate dev` offers to drop the database — which on the shared
 * development database would be a catastrophe dressed as a prompt.
 *
 * ## What it does, and does not do
 *
 * It rewrites `checksum` to match the file on disk, for migrations already
 * recorded as applied. It does not run SQL, create or drop anything, or touch a
 * migration that is not already applied.
 *
 * **This asserts that the edit did not change what the migration does.** That is
 * true of the 2026-09-01 correction — the guarded statements are skipped only
 * when the column is absent, which on an applied database it never is. Do not
 * use this to paper over a migration whose behaviour you changed; there the
 * answer is a new migration.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const APPLY = process.argv.includes("--apply");
const DIR = "prisma/migrations";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Point it at the database to re-stamp.");
  process.exit(1);
}
if (/\bprod(uction)?\b/.test(url)) {
  console.error("DATABASE_URL looks like production. Production does not need this — migrate deploy is unaffected.");
  process.exit(1);
}

const checksums = new Map();
for (const name of readdirSync(DIR)) {
  const file = join(DIR, name, "migration.sql");
  if (!existsSync(file)) continue;
  checksums.set(name, createHash("sha256").update(readFileSync(file)).digest("hex"));
}

const { Client } = await import("pg");
const client = new Client({ connectionString: url, connectionTimeoutMillis: 8000 });
await client.connect();

try {
  const { rows } = await client.query(
    `SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY migration_name`,
  );

  const drifted = rows.filter((row) => {
    const onDisk = checksums.get(row.migration_name);
    return onDisk && onDisk !== row.checksum;
  });

  const host = new URL(url).hostname;
  const database = new URL(url).pathname.slice(1);
  console.log(`${database} at ${host}: ${rows.length} applied migration(s), ${drifted.length} with a stale checksum.\n`);

  if (drifted.length === 0) {
    console.log("Nothing to do.");
  } else {
    for (const row of drifted) {
      console.log(`  ${row.migration_name}`);
      console.log(`    recorded ${row.checksum}`);
      console.log(`    on disk  ${checksums.get(row.migration_name)}`);
    }
    if (!APPLY) {
      console.log("\nReport only. Re-run with --apply to re-stamp these.");
    } else {
      for (const row of drifted) {
        await client.query(`UPDATE _prisma_migrations SET checksum = $1 WHERE migration_name = $2`, [
          checksums.get(row.migration_name),
          row.migration_name,
        ]);
      }
      console.log(`\nRe-stamped ${drifted.length} migration(s).`);
    }
  }
} finally {
  await client.end();
}
