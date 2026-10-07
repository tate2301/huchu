/**
 * Migration witness for `20261004133000_retail_stock_ledger`.
 *
 * Every stock movement says why it moved (`reason`), which document a person
 * reads it under (`reference`), what it did to the line (`change`) and what the
 * line held straight after (`balanceAfter`); a reversal names the movement it
 * puts back, at most once. A stock line keeps a reorder quantity and a shelf.
 *
 * The last assertion is on data, not shape: on every line, the newest movement
 * holds the line's on hand. The backfill walks balances back from today's
 * figure, and `recordStockMovement` keeps it true from then on.
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

async function columns(table: string, names: string[]) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, numeric_precision, numeric_scale, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ANY(${names})`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

describe("the stock ledger, as stored", () => {
  it("names eighteen reasons a stock line moves", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'StockMovementReason'
      ORDER BY e.enumsortorder`;
    expect(labels.map((row) => row.label)).toEqual([
      "OPENING",
      "SALE",
      "REFUND",
      "VOID",
      "RECEIVED",
      "DELIVERY_DIFFERENCE",
      "SUPPLIER_RETURN",
      "COUNT",
      "BROKEN",
      "OWN_USE",
      "FOUND",
      "CORRECTION",
      "TRANSFER_OUT",
      "TRANSFER_IN",
      "TRANSFER_BACK",
      "CASE_BROKEN",
      "REVERSAL",
      "PLACE_MOVE",
    ]);
  });

  it("gives a movement its reason, reference, change, balance and reversal", async () => {
    const facts = await columns("StockMovement", ["reason", "reference", "change", "balanceAfter", "reversesId"]);

    expect(facts.get("reason")).toMatchObject({ udt_name: "StockMovementReason", is_nullable: "YES" });
    expect(facts.get("reference")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("change")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 12,
      numeric_scale: 4,
      is_nullable: "NO",
      column_default: "0",
    });
    expect(facts.get("balanceAfter")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 12,
      numeric_scale: 4,
      is_nullable: "YES",
    });
    expect(facts.get("reversesId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });

  it("reverses a movement at most once, and never deletes what was reversed", async () => {
    const [unique] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'StockMovement' AND indexname = 'StockMovement_reversesId_key'`;
    expect(unique.indexdef).toMatch(/CREATE UNIQUE INDEX .* \("reversesId"\)/);

    const [fk] = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name = 'StockMovement_reversesId_fkey'`;
    expect(fk.delete_rule).toBe("RESTRICT");
  });

  it("reads a line's history in time order from an index", async () => {
    const [index] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'StockMovement' AND indexname = 'StockMovement_itemId_createdAt_idx'`;
    expect(index.indexdef).toMatch(/\("itemId", "createdAt"\)/);
  });

  it("keeps a reorder quantity and a shelf on the stock line", async () => {
    const facts = await columns("InventoryItem", ["reorderQty", "shelf"]);
    expect(facts.get("reorderQty")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 12,
      numeric_scale: 4,
      is_nullable: "YES",
    });
    expect(facts.get("shelf")).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });

  it("adds the stock notifications", async () => {
    const labels = await prisma.$queryRaw<Array<{ type: string; label: string }>>`
      SELECT t.typname AS type, e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname IN ('NotificationType', 'NotificationEntityType')`;
    const of = (type: string) => labels.filter((row) => row.type === type).map((row) => row.label);
    expect(of("NotificationType")).toEqual(
      expect.arrayContaining(["RETAIL_COUNT_ASSIGNED", "RETAIL_COUNT_SUBMITTED", "RETAIL_TRANSFER_SENT"]),
    );
    expect(of("NotificationEntityType")).toEqual(
      expect.arrayContaining(["RETAIL_STOCK_COUNT", "RETAIL_STOCK_TRANSFER"]),
    );
  });

  it("holds the line's on hand in the newest movement of every line", async () => {
    const drifted = await prisma.$queryRaw<Array<{ itemId: string; currentStock: string; balanceAfter: string | null }>>`
      SELECT newest."itemId", i."currentStock"::text AS "currentStock", newest."balanceAfter"::text AS "balanceAfter"
      FROM (
        SELECT DISTINCT ON (sm."itemId") sm."itemId", sm."balanceAfter"
        FROM "StockMovement" sm
        ORDER BY sm."itemId", sm."createdAt" DESC, sm."id" DESC
      ) AS newest
      JOIN "InventoryItem" i ON i."id" = newest."itemId"
      WHERE newest."balanceAfter" IS DISTINCT FROM i."currentStock"`;
    expect(drifted).toEqual([]);
  });
});
