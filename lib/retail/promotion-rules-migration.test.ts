/**
 * Migration witness for `20261008040000_retail_promotion_rules` (PRD-09, 20-products §3.4).
 *
 * A promotion's kinds take their new names, it says what it applies to, when
 * and for whom, and its state is the clock's (no stored status, no notes). A
 * sale line remembers the promotion that discounted it; lines of sales that
 * named a promotion code before this carry that promotion and their discount.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261008040000_retail_promotion_rules/migration.sql");

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function indexDef(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = ${name}`;
  return row?.def ?? null;
}

async function foreignKey(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
    SELECT rc.delete_rule AS rule, ccu.table_name AS target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${constraint}`;
  return row ?? null;
}

describe("promotion rules, as stored", () => {
  it("renames the kinds and adds scope and audience", async () => {
    expect(await enumLabels("RetailPromotionType")).toEqual(["PERCENT", "AMOUNT", "BUY_X_PAY", "FIXED_PRICE"]);
    expect(await enumLabels("RetailPromotionScope")).toEqual(["EVERYTHING", "CATEGORIES", "PRODUCTS"]);
    expect(await enumLabels("RetailPromotionAudience")).toEqual(["EVERYONE", "LOYALTY_MEMBERS", "STAFF"]);
  });

  it("gives a promotion its rules and its clock", async () => {
    expect(await column("RetailPromotion", "buyQuantity")).toMatchObject({ type: "int4", nullable: true });
    expect(await column("RetailPromotion", "scope")).toMatchObject({
      type: "RetailPromotionScope",
      nullable: false,
      fallback: "'EVERYTHING'::\"RetailPromotionScope\"",
    });
    expect(await column("RetailPromotion", "minBasket")).toMatchObject({ type: "numeric", nullable: true });
    expect(await column("RetailPromotion", "daysOfWeek")).toMatchObject({ type: "_int4", fallback: "ARRAY[]::integer[]" });
    expect(await column("RetailPromotion", "fromTime")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailPromotion", "toTime")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailPromotion", "audience")).toMatchObject({
      type: "RetailPromotionAudience",
      nullable: false,
      fallback: "'EVERYONE'::\"RetailPromotionAudience\"",
    });
    expect(await column("RetailPromotion", "stacks")).toMatchObject({ type: "bool", nullable: false, fallback: "false" });
    expect(await column("RetailPromotion", "startsAt")).toMatchObject({ type: "timestamp", nullable: false });
    for (const name of ["pausedAt", "endedAt"]) {
      expect(await column("RetailPromotion", name)).toMatchObject({ type: "timestamp", nullable: true });
    }
    expect(await indexDef("RetailPromotion_companyId_startsAt_idx")).toContain(`("companyId", "startsAt")`);
    expect(await foreignKey("RetailPromotion_siteId_fkey")).toEqual({ rule: "SET NULL", target: "Site" });
    expect(await foreignKey("RetailPromotion_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("keeps what it applies to in two tables", async () => {
    expect(await indexDef("RetailPromotionProduct_pkey")).toContain(`("promotionId", "productId")`);
    expect(await indexDef("RetailPromotionProduct_productId_idx")).toContain(`("productId")`);
    expect(await indexDef("RetailPromotionCategory_pkey")).toContain(`("promotionId", "categoryId")`);
    expect(await foreignKey("RetailPromotionProduct_promotionId_fkey")).toEqual({ rule: "CASCADE", target: "RetailPromotion" });
    expect(await foreignKey("RetailPromotionProduct_productId_fkey")).toEqual({ rule: "CASCADE", target: "Product" });
    expect(await foreignKey("RetailPromotionCategory_promotionId_fkey")).toEqual({ rule: "CASCADE", target: "RetailPromotion" });
    expect(await foreignKey("RetailPromotionCategory_categoryId_fkey")).toEqual({ rule: "CASCADE", target: "RetailCategory" });
  });

  it("gives a sale line its promotion and what the promotion took off", async () => {
    expect(await column("RetailSaleLine", "promotionId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailSaleLine", "promotionDiscount")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await indexDef("RetailSaleLine_companyId_promotionId_idx")).toContain(`("companyId", "promotionId")`);
    expect(await foreignKey("RetailSaleLine_promotionId_fkey")).toEqual({ rule: "SET NULL", target: "RetailPromotion" });
  });

  it("drops the stored status, the notes and the sale's promotion code", async () => {
    expect(await column("RetailPromotion", "status")).toBeNull();
    expect(await column("RetailPromotion", "notes")).toBeNull();
    expect(await column("RetailSale", "promotionCode")).toBeNull();
    expect(await enumLabels("RetailPromotionStatus")).toEqual([]);
  });
});

describe("promotions and sales from before the migration", () => {
  it("start when they were made, end when switched off, and lines carry the promotion their sale named", async () => {
    const backfill = readFileSync(MIGRATION, "utf8").split("-- Backfill")[1]?.split("-- End backfill")[0];
    expect(backfill).toBeTruthy();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `retail_promotion_rules_${process.pid}_${Date.now()}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE "RetailPromotion" (
          "id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "promoCode" TEXT NOT NULL, "status" TEXT NOT NULL,
          "startsAt" TIMESTAMP(3), "endedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL, "updatedAt" TIMESTAMP(3) NOT NULL
        );
        CREATE TABLE "RetailSale" ("id" TEXT PRIMARY KEY, "companyId" TEXT NOT NULL, "promotionCode" TEXT);
        CREATE TABLE "RetailSaleLine" (
          "id" TEXT PRIMARY KEY, "saleId" TEXT NOT NULL, "discountAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
          "promotionId" TEXT, "promotionDiscount" DECIMAL(14,2) NOT NULL DEFAULT 0
        );
        INSERT INTO "RetailPromotion" VALUES
          ('festive', 'shop', 'PROMO-FESTIVE', 'ACTIVE', NULL, NULL, '2026-09-02 00:00', '2026-09-03 08:00'),
          ('case', 'shop', 'PROMO-CASE', 'INACTIVE', '2026-07-14 00:00', NULL, '2026-07-01 00:00', '2026-09-12 21:00'),
          ('other', 'elsewhere', 'PROMO-FESTIVE', 'ACTIVE', '2026-08-01 00:00', NULL, '2026-08-01 00:00', '2026-08-01 00:00');
        INSERT INTO "RetailSale" VALUES ('s1', 'shop', 'PROMO-FESTIVE'), ('s2', 'shop', NULL), ('s3', 'shop', 'PROMO-GONE');
        INSERT INTO "RetailSaleLine" ("id", "saleId", "discountAmount") VALUES
          ('a', 's1', 2.00), ('b', 's1', 0), ('c', 's2', 1.50), ('d', 's3', 0.75);
      `);
      await client.query(`--${backfill}`);
      const promotions = await client.query<{ id: string; startsAt: string; endedAt: string | null }>(
        `SELECT "id", "startsAt"::text, "endedAt"::text FROM "RetailPromotion" ORDER BY "id"`,
      );
      expect(promotions.rows).toEqual([
        { id: "case", startsAt: "2026-07-14 00:00:00", endedAt: "2026-09-12 21:00:00" },
        { id: "festive", startsAt: "2026-09-02 00:00:00", endedAt: null },
        { id: "other", startsAt: "2026-08-01 00:00:00", endedAt: null },
      ]);
      const lines = await client.query<{ id: string; promotionId: string | null; promotionDiscount: string }>(
        `SELECT "id", "promotionId", "promotionDiscount"::text FROM "RetailSaleLine" ORDER BY "id"`,
      );
      expect(lines.rows).toEqual([
        { id: "a", promotionId: "festive", promotionDiscount: "2.00" },
        { id: "b", promotionId: "festive", promotionDiscount: "0.00" },
        { id: "c", promotionId: null, promotionDiscount: "0.00" },
        { id: "d", promotionId: null, promotionDiscount: "0.00" },
      ]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
});
