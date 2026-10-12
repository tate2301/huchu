/**
 * Migration witness for `20261012130300_retail_loyalty` (CUS-01, 60-customers §3.2).
 *
 * The settings row with the board's defaults, the points ledger with its
 * `seq` sequence and indexes, the three enums, and the data step: each posted
 * sale for a customer earned a point a whole dollar, each "LOYALTY_REDEEM:<n>"
 * note spent its points, and no note keeps the marker. Read off the database.
 */

import { readFileSync } from "node:fs";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop } from "@/lib/retail/products/test-fixtures";

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

const made: string[] = [];
afterAll(async () => {
  for (const companyId of made) {
    await prisma.retailSale.deleteMany({ where: { companyId } });
    await destroyProvisionedTenant(companyId);
  }
});

describe("loyalty, as stored", () => {
  it("adds the expiry, kind and reason enums", async () => {
    expect(await enumLabels("RetailPointsExpiry")).toEqual(["NEVER", "AFTER_12_MONTHS"]);
    expect(await enumLabels("RetailPointsKind")).toEqual(["EARNED", "SPENT", "ADJUSTED", "BIRTHDAY", "EXPIRED", "REVERSED"]);
    expect(await enumLabels("RetailPointsReason")).toEqual(["MISSED_AT_TILL", "COMPLAINT", "BIRTHDAY", "CORRECTION"]);
  });

  it("keeps the scheme's settings with the board's defaults", async () => {
    expect(await column("RetailLoyaltySettings", "enabled")).toMatchObject({ type: "bool", fallback: "true" });
    expect(await column("RetailLoyaltySettings", "earnPerDollar")).toMatchObject({ type: "numeric", fallback: "1" });
    expect(await column("RetailLoyaltySettings", "pointValue")).toMatchObject({ type: "numeric", fallback: "0.01" });
    expect(await column("RetailLoyaltySettings", "spendFrom")).toMatchObject({ type: "int4", fallback: "500" });
    expect(await column("RetailLoyaltySettings", "expiry")).toMatchObject({ fallback: `'AFTER_12_MONTHS'::"RetailPointsExpiry"` });
    expect((await column("RetailLoyaltySettings", "tiers"))?.fallback).toContain(`{"from": "1500.00", "name": "Gold"}`);
    expect(await column("RetailLoyaltySettings", "topTierEarnPerDollar")).toMatchObject({ type: "numeric", fallback: "1.5" });
    expect(await column("RetailLoyaltySettings", "birthdayPoints")).toMatchObject({ type: "int4", fallback: "200" });
    for (const name of ["earnOnPromotions", "birthdayBonus", "pointsPayForAlcohol"]) {
      expect(await column("RetailLoyaltySettings", name)).toMatchObject({ type: "bool", nullable: false, fallback: "true" });
    }
  });

  it("creates the ledger with its sequence and indexes", async () => {
    expect(await column("RetailPointsEntry", "seq")).toMatchObject({ type: "int8", nullable: false });
    expect((await column("RetailPointsEntry", "seq"))?.fallback).toContain("nextval");
    expect(await column("RetailPointsEntry", "points")).toMatchObject({ type: "int4", nullable: false });
    expect(await column("RetailPointsEntry", "value")).toMatchObject({ type: "numeric", nullable: false, fallback: "0" });
    expect(await column("RetailPointsEntry", "kind")).toMatchObject({ type: "RetailPointsKind", nullable: false });
    expect(await column("RetailPointsEntry", "reason")).toMatchObject({ type: "RetailPointsReason", nullable: true });
    expect(await indexDef("RetailPointsEntry_companyId_customerId_createdAt_idx")).toContain(`("companyId", "customerId", "createdAt")`);
    expect(await indexDef("RetailPointsEntry_companyId_kind_createdAt_idx")).toContain(`("companyId", kind, "createdAt")`);
    expect(await indexDef("RetailPointsEntry_saleId_idx")).toContain(`("saleId")`);
  });

  it("writes the ledger from the sales and strips the marker, as the data step does", async () => {
    const shop = await makeTestShop("Loyalty ledger");
    made.push(shop.companyId);
    const customer = await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa Marange" } });
    const sale = (saleNo: string, total: string, notes: string | null, customerId: string | null = customer.id) =>
      prisma.retailSale.create({
        data: {
          companyId: shop.companyId,
          saleNo,
          siteId: shop.mainId,
          customerId,
          cashierName: "Chipo",
          totalAmount: total,
          baseAmount: total,
          notes,
          postedAt: new Date(),
        },
        select: { id: true },
      });
    const earned = await sale("SALE-00001", "20.50", null);
    const spent = await sale("SALE-00002", "0.00", "Paid by card | LOYALTY_REDEEM:500");
    // A walk-in's redemption has nobody to charge: no row, but its note is cleaned all the same.
    const alone = await sale("SALE-00003", "0.00", "LOYALTY_REDEEM:20", null);

    const sql = readFileSync(`${process.cwd()}/prisma/migrations/20261012130300_retail_loyalty/migration.sql`, "utf8");
    const data = sql.slice(sql.indexOf(`INSERT INTO "RetailPointsEntry"`));
    const scope = `'${shop.companyId}'`;
    const insert = data
      .slice(0, data.indexOf("ORDER BY moved"))
      .replace(`WHERE moved."points" <> 0`, `WHERE moved."points" <> 0 AND moved."companyId" = ${scope}`);
    await prisma.$executeRawUnsafe(`${insert} ORDER BY moved."at", moved."saleId", moved."step"`);
    const strip = data.slice(data.indexOf(`UPDATE "RetailSale"`)).replace(/;\s*$/, "");
    await prisma.$executeRawUnsafe(`${strip} AND "companyId" = ${scope}`);

    const entries = await prisma.retailPointsEntry.findMany({ where: { customerId: customer.id }, orderBy: { seq: "asc" } });
    expect(entries.find((entry) => entry.saleId === earned.id)).toMatchObject({ kind: "EARNED", points: 20, actorName: "Chipo" });
    expect(entries.find((entry) => entry.saleId === spent.id)).toMatchObject({ kind: "SPENT", points: -500 });
    expect(entries.find((entry) => entry.saleId === spent.id)?.value.toFixed(2)).toBe("5.00");
    expect(entries.reduce((sum, entry) => sum + entry.points, 0)).toBe(-480);
    const notes = await prisma.retailSale.findMany({ where: { companyId: shop.companyId }, select: { id: true, notes: true } });
    expect(notes.find((row) => row.id === spent.id)?.notes).toBe("Paid by card");
    expect(notes.find((row) => row.id === alone.id)?.notes).toBeNull();
    expect(notes.some((row) => row.notes?.includes("LOYALTY_REDEEM"))).toBe(false);
  });
});
