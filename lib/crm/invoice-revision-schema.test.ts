/**
 * Migration witness for 20260925150000_sales_invoice_revision.
 *
 * The invoice edit is built on two facts about the database, and this pins
 * both, because the bridge would pass its own tests against a schema file
 * that disagreed with the catalogue:
 *
 *  - `SalesInvoice.revision` is NOT NULL and starts at 0, so every invoice
 *    that existed before editing did keeps posting under its own id.
 *  - A journal's source really is unique — the reason the revision exists at
 *    all — and a journal can be reversed once, by one mirror entry.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

async function column(table: string, name: string) {
  const rows = await prisma.$queryRaw<
    Array<{ is_nullable: string; column_default: string | null; data_type: string }>
  >`
    SELECT is_nullable, column_default, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${name}
  `;
  return rows[0] ?? null;
}

async function indexes(table: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ${table}
  `;
  return rows.map((row) => row.indexdef);
}

describe("an invoice's revision", () => {
  it("is a required integer starting at 0", async () => {
    const revision = await column("SalesInvoice", "revision");
    expect(revision?.data_type).toBe("integer");
    expect(revision?.is_nullable).toBe("NO");
    expect(revision?.column_default).toBe("0");
  });
});

describe("what the revision works around", () => {
  it("files one journal per source", async () => {
    const defs = await indexes("JournalEntry");
    expect(
      defs.some(
        (def) =>
          def.startsWith("CREATE UNIQUE INDEX") && def.includes('("companyId", "sourceType", "sourceId")'),
      ),
    ).toBe(true);
  });

  it("lets a journal be reversed by one mirror entry", async () => {
    const defs = await indexes("JournalEntry");
    expect(
      defs.some((def) => def.startsWith("CREATE UNIQUE INDEX") && def.includes('("reversalOfEntryId")')),
    ).toBe(true);
  });
});
