/**
 * Migration witness for `retail_product_fields` (PRD-03, 20-products 3.3).
 *
 * A product names its supplier and whether a case breaks at the till; every
 * price on a list keeps its history in `ProductPriceChange`, starting with one
 * ADDED row per price that existed; the shop's RETAIL list is the default list
 * by flag; "Was" is the history now, so `compareAtPrice` is gone; opening stock
 * has a source type and an Opening Balances role to post to.
 *
 * Read off the database, not the schema file; the backfill and the default
 * flag are run again on a fixture inside a transaction that is rolled back.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = join(process.cwd(), "prisma/migrations/20261006093513_retail_product_fields/migration.sql");

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<
    Array<{ type: string; nullable: string; fallback: string | null; precision: number | null; scale: number | null }>
  >`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback,
           numeric_precision AS precision, numeric_scale AS scale
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row
    ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback, precision: row.precision, scale: row.scale }
    : null;
}

/** The statement of the migration that starts with `prefix`, comments stripped. */
function statement(prefix: string): string {
  const sql = readFileSync(MIGRATION, "utf8");
  const found = sql
    .split(/;\s*\n/)
    .map((part) => part.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n").trim())
    .find((part) => part.startsWith(prefix));
  if (!found) throw new Error(`No statement starting ${prefix}`);
  return found;
}

/** Thrown to roll a re-run back once it has been looked at. */
class RolledBack extends Error {}

describe("a product's fields and its price history, as stored", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let companyId: string;

  beforeAll(async () => {
    companyId = (await prisma.company.create({ data: { name: `Product Fields ${stamp}`, slug: `product-fields-${stamp}` } })).id;
  });

  afterAll(async () => {
    await prisma.productPriceChange.deleteMany({ where: { companyId } });
    await prisma.productPrice.deleteMany({ where: { companyId } });
    await prisma.product.deleteMany({ where: { companyId } });
    await prisma.priceList.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  });

  it("adds opening stock's source type, the Opening Balances role and the price change sources", async () => {
    expect(await enumLabels("AccountingSourceType")).toContain("RETAIL_OPENING_STOCK");
    expect(await enumLabels("RetailAccountRole")).toContain("OPENING_BALANCES");
    expect(await enumLabels("RetailPriceChangeSource")).toEqual(["ADDED", "TYPED", "BULK", "FOLLOWED", "IMPORT", "REMOVED"]);
  });

  it("gives a product a supplier and a break-at-till switch, and drops the was-price", async () => {
    expect(await column("Product", "supplierId")).toMatchObject({ type: "text", nullable: true, fallback: null });
    expect(await column("Product", "breakAtTill")).toMatchObject({ type: "bool", nullable: false, fallback: "true" });
    expect(await column("Product", "compareAtPrice")).toBeNull();
    const [fk] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
      SELECT rc.delete_rule AS rule, ccu.table_name AS target
      FROM information_schema.referential_constraints rc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
      WHERE rc.constraint_name = 'Product_supplierId_fkey'`;
    expect(fk).toEqual({ rule: "SET NULL", target: "Vendor" });
    const [index] = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes WHERE tablename = 'Product' AND indexname = 'Product_supplierId_idx'`;
    expect(index?.name).toBe("Product_supplierId_idx");
  });

  it("keeps each price change with its list, product, prices, source and times", async () => {
    expect(await column("ProductPriceChange", "minQuantity")).toMatchObject({ type: "numeric", nullable: false, precision: 12, scale: 4 });
    expect(await column("ProductPriceChange", "fromPrice")).toMatchObject({ type: "numeric", nullable: true, precision: 14, scale: 2 });
    expect(await column("ProductPriceChange", "toPrice")).toMatchObject({ type: "numeric", nullable: true, precision: 14, scale: 2 });
    expect(await column("ProductPriceChange", "source")).toMatchObject({ type: "RetailPriceChangeSource", nullable: false });
    expect(await column("ProductPriceChange", "batchId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("ProductPriceChange", "effectiveAt")).toMatchObject({ type: "timestamp", nullable: false });
    expect(await column("ProductPriceChange", "appliedAt")).toMatchObject({ type: "timestamp", nullable: true });
    expect(await column("ProductPriceChange", "cancelledAt")).toMatchObject({ type: "timestamp", nullable: true });
    expect(await column("ProductPriceChange", "createdById")).toMatchObject({ type: "text", nullable: true });
    const fks = await prisma.$queryRaw<Array<{ name: string; rule: string }>>`
      SELECT constraint_name AS name, delete_rule AS rule FROM information_schema.referential_constraints
      WHERE constraint_name LIKE 'ProductPriceChange_%' ORDER BY constraint_name`;
    expect(Object.fromEntries(fks.map((fk) => [fk.name, fk.rule]))).toEqual({
      ProductPriceChange_companyId_fkey: "CASCADE",
      ProductPriceChange_createdById_fkey: "SET NULL",
      ProductPriceChange_priceListId_fkey: "CASCADE",
      ProductPriceChange_productId_fkey: "CASCADE",
    });
    const indexes = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT indexname AS name FROM pg_indexes WHERE tablename = 'ProductPriceChange' AND indexname <> 'ProductPriceChange_pkey'
      ORDER BY indexname`;
    expect(indexes.map((index) => index.name)).toEqual([
      "ProductPriceChange_appliedAt_effectiveAt_idx",
      "ProductPriceChange_batchId_idx",
      "ProductPriceChange_companyId_productId_appliedAt_idx",
      "ProductPriceChange_priceListId_productId_appliedAt_idx",
    ]);
  });

  it("backfills one ADDED change per price on a list, and flags the RETAIL list as the default", async () => {
    const list = await prisma.priceList.create({
      data: { companyId, name: "Shelf prices", kind: "RETAIL", isActive: true, isDefault: false },
    });
    const products = await Promise.all(
      ["A", "B", "C"].map((code, index) =>
        prisma.product.create({ data: { companyId, code: `PF-${code}-${stamp}`, name: `Product ${code}`, standardPrice: index + 1 } }),
      ),
    );
    await prisma.productPrice.createMany({
      data: products.map((product, index) => ({ companyId, priceListId: list.id, productId: product.id, unitPrice: index + 1.5 })),
    });

    let changes: Array<{ productId: string; source: string; fromPrice: unknown; toPrice: unknown; same: boolean }> = [];
    let isDefault = false;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(statement('INSERT INTO "ProductPriceChange"'));
        await tx.$executeRawUnsafe(statement('UPDATE "PriceList"'));
        const rows = await tx.productPriceChange.findMany({ where: { companyId } });
        changes = rows.map((row) => ({
          productId: row.productId,
          source: row.source,
          fromPrice: row.fromPrice,
          toPrice: Number(row.toPrice),
          same: row.effectiveAt.getTime() === row.appliedAt?.getTime(),
        }));
        isDefault = (await tx.priceList.findUniqueOrThrow({ where: { id: list.id } })).isDefault;
        throw new RolledBack();
      }),
    ).rejects.toBeInstanceOf(RolledBack);

    expect(changes).toHaveLength(await prisma.productPrice.count({ where: { companyId } }));
    expect(changes.every((change) => change.source === "ADDED" && change.fromPrice === null && change.same)).toBe(true);
    expect(changes.map((change) => change.toPrice).sort()).toEqual([1.5, 2.5, 3.5]);
    expect(isDefault).toBe(true);
  });
});
