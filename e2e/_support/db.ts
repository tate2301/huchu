import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

/**
 * Read the database back, from inside a test.
 *
 * Specs so far have asserted only what the browser shows. That is the right
 * default — a receipt dialog proves the server accepted the basket — but it
 * cannot see the half of the write the UI does not render. When a sale posts,
 * `RetailSale` is one of four things written: lines, payments, stock movements
 * and the journal. A green receipt with an unbalanced journal behind it is
 * exactly the bug worth catching, and only a query finds it.
 *
 * ## Which database
 *
 * The same one the dev server is using, or the assertions are meaningless.
 * `E2E_DATABASE_URL` names it; it must match whatever `.env.e2e` gave the
 * server. There is deliberately no fallback to `DATABASE_URL` — that fallback,
 * in `vitest.setup.ts`, is how ~390 test tenants ended up on the shared Neon
 * instance.
 */

const url = process.env.E2E_DATABASE_URL;

if (!url) {
  throw new Error(
    [
      "E2E_DATABASE_URL is not set, so the suite cannot read the database back.",
      "",
      "It must name the same database the dev server under test is using.",
      'Typically:  E2E_DATABASE_URL="postgresql://huchu:<password>@localhost:54329/huchu_test"',
    ].join("\n"),
  );
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
})();

if (process.env.ALLOW_REMOTE_TEST_DB !== "1") {
  if (host === null) {
    throw new Error("E2E_DATABASE_URL is not a URL this can parse, so its host cannot be checked.");
  }
  if (!LOOPBACK.has(host)) {
    throw new Error(
      `E2E_DATABASE_URL points at ${host}, which is not localhost. ` +
        "The suite writes sales, payroll runs and journals; it refuses to do that " +
        "to a database that might be shared. Set ALLOW_REMOTE_TEST_DB=1 only if the " +
        "target is genuinely disposable.",
    );
  }
}

/**
 * One client for the whole run. Playwright's workers are separate processes, so
 * this is per-worker, not global — with `fullyParallel: false` that is one.
 *
 * Prisma 7 requires a driver adapter; `datasources` is gone. Mirrors
 * `lib/prisma.ts`, with a smaller pool because the suite issues a handful of
 * queries next to a dev server that wants the rest of the connections.
 */
const pool = new Pool({ connectionString: url, max: 3 });

export const db = new PrismaClient({ adapter: new PrismaPg(pool) });

export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
  await pool.end();
}

/* ── Assertions worth having in one place ─────────────────────────────── */

/**
 * Every journal entry for a company balances.
 *
 * The single most valuable cross-module check in the codebase: payroll posting,
 * retail Z-reports and gold settlement all write journals, and an imbalance is
 * silent in every UI that renders them.
 *
 * `JournalLine.debit` and `.credit` are `Float` in the schema, not `Decimal`.
 * That is exactly why this is worth asserting — a float ledger accumulates
 * representation error that nothing else in the stack will complain about — and
 * also why the comparison is to a tenth of a cent rather than to zero.
 */
export async function expectJournalsBalance(companyId: string): Promise<void> {
  const entries = await db.journalEntry.findMany({
    where: { companyId },
    select: {
      id: true,
      entryNumber: true,
      description: true,
      sourceType: true,
      lines: { select: { debit: true, credit: true } },
    },
  });

  const unbalanced = entries
    .map((entry) => {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
      return { ...entry, debit, credit, delta: debit - credit };
    })
    .filter((entry) => Math.abs(entry.delta) > 0.001);

  if (unbalanced.length > 0) {
    const detail = unbalanced
      .map(
        (e) =>
          `  #${e.entryNumber} (${e.sourceType}) ${e.description}: ` +
          `Dr ${e.debit.toFixed(2)} / Cr ${e.credit.toFixed(2)}`,
      )
      .join("\n");
    throw new Error(
      `${unbalanced.length} of ${entries.length} journal entr(ies) do not balance:\n${detail}`,
    );
  }
}

/** Resolve a tenant slug to its id, failing with the seed hint when absent. */
export async function companyIdFor(slug: string, seedHint: string): Promise<string> {
  const company = await db.company.findUnique({ where: { slug }, select: { id: true } });
  if (!company) {
    throw new Error(`No tenant "${slug}" in the test database.\nSeed it with:\n  ${seedHint}`);
  }
  return company.id;
}
