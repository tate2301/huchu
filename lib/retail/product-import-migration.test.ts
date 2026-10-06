/**
 * Migration witness for `20261006140000_retail_product_import` (SET-11).
 *
 * An import is a spreadsheet being checked: its file, its row count, the site
 * its new products go on sale at, and what came of it. Each row keeps what
 * was typed (a price stays "12,60" until it is fixed), what it will do, the
 * product it matched and its problems. Rows go with their import; a site an
 * import names cannot be deleted under it.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; udt_name: string; is_nullable: string; column_default: string | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumLabels(name: string) {
  const labels = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return labels.map((row) => row.label);
}

async function indexDef(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE tablename = ${table} AND indexname = ${name}`;
  return row?.indexdef ?? null;
}

describe("product imports, as stored", () => {
  it("names an import's states, what a row does and every problem a row can have", async () => {
    expect(await enumLabels("RetailImportStatus")).toEqual(["CHECKING", "IMPORTED", "DISCARDED"]);
    expect(await enumLabels("RetailImportAction")).toEqual(["NEW", "UPDATE"]);
    expect(await enumLabels("RetailImportProblem")).toEqual([
      "NO_NAME",
      "NO_PRICE",
      "PRICE_COMMA",
      "PRICE_NOT_NUMBER",
      "NEW_CATEGORY",
      "BARCODE_SHORT",
      "BARCODE_LONG",
      "BARCODE_LETTERS",
      "DUPLICATE_IN_FILE",
      "LOOKS_LIKE",
    ]);
  });

  it("keeps an import's file, site, who uploaded it and what came of it", async () => {
    const facts = await columns("RetailImport");
    for (const name of ["companyId", "fileName", "siteId", "createdById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "NO" });
    }
    expect(facts.get("rowCount")).toMatchObject({ data_type: "integer", is_nullable: "NO" });
    expect(facts.get("status")).toMatchObject({
      udt_name: "RetailImportStatus",
      is_nullable: "NO",
      column_default: "'CHECKING'::\"RetailImportStatus\"",
    });
    expect(facts.get("importedAt")).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "YES" });
    expect(facts.get("importedById")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    for (const name of ["createdCount", "updatedCount", "skippedCount"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "integer", is_nullable: "YES" });
    }
  });

  it("keeps each row as typed, with its action, match and problems", async () => {
    const facts = await columns("RetailImportRow");
    expect(facts.get("importId")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(facts.get("rowNo")).toMatchObject({ data_type: "integer", is_nullable: "NO" });
    for (const name of ["name", "category", "price", "barcode", "cost", "supplier", "packSize", "openingStock", "matchedProductId"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    expect(facts.get("action")).toMatchObject({ udt_name: "RetailImportAction", is_nullable: "YES" });
    expect(facts.get("problems")).toMatchObject({ data_type: "ARRAY", udt_name: "_RetailImportProblem" });
    expect(facts.get("problems")?.column_default).toBe("ARRAY[]::\"RetailImportProblem\"[]");
    expect(facts.get("problemArgs")).toMatchObject({ data_type: "jsonb", is_nullable: "YES" });
  });

  it("numbers a row once per import and lists a company's imports by state and date", async () => {
    expect(await indexDef("RetailImportRow", "RetailImportRow_importId_rowNo_key")).toMatch(
      /CREATE UNIQUE INDEX .* \("importId", "rowNo"\)/,
    );
    expect(await indexDef("RetailImport", "RetailImport_companyId_status_createdAt_idx")).toMatch(
      /\("companyId", status, "createdAt"\)/,
    );
  });

  it("takes an import's rows with it, and keeps the site it names", async () => {
    const rules = await prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
      SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name LIKE 'RetailImport%'`;
    const rule = new Map(rules.map((row) => [row.constraint_name, row.delete_rule]));
    expect(rule.get("RetailImportRow_importId_fkey")).toBe("CASCADE");
    expect(rule.get("RetailImport_siteId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailImport_companyId_fkey")).toBe("CASCADE");
  });
});
