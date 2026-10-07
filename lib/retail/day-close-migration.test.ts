/**
 * Migration witness for `20261007210000_retail_day_close` (FLR-07).
 *
 * A site's trading day closes once: its figures frozen, the Z-reports taken
 * for its tills, the fiscal day it signed into and the cash banked. The books
 * gain a source for that cash moving from the vault to the bank.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";

type ColumnFacts = { column_name: string; data_type: string; udt_name: string; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

let shop: TestShop | undefined;
let userId = "";

beforeAll(async () => {
  shop = await makeTestShop(`day-close-witness-${Date.now()}`);
  userId = (await prisma.user.create({ data: { email: `closer-${Date.now()}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId: shop.companyId }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailDayClose.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("a closed day, as stored", () => {
  it("keeps the day, the frozen figures, the bank and slip, the fiscal day, the Z-reports and who closed it", async () => {
    const facts = await columns("RetailDayClose");
    expect(facts.get("businessDate")).toMatchObject({ data_type: "date", is_nullable: "NO" });
    for (const money of ["takings", "refunds", "cashDifference", "cashUsd", "cashZig", "banked"]) {
      expect(facts.get(money)).toMatchObject({ data_type: "numeric", numeric_precision: 14, numeric_scale: 2, is_nullable: "NO" });
    }
    expect(facts.get("tenders")).toMatchObject({ data_type: "jsonb", is_nullable: "NO" });
    expect(facts.get("bankAccountId")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("slipUrl")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("fiscalDayNo")).toMatchObject({ data_type: "integer", is_nullable: "YES" });
    expect(facts.get("zReportIds")).toMatchObject({ data_type: "ARRAY", udt_name: "_text" });
    expect(facts.get("closedAt")).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "NO" });
    expect(facts.get("closedById")).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(facts.get("closedByName")).toMatchObject({ data_type: "text", is_nullable: "NO" });
  });

  it("finds a company's closes by day", async () => {
    const [index] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'RetailDayClose_companyId_businessDate_idx'`;
    expect(index?.def).toMatch(/\("companyId", "businessDate"\)/);
  });

  it("closes one site's day once: a second close of the same site and day is refused", async () => {
    const day = new Date("2026-10-03T00:00:00Z");
    const row = {
      companyId: shop!.companyId,
      siteId: shop!.mainId,
      businessDate: day,
      takings: "3912.20",
      refunds: "27.90",
      cashDifference: "-4.50",
      cashUsd: "2610.00",
      cashZig: "4288.00",
      tenders: [],
      banked: "2610.00",
      closedById: userId,
      closedByName: "Tafara Nyathi",
    };
    await prisma.retailDayClose.create({ data: row });
    await expect(prisma.retailDayClose.create({ data: row })).rejects.toMatchObject({ code: "P2002" });
    const next = await prisma.retailDayClose.create({ data: { ...row, businessDate: new Date("2026-10-04T00:00:00Z") } });
    expect(next.zReportIds).toEqual([]);
  });

  it("has a books source for the cash banked", async () => {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'AccountingSourceType'`;
    expect(rows.map((row) => row.value)).toContain("RETAIL_DAY_BANKED");
  });
});
