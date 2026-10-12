/**
 * A count's history (STK-06: the record's chart and the review aside),
 * against a real Postgres: the approved counts at its site that share a
 * line with it, valued on the shared lines only, and itself last at its
 * current net; counts that share nothing are left out. Only roles that see
 * cost get it, and the rail says the owner approves a net over the limit.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { approveCount } from "./count-review";
import { countHistory, loadCountView, saveCountLine, startCount, submitCount, type CountGrants } from "./counts";

let shop: TestShop;
const line: Record<string, string> = {};
const MANAGER: CountGrants = { view: true, update: true, approve: true, seeCost: true };
const CLERK: CountGrants = { view: true, update: true, approve: false, seeCost: false };

async function counted(figures: Record<string, string>): Promise<{ id: string; countNo: string }> {
  const keys = Object.keys(figures);
  const started = await startCount(shop.manager(), {
    scope: "PRODUCTS",
    lineIds: keys.map((key) => line[key]!),
    siteId: shop.mainId,
    counterId: shop.managerId,
    blind: false,
    keepSelling: true,
  });
  for (const key of keys) {
    const row = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: started.id, inventoryItemId: line[key]! } });
    await saveCountLine(shop.manager(), MANAGER, started.id, row.id, figures[key]!);
  }
  await submitCount(shop.manager(), MANAGER, started.id);
  return started;
}

beforeAll(async () => {
  shop = await makeTestShop("CountHistory");
  const add = async (key: string, name: string, cost: string, onHand: number) => {
    line[key] = (await addTestProduct(shop.companyId, { name, price: "20.00", cost }, { onHand })).itemId;
  };
  await add("gin", "Gordon’s Gin 750ml", "12.40", 22);
  await add("wine", "Nederburg Cabernet 750ml", "9.40", 18);
  await add("jw", "Johnnie Walker Black 750ml", "33.60", 10);
  await add("amarula", "Amarula Cream 750ml", "13.03", 13);
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailStockCount.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("a count's history", () => {
  it("values earlier counts on the lines they share with it, and leaves out the ones that share none", async () => {
    const first = await counted({ gin: "21", wine: "17" });
    await approveCount(shop.manager(), first.id);
    const second = await counted({ wine: "15", jw: "9" });
    await approveCount(shop.manager(), second.id);
    const other = await counted({ amarula: "12" });
    await approveCount(shop.manager(), other.id);
    const now = await counted({ gin: "19", wine: "16" });

    const history = await countHistory(shop.companyId, { id: now.id, siteId: shop.mainId });
    expect(history.map((point) => [point.countNo, point.difference])).toEqual([
      [first.countNo, -21.8],
      // Johnnie Walker is not on this count: only the wine's −US$18.80 is.
      [second.countNo, -18.8],
      [now.countNo, -15.4],
    ]);

    const view = await loadCountView(shop.manager(), MANAGER, now.id);
    expect(view.history).toEqual(history);
    expect(view.approves).toBe("A manager");
    expect((await loadCountView(shop.manager(), CLERK, now.id)).history).toEqual([]);
  });

  it("says the owner approves a net over the limit", async () => {
    const big = await counted({ jw: "5" });
    expect((await loadCountView(shop.manager(), MANAGER, big.id)).approves).toBe("The owner");
  });
});
