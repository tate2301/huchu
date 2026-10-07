/**
 * Migration witness for `20261005161747_retail_stock_transfers` and
 * `20261005164102_retail_transfer_cancelled_notice` (STK-07).
 *
 * Stock sent from one site of a shop to another is a document: a transfer
 * with its number, its two sites and its state, and a line per product with
 * what was sent, received and lost, at the sending line's cost. A transfer
 * never goes to the site it left, and its number is unique in the shop. The
 * site it was going to is told when it is sent and when it is called off.
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

async function indexDef(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE tablename = ${table} AND indexname = ${name}`;
  return row?.indexdef ?? null;
}

describe("stock transfers, as stored", () => {
  it("names the three states a transfer can be in", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'RetailStockTransferStatus'
      ORDER BY e.enumsortorder`;
    expect(labels.map((row) => row.label)).toEqual(["ON_THE_WAY", "RECEIVED", "CANCELLED"]);
  });

  it("keeps a transfer's number, sites, state and who moved it", async () => {
    const facts = await columns("RetailStockTransfer");
    for (const name of ["companyId", "transferNo", "fromSiteId", "toSiteId", "sentById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "NO" });
    }
    expect(facts.get("status")).toMatchObject({
      udt_name: "RetailStockTransferStatus",
      is_nullable: "NO",
      column_default: "'ON_THE_WAY'::\"RetailStockTransferStatus\"",
    });
    for (const name of ["driver", "vehicle", "arrives", "note", "receivedById", "cancelledById"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "text", is_nullable: "YES" });
    }
    for (const name of ["receivedAt", "cancelledAt"]) {
      expect(facts.get(name), name).toMatchObject({ is_nullable: "YES" });
    }
    expect(facts.get("sentAt")).toMatchObject({ is_nullable: "NO" });
  });

  it("keeps each line's sent, received and lost as quantities and its cost as money", async () => {
    const facts = await columns("RetailStockTransferLine");
    expect(facts.get("quantitySent")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 12,
      numeric_scale: 4,
      is_nullable: "NO",
      column_default: null,
    });
    for (const name of ["quantityReceived", "quantityLost"]) {
      expect(facts.get(name), name).toMatchObject({
        data_type: "numeric",
        numeric_precision: 12,
        numeric_scale: 4,
        is_nullable: "NO",
        column_default: "0",
      });
    }
    expect(facts.get("unitCost")).toMatchObject({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "NO",
    });
    expect(facts.get("fromItemId")).toMatchObject({ is_nullable: "NO" });
    expect(facts.get("toItemId")).toMatchObject({ is_nullable: "YES" });
  });

  it("numbers transfers once per shop and lists a product once per transfer", async () => {
    expect(await indexDef("RetailStockTransfer", "RetailStockTransfer_companyId_transferNo_key")).toMatch(
      /CREATE UNIQUE INDEX .* \("companyId", "transferNo"\)/,
    );
    expect(await indexDef("RetailStockTransferLine", "RetailStockTransferLine_transferId_productId_key")).toMatch(
      /CREATE UNIQUE INDEX .* \("transferId", "productId"\)/,
    );
    expect(await indexDef("RetailStockTransfer", "RetailStockTransfer_companyId_status_sentAt_idx")).toMatch(
      /\("companyId", status, "sentAt"\)/,
    );
  });

  it("never sends a transfer to the site it left", async () => {
    const [check] = await prisma.$queryRaw<Array<{ definition: string }>>`
      SELECT pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = 'RetailStockTransfer' AND c.conname = 'RetailStockTransfer_sites_differ'`;
    expect(check?.definition).toBe('CHECK (("fromSiteId" <> "toSiteId"))');
  });

  it("keeps the sites, people and stock lines a transfer names", async () => {
    const rules = await prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
      SELECT constraint_name, delete_rule FROM information_schema.referential_constraints
      WHERE constraint_name LIKE 'RetailStockTransfer%'`;
    const rule = new Map(rules.map((row) => [row.constraint_name, row.delete_rule]));
    expect(rule.get("RetailStockTransfer_fromSiteId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockTransfer_toSiteId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockTransfer_sentById_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockTransferLine_transferId_fkey")).toBe("CASCADE");
    expect(rule.get("RetailStockTransferLine_fromItemId_fkey")).toBe("RESTRICT");
    expect(rule.get("RetailStockTransferLine_toItemId_fkey")).toBe("SET NULL");
  });

  it("tells the other site when a transfer is sent and when it is called off", async () => {
    const labels = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label
      FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'NotificationType'`;
    expect(labels.map((row) => row.label)).toEqual(
      expect.arrayContaining(["RETAIL_TRANSFER_SENT", "RETAIL_TRANSFER_CANCELLED"]),
    );
  });
});
