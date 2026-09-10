// Load .env so DATABASE_URL_TEST is available, then override DATABASE_URL
// with the test DB before Prisma creates its pool.
import "dotenv/config";

/**
 * The suite writes. It must never write to a database anybody else is using.
 *
 * ## What this is fixing
 *
 * This file used to be four lines: swap in `DATABASE_URL_TEST` *if it is set*,
 * and otherwise carry on. Carrying on meant running the whole DB-backed suite
 * against whatever `DATABASE_URL` happened to be — which, on this repo, is the
 * shared Neon instance that also holds the tenants we demo to clients.
 *
 * It did. On 2026-09-01 that database held **418 companies, of which ~390 were
 * test litter**: `test-co-<hex>`, `timetable-test-<ts>`, `payslip-<ts>`,
 * `settlements-<ts>`, `portal-identity-<ts>`, `audit-school-<ts>`. The fallback
 * was silent, so nothing ever said this was happening.
 *
 * That litter is not cosmetic. `scripts/clean-provision-test-tenants.ts` records
 * the second-order damage the same pattern already caused once:
 * `lib/inventory/shelf-price-integrity.test.ts` prices every ranged line in the
 * database in parallel, so a few dozen stray tenants exhausted the connection
 * pool and the suite began failing with *timeout exceeded when trying to
 * connect* — an error about the network, caused by test rows.
 *
 * So the rule is now: **no test database, no test run.** A suite that cannot
 * find its own database should stop, not quietly borrow someone else's.
 *
 * See `docs/testing/e2e-plan-2026-09-01.md` §2a.
 */

const testUrl = process.env.DATABASE_URL_TEST;

if (!testUrl) {
  throw new Error(
    [
      "DATABASE_URL_TEST is not set, so there is nowhere safe to run the tests.",
      "",
      "This used to fall back to DATABASE_URL. It no longer does — that fallback",
      "is how ~390 test tenants ended up on the shared Neon database.",
      "",
      "Set it in .env, e.g.:",
      '  DATABASE_URL_TEST="postgresql://huchu:<password>@localhost:54329/huchu_test"',
      "",
      "See docs/_start-here/LOCAL_DEV.md for standing the database up.",
    ].join("\n"),
  );
}

/**
 * Belt and braces: `DATABASE_URL_TEST` being *set* is not the same as it being
 * *safe*. Pointing it at the shared instance would satisfy the check above and
 * reintroduce the exact problem, so the host has to be a loopback address too.
 *
 * `ALLOW_REMOTE_TEST_DB=1` opts out, for a CI runner whose Postgres genuinely is
 * not on localhost. It is deliberately awkward to type and deliberately loud
 * when used — an escape hatch nobody notices is just the old bug with a flag.
 */
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

const host = hostOf(testUrl);

if (process.env.ALLOW_REMOTE_TEST_DB === "1") {
  console.warn(
    `\n!  ALLOW_REMOTE_TEST_DB=1 — running the suite against a non-local database (${host ?? "unparseable host"}).` +
      `\n   Every test that writes will write there.\n`,
  );
} else if (host === null) {
  throw new Error(
    "DATABASE_URL_TEST is not a URL this can parse, so its host cannot be checked.",
  );
} else if (!LOOPBACK.has(host)) {
  throw new Error(
    [
      `DATABASE_URL_TEST points at ${host}, which is not localhost.`,
      "",
      "The suite writes, and refuses to write to a database that might be shared.",
      "Point it at a local Postgres, or set ALLOW_REMOTE_TEST_DB=1 if you are",
      "certain the target is disposable (a CI service container, say).",
    ].join("\n"),
  );
}

process.env.DATABASE_URL = testUrl;

/**
 * A small connection pool, because there are a dozen of us.
 *
 * Vitest runs one worker per core — twelve on this machine — and each worker
 * loads this file and builds its own Prisma pool. `.env.e2e` sets
 * `PG_POOL_MAX=30`, which is right for a single dev server and wrong here:
 * twelve workers wanting thirty connections each is 360 against a Postgres
 * whose `max_connections` is 100.
 *
 * What that looks like is not "too many connections". It looks like
 * `Hook timed out in 10000ms` in an `afterAll` doing nothing but a handful of
 * deletes — 31 failures across 27 files, every one a timeout, none of them
 * about the thing being tested. The same tests pass when run three at a time.
 *
 * The docstring above already records this failure mode from the other
 * direction: stray tenants made `shelf-price-integrity.test.ts` fan out wide
 * enough to exhaust the pool, and it failed with "timeout exceeded when trying
 * to connect" — an error about the network, caused by test rows. Same
 * exhaustion, different cause.
 *
 * Five per worker leaves sixty in use with forty spare for the dev server, a
 * psql session and the odd script. An explicit `PG_POOL_MAX` still wins, so a
 * CI runner with a larger Postgres can say so.
 */
if (!process.env.PG_POOL_MAX || Number(process.env.PG_POOL_MAX) > 5) {
  process.env.PG_POOL_MAX = "5";
}
