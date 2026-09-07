/**
 * Stand up the end-to-end databases from nothing.
 *
 *   node scripts/e2e-bootstrap.mjs            # do it
 *   node scripts/e2e-bootstrap.mjs --check    # say what it would do
 *
 * Steps 0.1–0.3 of `docs/testing/e2e-plan-2026-09-01.md`. Idempotent: every
 * step asks before it acts, so re-running repairs rather than duplicates.
 *
 * ## Two databases, one server
 *
 * `huchu_test` is the unit suite's. It is churned — tests create and drop
 * tenants on every run. `huchu_e2e` is the Playwright suite's, seeded once with
 * five demo tenants that are expected to still be there tomorrow. Sharing one
 * database would have `pnpm test` quietly delete the shop the e2e suite sells
 * from.
 *
 * ## Why `migrate deploy`
 *
 * `prisma/migrations` is the source of truth and what production applies, so a
 * test database should be built the same way and fail the same way.
 *
 * This briefly used `db push` instead, because on 2026-09-01 `migrate deploy`
 * could not build the schema from scratch — it died 59 migrations in on
 * `column "sourceType" does not exist`. That is fixed (plan §10), and
 * `pnpm verify:migrations` now guards it, so there is no longer any reason to
 * push. If this ever fails again, run that first: it will say whether the
 * history is broken or just this database.
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const CHECK = process.argv.includes("--check");

/* ── Read .env.e2e without a dependency ───────────────────────────────── */

if (!existsSync(".env.e2e")) {
  console.error("No .env.e2e. It is generated during Phase 0 — see the plan, step 0.4.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(".env.e2e", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const eq = line.indexOf("=");
      return [line.slice(0, eq), line.slice(eq + 1).replace(/^"|"$/g, "")];
    }),
);

const E2E_URL = env.DATABASE_URL;
const TEST_URL = env.DATABASE_URL_TEST;

if (!E2E_URL || !TEST_URL) {
  console.error(".env.e2e must define both DATABASE_URL and DATABASE_URL_TEST.");
  process.exit(1);
}

/**
 * The maintenance connection: same server, but the **superuser**.
 *
 * Not the target credentials. This connection exists to create the `huchu`
 * role, so it cannot be `huchu` — the first run would fail with "password
 * authentication failed" for a role that does not exist yet, which is a
 * confusing way to say "you have not created it".
 *
 * Defaults to the superuser the winget install sets up. Override with
 * `E2E_ADMIN_URL` for a server whose superuser is someone else.
 */
function adminUrl(sample) {
  if (process.env.E2E_ADMIN_URL) return process.env.E2E_ADMIN_URL;
  const url = new URL(sample);
  url.pathname = "/postgres";
  url.username = process.env.E2E_ADMIN_USER ?? "postgres";
  url.password = process.env.E2E_ADMIN_PASSWORD ?? "postgres";
  return url.toString();
}

function dbNameOf(url) {
  return new URL(url).pathname.slice(1);
}

function run(command, args, extraEnv = {}) {
  const label = `${command} ${args.join(" ")}`.replace(/postgresql:\/\/[^\s"]+/g, "<url>");
  if (CHECK) {
    console.log(`  would run: ${label}`);
    return { status: 0, stdout: "" };
  }
  console.log(`  ${label}`);
  const result = spawnSync(command, args, {
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.stdout?.trim()) console.log(indent(result.stdout));
  if (result.status !== 0) {
    console.error(indent(result.stderr || "(no stderr)"));
    throw new Error(`Failed: ${label}`);
  }
  return result;
}

const indent = (text) =>
  text
    .trim()
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");

/* ── 0.1  Roles and databases ─────────────────────────────────────────── */

async function ensureDatabases() {
  const { Client } = await import("pg");
  // Without an explicit timeout, `pg` waits forever on a server that is not
  // there — and the first run of this script is exactly the moment it is not.
  // A silent hang is the worst possible answer to "is Postgres up yet?".
  const admin = new Client({
    connectionString: adminUrl(E2E_URL),
    connectionTimeoutMillis: 5000,
  });

  const target = new URL(E2E_URL);
  const role = decodeURIComponent(target.username);
  const password = decodeURIComponent(target.password);
  const wanted = [dbNameOf(TEST_URL), dbNameOf(E2E_URL)];

  const server = `${target.hostname}:${target.port || 5432}`;
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      [
        `Cannot reach PostgreSQL at ${server} — ${error.message || "connection timed out"}`,
        "",
        "Install it (once), which also puts it on the right port:",
        "  winget install --id PostgreSQL.PostgreSQL.16 --exact \\",
        "    --custom \"--mode unattended --serverport 54329 --superpassword postgres\"",
        "",
        "If it is installed, the service may just be stopped:",
        "  Get-Service *postgres* | Start-Service",
      ].join("\n"),
    );
  }

  try {
    const { rows: roles } = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    if (roles.length === 0) {
      console.log(`  role ${role}: creating`);
      if (!CHECK) {
        // Identifiers cannot be parameterised; the role name comes from our own
        // .env.e2e, and is checked rather than trusted.
        if (!/^[a-z_][a-z0-9_]*$/i.test(role)) throw new Error(`Unsafe role name: ${role}`);
        await admin.query(
          `CREATE ROLE "${role}" WITH LOGIN CREATEDB PASSWORD ${literal(password)}`,
        );
      }
    } else {
      console.log(`  role ${role}: exists`);
    }

    for (const name of wanted) {
      if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error(`Unsafe database name: ${name}`);
      const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
      if (rows.length === 0) {
        console.log(`  database ${name}: creating`);
        if (!CHECK) await admin.query(`CREATE DATABASE "${name}" OWNER "${role}"`);
      } else {
        console.log(`  database ${name}: exists`);
      }
    }
  } finally {
    await admin.end();
  }
}

/** Single-quoted SQL string literal, doubling any embedded quote. */
const literal = (value) => `'${String(value).replace(/'/g, "''")}'`;

/* ── Run ──────────────────────────────────────────────────────────────── */

async function main() {
  console.log(CHECK ? "Dry run — nothing will be written.\n" : "");

  console.log("0.1  roles and databases");
  await ensureDatabases();

  console.log("\n0.2  schema");
  for (const [label, url] of [
    ["huchu_e2e", E2E_URL],
    ["huchu_test", TEST_URL],
  ]) {
    console.log(`  ${label}:`);
    // `migrate deploy` has no `--url`; it resolves the target through
    // `prisma.config.ts`, which calls `dotenv/config`. dotenv does not override
    // an existing process.env value, so the DATABASE_URL passed here wins over
    // `.env` — but that is worth stating, because `.env` on this repo is the
    // shared Neon instance and being wrong about the precedence would point a
    // schema build at it.
    run("npx", ["prisma", "migrate", "deploy"], { DATABASE_URL: url });
  }
  run("npx", ["prisma", "generate"]);

  console.log("\n0.3  feature catalogue");
  // A fresh database has no catalogue, so every tenant seed would grant nothing
  // and every gated route would 403.
  run("npx", ["tsx", "scripts/platform/sync-catalog.ts"], { DATABASE_URL: E2E_URL });

  console.log(
    CHECK
      ? "\nDry run complete."
      : "\nDone. Next: seed the tenants (plan §4), then start the dev server on .env.e2e.",
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
