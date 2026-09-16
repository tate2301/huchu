/**
 * Migration witnesses for the two schema changes behind the document banking
 * block and the tenant policy links.
 *
 * Required by `AGENTS.md`: "Schema change without a migration witness test" is
 * a forbidden pattern. `banking-block.test.ts` exercises the renderer in
 * memory, which proves the HTML is right and proves nothing at all about the
 * database — a renderer test passes just as happily against a column that was
 * never created.
 *
 * So these read `information_schema` and `pg_indexes` rather than the schema
 * file. A green `prisma generate` is not evidence the database changed, and the
 * failure these guard against is the quiet one: a migration that did not run,
 * leaving `getDocumentBranding` selecting a column that does not exist and
 * every quotation in the tenant failing at render time.
 *
 * Two invariants carry real behaviour and are asserted explicitly:
 *
 *  - `showOnDocuments` defaults to FALSE, so shipping this migration does not
 *    put an existing tenant's ledger accounts on to customer-facing paper.
 *  - `showOnDocuments` is NOT NULL, so "is this account printed?" is never an
 *    unanswered question on a document that asks somebody for money.
 */

import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";

type ColumnRow = {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

async function columns(table: string): Promise<Map<string, ColumnRow>> {
  const rows = await prisma.$queryRaw<ColumnRow[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}
  `;
  return new Map(rows.map((row) => [row.column_name, row]));
}

describe("20260915120000_document_banking_details", () => {
  it("adds the bank-level columns to CompanyBranding", async () => {
    const cols = await columns("CompanyBranding");
    for (const name of ["bankBranch", "bankBranchCode", "bankAddress"]) {
      const col = cols.get(name);
      expect(col, `CompanyBranding.${name} is missing`).toBeDefined();
      expect(col?.data_type).toBe("text");
      // Nullable: a tenant that has not filled these in renders without them
      // rather than being blocked from saving its branding.
      expect(col?.is_nullable).toBe("YES");
    }
  });

  it("adds the per-account columns to BankAccount", async () => {
    const cols = await columns("BankAccount");

    expect(cols.get("accountName")?.data_type).toBe("text");
    expect(cols.get("accountName")?.is_nullable).toBe("YES");

    expect(cols.get("documentPosition")?.data_type).toBe("integer");
    expect(cols.get("documentPosition")?.is_nullable).toBe("NO");
  });

  it("defaults showOnDocuments to false and never leaves it null", async () => {
    const col = (await columns("BankAccount")).get("showOnDocuments");
    expect(col, "BankAccount.showOnDocuments is missing").toBeDefined();
    expect(col?.data_type).toBe("boolean");
    // The whole safety property of this change: existing ledger accounts do
    // not appear on customer-facing paper until somebody opts them in.
    expect(col?.column_default).toBe("false");
    expect(col?.is_nullable).toBe("NO");
  });

  it("indexes the lookup getDocumentBranding actually performs", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'BankAccount'
    `;
    const defs = rows.map((row) => row.indexdef);
    const hit = defs.find(
      (def) =>
        def.includes('"companyId"') &&
        def.includes('"showOnDocuments"') &&
        def.includes('"documentPosition"'),
    );
    expect(hit, `no index over (companyId, showOnDocuments, documentPosition); saw:\n${defs.join("\n")}`).toBeDefined();
  });
});

describe("20260915123000_tenant_policy_links", () => {
  it("adds the policy URL columns to CompanyBranding", async () => {
    const cols = await columns("CompanyBranding");
    for (const name of ["privacyPolicyUrl", "termsUrl"]) {
      const col = cols.get(name);
      expect(col, `CompanyBranding.${name} is missing`).toBeDefined();
      expect(col?.data_type).toBe("text");
      // Nullable on purpose: the intake form renders no link at all rather
      // than a dead one, so "not set" has to be expressible.
      expect(col?.is_nullable).toBe("YES");
    }
  });
});
