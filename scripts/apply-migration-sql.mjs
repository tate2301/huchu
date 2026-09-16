/**
 * Apply one migration's SQL to the database in DATABASE_URL_TEST.
 *
 * Not a substitute for `prisma migrate deploy`. The test database here was
 * stood up with `db:push`, so it has every table and no `_prisma_migrations`
 * history — `migrate deploy` therefore tries to replay the whole log from the
 * beginning and dies on the first CREATE TABLE that already exists. Fixing
 * that properly means baselining the test database, which is somebody's
 * deliberate decision and not a side effect of adding a boarding feature.
 *
 *   node scripts/apply-migration-sql.mjs <migration-dir-name>
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const name = process.argv[2];
if (!name) {
  console.error("usage: node scripts/apply-migration-sql.mjs <migration-dir-name>");
  process.exit(1);
}

const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_TEST is not set.");
  process.exit(1);
}

const file = join(process.cwd(), "prisma", "migrations", name, "migration.sql");
const sql = readFileSync(file, "utf8");

const client = new pg.Client({ connectionString: url });
await client.connect();

/**
 * Split on semicolons at end of line, skipping comment-only chunks. Good
 * enough for the DDL these migrations contain; it is not a SQL parser and is
 * not trying to be.
 */
const statements = sql
  .split(/;\s*$/m)
  .map((chunk) =>
    chunk
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

let applied = 0;
let skipped = 0;

for (const statement of statements) {
  try {
    await client.query(statement);
    applied += 1;
  } catch (error) {
    const message = String(error);
    // Re-running must be safe: this script is how a developer catches their
    // database up, and they should not have to know whether they already did.
    if (/already exists/i.test(message)) {
      skipped += 1;
      continue;
    }
    console.error(`\nFAILED:\n${statement.slice(0, 200)}\n\n${message}`);
    await client.end();
    process.exit(1);
  }
}

console.log(`${name}: ${applied} statements applied, ${skipped} already present`);
await client.end();
