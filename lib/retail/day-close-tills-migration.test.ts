/**
 * Migration witness for `20261007230000_retail_day_close_tills` (FLR-07).
 *
 * A closed day keeps its tills table as it stood, beside the totals it froze,
 * so a void rung after the close moves no row under the frozen Σ.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";

let shop: TestShop | undefined;
let userId = "";

beforeAll(async () => {
  shop = await makeTestShop(`day-close-tills-witness-${Date.now()}`);
  userId = (await prisma.user.create({ data: { email: `closer-${Date.now()}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId: shop.companyId }, select: { id: true } })).id;
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailDayClose.deleteMany({ where: { companyId: shop.companyId } });
  await destroyProvisionedTenant(shop.companyId);
});

describe("a closed day's tills, as stored", () => {
  it("is a required jsonb column with no default", async () => {
    const [column] = await prisma.$queryRaw<Array<{ data_type: string; is_nullable: string; column_default: string | null }>>`
      SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'RetailDayClose' AND column_name = 'tills'`;
    expect(column).toEqual({ data_type: "jsonb", is_nullable: "NO", column_default: null });
  });

  it("gives back the rows written at the close", async () => {
    const tills = [
      { key: "r1", name: "Front till", cashier: "Chipo Dube", registerCode: "FRONT", registerId: "r1", state: "closed", closedAt: "2026-10-03T19:58:00.000Z", openShiftId: null, takings: "1904.40", refunds: "27.90", difference: "0.00" },
    ];
    const close = await prisma.retailDayClose.create({
      data: {
        companyId: shop!.companyId,
        siteId: shop!.mainId,
        businessDate: new Date("2026-10-03T00:00:00Z"),
        takings: "1904.40",
        refunds: "27.90",
        cashDifference: "0.00",
        cashUsd: "1904.40",
        cashZig: "0.00",
        tenders: [],
        tills,
        banked: "0.00",
        closedById: userId,
        closedByName: "Tafara Nyathi",
      },
    });
    expect((await prisma.retailDayClose.findUniqueOrThrow({ where: { id: close.id } })).tills).toEqual(tills);
  });
});
