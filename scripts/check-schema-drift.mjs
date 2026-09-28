/**
 * Does the database actually have what the migrations say it has?
 *
 * `prisma migrate status` answers a different question from the one you want
 * when a query dies with P2022. It reads `_prisma_migrations` — a ledger of
 * which migrations were *recorded* — and will happily report "No pending
 * migrations to apply" for a database whose columns were never created. That
 * happens when a database is stood up with `db push` and then baselined, when
 * a migration is marked applied with `migrate resolve --applied`, or, most
 * often, when you ran `migrate deploy` against a different database from the
 * one the failing app talks to.
 *
 * This asks the database directly: every column any migration says it adds,
 * does it exist? Read-only — it issues two SELECTs against information_schema
 * and `_prisma_migrations` and writes nothing.
 *
 *   DATABASE_URL="postgres://…" node scripts/check-schema-drift.mjs
 *
 * Exits 1 when anything is missing, so it can gate a deploy.
 */
import "dotenv/config";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Point it at the database you want to check.");
  process.exit(1);
}

/** Host and database only — never echo the credentials back to a terminal or a log. */
function describeTarget(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${parsed.pathname}`;
  } catch {
    return "(unparseable connection string)";
  }
}

const migrationsDir = join(process.cwd(), "prisma", "migrations");
if (!existsSync(migrationsDir)) {
  console.error(`No migrations directory at ${migrationsDir}`);
  process.exit(1);
}

const migrationNames = readdirSync(migrationsDir)
  .filter((name) => existsSync(join(migrationsDir, name, "migration.sql")))
  .sort();

/**
 * Every column a migration claims to add, as `Table.column`, with the
 * migration that added it. Covers `ADD COLUMN` only: a column created by
 * `CREATE TABLE` cannot be missing without the whole table being missing,
 * which is a louder failure than this is looking for.
 */
function declaredColumns() {
  const found = new Map();
  for (const name of migrationNames) {
    const sql = readFileSync(join(migrationsDir, name, "migration.sql"), "utf8");
    const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?"?([A-Za-z0-9_]+)"?([\s\S]*?);/gi;
    let alter;
    while ((alter = alterRe.exec(sql)) !== null) {
      const table = alter[1];
      const addRe = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([A-Za-z0-9_]+)"?/gi;
      let add;
      while ((add = addRe.exec(alter[2])) !== null) {
        const key = `${table}.${add[1]}`;
        if (!found.has(key)) found.set(key, name);
      }
    }
  }
  return found;
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  console.log(`Database: ${describeTarget(url)}\n`);

  const { rows: columnRows } = await client.query(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()`,
  );
  const live = new Set(columnRows.map((row) => `${row.table_name}.${row.column_name}`));
  const liveTables = new Set(columnRows.map((row) => row.table_name));

  let recorded = new Map();
  try {
    const { rows } = await client.query(
      `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`,
    );
    recorded = new Map(rows.map((row) => [row.migration_name, row]));
  } catch {
    console.log("No _prisma_migrations table — this database has no migration history at all.\n");
  }

  const declared = declaredColumns();
  // A column missing because its whole table is missing is a different, louder
  // problem — reported once per table rather than once per column, so it
  // cannot bury the case this exists for: a column absent from a table that
  // is otherwise there.
  const missing = [];
  const absentTables = new Set();
  for (const [key, migration] of declared) {
    if (live.has(key)) continue;
    const table = key.slice(0, key.indexOf("."));
    if (!liveTables.has(table)) {
      absentTables.add(table);
      continue;
    }
    missing.push({ key, migration });
  }

  // A migration on disk that the ledger has never heard of is work still to do;
  // `migrate deploy` will pick it up.
  const unrecorded = migrationNames.filter((name) => !recorded.has(name));

  if (unrecorded.length > 0) {
    console.log(`${unrecorded.length} migration(s) not recorded in _prisma_migrations:`);
    for (const name of unrecorded) console.log(`  - ${name}`);
    console.log("  → run: npx prisma migrate deploy\n");
  }

  if (absentTables.size > 0) {
    console.log(`${absentTables.size} table(s) the migrations reference do not exist at all:`);
    for (const table of [...absentTables].sort()) console.log(`  - ${table}`);
    console.log("  → this database is not this schema, or was never migrated.\n");
  }

  if (missing.length === 0) {
    const checked = declared.size;
    console.log(
      absentTables.size === 0
        ? `All ${checked} migration-added columns are present. No drift.`
        : "No column-level drift among the tables that do exist.",
    );
    process.exit(unrecorded.length > 0 || absentTables.size > 0 ? 1 : 0);
  }

  console.log(`${missing.length} column(s) the migrations add are MISSING from this database:\n`);
  const byMigration = new Map();
  for (const { key, migration } of missing) {
    if (!byMigration.has(migration)) byMigration.set(migration, []);
    byMigration.get(migration).push(key);
  }
  for (const [migration, keys] of byMigration) {
    const row = recorded.get(migration);
    const state = !row
      ? "NOT recorded — migrate deploy will apply it"
      : row.rolled_back_at
        ? "recorded as ROLLED BACK"
        : row.finished_at
          ? "recorded as APPLIED — the ledger is wrong, so migrate deploy will skip it"
          : "recorded but never finished";
    console.log(`  ${migration}`);
    console.log(`    ${state}`);
    for (const key of keys) console.log(`      missing: ${key}`);
    console.log("");
  }

  console.log(
    "Where a migration is recorded as applied but its columns are absent, this database\n" +
      "is not the one that migration ran against, or it was marked applied without running.\n" +
      "Check you are pointed at the right database before changing any history.",
  );
  process.exit(1);
} finally {
  await client.end();
}
