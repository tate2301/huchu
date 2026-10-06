/**
 * Migration witness for `20261006130000_retail_stock_counts` (STK-05).
 *
 * A stock count is a document: a number unique in the shop, what it covers
 * (everything, some categories, some products or a place), who counts it,
 * and whether the counter sees what is expected and the till keeps selling.
 * It holds one line per stock line, with what was expected when it started,
 * what was counted, and on hand at the moment the figure arrived. Lines go
 * with their count.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

type ColumnFacts = {
  column_name: string;
  data_type: string;
  udt_name: string;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: string;
  column_default: string | null;
};

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, numeric_precision, numeric_scale, is_nullable, column_default
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

describe("stock counts, as stored", () => {
  it("names what a count covers, the states it goes through and why a line differs", async () => {
    expect(await enumLabels("RetailStockCountScope")).toEqual(["EVERYTHING", "CATEGORIES", "PRODUCTS", "PLACE"]);
    expect(await enumLabels("RetailStockCountStatus")).toEqual(["COUNTING", "TO_APPROVE", "APPROVED", "CANCELLED"]);
    expect(await enumLabels("RetailStockCountWhy")).toEqual(["BROKEN", "NOT_KNOWN", "FOUND"]);
  });

  it("keeps a count's number, site, scope, counter and choices", async () => {
    const facts = await columns("RetailStockCount");
    for (const name of ["companyId", "countNo", "siteId", "name", "counterId", "createdById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "NO" });
    }
    expect(facts.get("scope")).toMatchObject({ udt_name: "RetailStockCountScope", is_nullable: "NO" });
    expect(facts.get("status")).toMatchObject({
      udt_name: "RetailStockCountStatus",
      is_nullable: "NO",
      column_default: "'COUNTING'::\"RetailStockCountStatus\"",
    });
    expect(facts.get("categoryIds")).toMatchObject({ data_type: "ARRAY", udt_name: "_text" });
    expect(facts.get("categoryIds")?.column_default).toBe("ARRAY[]::text[]");
    for (const name of ["blind", "keepSelling"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "true" });
    }
    for (const name of ["placeId", "approvedById", "cancelledById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["firstCountedAt", "submittedAt", "approvedAt", "cancelledAt"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "YES" });
    }
    for (const name of ["differenceValue", "shortValue", "overValue"]) {
      expect(facts.get(name), name).toMatchObject({
        data_type: "numeric",
        numeric_precision: 14,
        numeric_scale: 2,
        is_nullable: "YES",
      });
    }
  });

  it("keeps each line's expected, counted and on hand at the count as quantities, its cost as money", async () => {
    const facts = await columns("RetailStockCountLine");
    for (const name of ["companyId", "countId", "inventoryItemId", "sortKey"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "NO" });
    }
    expect(facts.get("productId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("expected")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 12,
      numeric_scale: 4,
      is_nullable: "NO",
    });
    for (const name of ["counted", "expectedAtCount", "difference"]) {
      expect(facts.get(name), name).toMatchObject({
        data_type: "numeric",
        numeric_precision: 12,
        numeric_scale: 4,
        is_nullable: "YES",
      });
    }
    expect(facts.get("unitCost")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "NO",
      column_default: "0",
    });
    expect(facts.get("why")).toMatchObject({ udt_name: "RetailStockCountWhy", is_nullable: "YES" });
    expect(facts.get("recount")).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "false" });
    expect(facts.get("countedAt")).toMatchObject({ is_nullable: "YES" });
    expect(facts.get("countedById")).toMatchObject({ is_nullable: "YES" });
  });

  it("numbers counts once per shop and lists a stock line once per count", async () => {
    expect(await indexDef("RetailStockCount", "RetailStockCount_companyId_countNo_key")).toMatch(
      /CREATE UNIQUE INDEX .* \("companyId", "countNo"\)/,
    );
    expect(await indexDef("RetailStockCountLine", "RetailStockCountLine_countId_inventoryItemId_key")).toMatch(
      /CREATE UNIQUE INDEX .* \("countId", "inventoryItemId"\)/,
    );
    expect(await indexDef("RetailStockCount", "RetailStockCount_companyId_status_createdAt_idx")).toMatch(
      /\("companyId", status, "createdAt"\)/,
    );
  });

  it("takes a count's lines with it, and keeps the stock lines and people it names", async () => {
    const rules = await prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
      SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name LIKE 'RetailStockCount%'`;
    const rule = new Map(rules.map((row) => [row.constraint_name, row.delete_rule]));
    expect(rule.get("RetailStockCountLine_countId_fkey")).toBe("CASCADE");
    expect(rule.get("RetailStockCountLine_inventoryItemId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockCountLine_productId_fkey")).toBe("SET NULL");
    expect(rule.get("RetailStockCount_siteId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockCount_counterId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockCount_placeId_fkey")).toBe("SET NULL");
  });
});
