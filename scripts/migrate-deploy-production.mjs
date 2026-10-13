/**
 * `prisma migrate deploy` against the production database, as the last step of
 * a production build.
 *
 * Nothing else applies migrations, so a merge to `main` shipped code that
 * queried columns the database did not have yet (`madeByVane` on 2026-10-12,
 * eighteen Gold migrations on 2026-05-10, see docs/gold-prod-recovery-2026-05-10.md).
 *
 * It runs after `next build`, not before: a build that fails leaves the
 * database as the live code expects it, and a migration that fails fails the
 * build, so the new code never goes live against the old schema.
 *
 * Only on Vercel production builds. Previews share the production database
 * and must not apply a branch's migrations before it is merged.
 *
 * Prisma takes a session advisory lock while it migrates, which Neon's pooler
 * (transaction mode) cannot hold, so it connects to the direct host: Neon names
 * it by dropping `-pooler` from the pooled one.
 *
 *   node scripts/migrate-deploy-production.mjs
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`Not a production build (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}); skipping migrate deploy.`);
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; cannot apply migrations.");
  process.exit(1);
}

const url = new URL(process.env.DATABASE_URL);
url.hostname = url.hostname.replace("-pooler.", ".");

const require = createRequire(import.meta.url);
const root = join(dirname(new URL(import.meta.url).pathname), "..");

const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString() },
});
process.exit(result.status ?? 1);
