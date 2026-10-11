/**
 * Approving a count's differences (30-stock W-22 steps 3–4, STK-06), against
 * a real Postgres: each differing line moves today's on hand by its
 * difference (so a sale during the count stays sold), as a COUNT movement
 * under the count's number; the net posts once, Dr Breakage and losses /
 * Cr Stock, and a count that matched posts nothing; a net over the owner's
 * limit, either way, waits for the owner; two approvals at once approve it
 * once; cancel moves nothing; recount sends lines back; and the bulk answer
 * names what was approved, what waits and what was skipped.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { approveCount, approveCounts, cancelCount, OwnerNeeded, recountLines } from "./count-review";
import { CountRefusal, loadCountLines, saveCountLine, startCount, submitCount, type CountGrants } from "./counts";

let shop: TestShop;
let rudoId: string;
const line: Record<string, string> = {};

const rudo = () => ({ companyId: shop.companyId, userId: rudoId, userName: "Rudo Moyo", userRole: "STOCK_CLERK" });
const CLERK: CountGrants = { view: true, update: true, approve: false, seeCost: false };
const onHand = async (key: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: line[key]! } })).currentStock.toNumber();
const setOnHand = (key: string, n: number) => prisma.inventoryItem.update({ where: { id: line[key]! }, data: { currentStock: n } });

async function refusal(promise: Promise<unknown>): Promise<CountRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CountRefusal) return error;
    throw error;
  }
  throw new Error("It went through.");
}

/** A count of these lines, counted by Rudo with these figures and sent for review. */
async function countToApprove(figures: Record<string, string>): Promise<{ id: string; countNo: string }> {
  const keys = Object.keys(figures);
  const started = await startCount(shop.manager(), {
    scope: "PRODUCTS",
    lineIds: keys.map((key) => line[key]!),
    siteId: shop.mainId,
    counterId: rudoId,
    blind: true,
    keepSelling: true,
  });
  for (const key of keys) {
    const row = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: started.id, inventoryItemId: line[key]! } });
    await saveCountLine(rudo(), CLERK, started.id, row.id, figures[key]!);
  }
  await submitCount(rudo(), CLERK, started.id);
  return { id: started.id, countNo: started.countNo };
}

const movementsOf = (countNo: string) =>
  prisma.stockMovement.findMany({
    where: { reference: countNo, reason: "COUNT", item: { site: { companyId: shop.companyId } } },
    orderBy: { createdAt: "asc" },
  });

const entriesFor = (countId: string) =>
  prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType: "RETAIL_STOCK_ADJUSTMENT", sourceId: countId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });

const sides = (lines: Array<{ debit: number; credit: number; account: { code: string } }>) =>
  lines.map((entry) => ({ code: entry.account.code, debit: entry.debit, credit: entry.credit })).sort((a, b) => a.code.localeCompare(b.code));

beforeAll(async () => {
  shop = await makeTestShop("CountApprove");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  rudoId = (
    await prisma.user.create({
      data: { email: `rudo-${shop.companyId}@shop.test`, name: "Rudo Moyo", role: "STOCK_CLERK", companyId: shop.companyId },
      select: { id: true },
    })
  ).id;
  const add = async (key: string, name: string, cost: string, onHandNow: number) => {
    line[key] = (await addTestProduct(shop.companyId, { name, price: "20.00", cost }, { onHand: onHandNow })).itemId;
  };
  await add("gin", "Gordon’s Gin 750ml", "12.40", 22);
  await add("wine", "Nederburg Cabernet 750ml", "9.40", 18);
  await add("bols", "Bols Brandy 50ml", "1.20", 6);
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
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("approving the differences", () => {
  it("moves today's on hand by each difference, under the count's number, and posts the net once", async () => {
    const count = await countToApprove({ gin: "20", wine: "16", bols: "8" });
    // A sale after Gordon's was counted: 22 expected then, 21 on hand now.
    const { unit } = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: line.gin! }, select: { unit: true } });
    await recordStockMovement({
      companyId: shop.companyId,
      userId: shop.managerId,
      itemId: line.gin!,
      movementType: "ISSUE",
      quantity: 1,
      unit,
      reason: "SALE",
      reference: "SALE-1",
      sourceType: "RETAIL_SALE",
    });
    expect(await onHand("gin")).toBe(21);

    const approved = await approveCount(shop.manager(), count.id);
    expect(approved.differenceValue).toBe(-41.2);
    expect(await onHand("gin")).toBe(19);
    expect(await onHand("wine")).toBe(16);
    expect(await onHand("bols")).toBe(8);

    const movements = await movementsOf(count.countNo);
    expect(movements).toHaveLength(3);
    for (const movement of movements) {
      expect(movement).toMatchObject({ movementType: "ADJUSTMENT", reason: "COUNT", reference: count.countNo, sourceType: "RETAIL_STOCK_ADJUSTMENT" });
      expect(movement.sourceId!.startsWith(`${count.id}:`)).toBe(true);
    }
    expect(movements.map((movement) => movement.notes).sort()).toEqual(["Found", "Not known", "Not known"]);
    // The money invariant: Σ change × cost is the net, to the cent.
    const costs = await prisma.retailStockCountLine.findMany({ where: { countId: count.id }, select: { inventoryItemId: true, unitCost: true } });
    const cost = new Map(costs.map((row) => [row.inventoryItemId, row.unitCost.toNumber()]));
    const total = movements.reduce((sum, movement) => sum + Math.round(movement.change.toNumber() * cost.get(movement.itemId)! * 100), 0) / 100;
    expect(total).toBe(-41.2);

    const saved = await prisma.retailStockCount.findUniqueOrThrow({ where: { id: count.id } });
    expect(saved).toMatchObject({ status: "APPROVED", approvedById: shop.managerId });
    expect(saved.differenceValue?.toNumber()).toBe(-41.2);
    expect(saved.shortValue?.toNumber()).toBe(-43.6);
    expect(saved.overValue?.toNumber()).toBe(2.4);
    const audit = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: count.id, eventType: "RETAIL_STOCK_COUNT.APPROVED" } });
    expect(JSON.parse(audit.payloadJson ?? "{}")).toMatchObject({ lines: 3, differ: 3, net: "-41.20", short: "-43.60", over: "2.40" });

    await runRetailPosting(shop.companyId, "BY_HAND", shop.manager());
    const entries = await entriesFor(count.id);
    expect(entries).toHaveLength(1);
    expect(sides(entries[0]!.lines)).toEqual([
      { code: "1200", debit: 0, credit: 41.2 },
      { code: "5410", debit: 41.2, credit: 0 },
    ]);
  });

  it("posts nothing when every line matched", async () => {
    const count = await countToApprove({ amarula: "13" });
    const approved = await approveCount(shop.manager(), count.id);
    expect(approved).toMatchObject({ differenceValue: 0, accountingStatus: null });
    expect(await movementsOf(count.countNo)).toHaveLength(0);
    await runRetailPosting(shop.companyId, "BY_HAND", shop.manager());
    expect(await entriesFor(count.id)).toHaveLength(0);
    expect(await prisma.accountingIntegrationEvent.count({ where: { companyId: shop.companyId, sourceId: count.id } })).toBe(0);
  });

  it("refuses a second approval: it is not waiting any more", async () => {
    const count = await countToApprove({ amarula: "12" });
    await approveCount(shop.manager(), count.id);
    const second = await refusal(approveCount(shop.manager(), count.id));
    expect(second.status).toBe(409);
    expect(second.message).toBe("This count is not waiting for approval.");
    expect(await movementsOf(count.countNo)).toHaveLength(1);
  });

  it("approves once when two approve at the same moment", async () => {
    await setOnHand("amarula", 13);
    const count = await countToApprove({ amarula: "11" });
    const results = await Promise.allSettled([approveCount(shop.manager(), count.id), approveCount(shop.owner(), count.id)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failed = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(CountRefusal);
    expect((failed.reason as CountRefusal).status).toBe(409);
    expect(await movementsOf(count.countNo)).toHaveLength(1);
    expect(await onHand("amarula")).toBe(11);
  });

  it("refuses the whole approval when a line sold more since it was counted than the count found", async () => {
    await setOnHand("bols", 3);
    await setOnHand("amarula", 13);
    const count = await countToApprove({ bols: "1", amarula: "12" });
    await setOnHand("bols", 1);
    const refused = await refusal(approveCount(shop.manager(), count.id));
    expect(refused.status).toBe(409);
    expect(refused.message).toBe("Bols Brandy 50ml sold more since it was counted than the count found. Recount it.");
    expect(await onHand("bols")).toBe(1);
    expect(await onHand("amarula")).toBe(13);
    expect((await prisma.retailStockCount.findUniqueOrThrow({ where: { id: count.id } })).status).toBe("TO_APPROVE");
    await cancelCount(shop.manager(), count.id);
  });
});

describe("the owner's limit", () => {
  it("refuses a manager over US$100.00 either way, tells the owner, and lets the owner", async () => {
    for (const figure of ["5", "15"]) {
      await setOnHand("jw", 10);
      const count = await countToApprove({ jw: figure });
      const refused = await refusal(approveCount(shop.manager(), count.id));
      expect(refused).toBeInstanceOf(OwnerNeeded);
      expect(refused.status).toBe(403);
      expect(refused.message).toBe("Over US$100.00 needs the owner. Tendai Mhlanga has been told.");
      expect(await onHand("jw")).toBe(10);
      expect(await movementsOf(count.countNo)).toHaveLength(0);
      const told = await prisma.notification.findFirstOrThrow({
        where: { companyId: shop.companyId, title: `${count.countNo} needs the owner` },
        include: { recipients: { select: { userId: true } } },
      });
      expect(told.recipients.map((recipient) => recipient.userId)).toEqual([shop.ownerId]);

      const approved = await approveCount(shop.owner(), count.id);
      expect(Math.abs(approved.differenceValue)).toBe(168);
      expect(await onHand("jw")).toBe(Number(figure));
    }
  });
});

describe("cancel and recount", () => {
  it("cancels without moving anything on hand, and an approved count cannot be cancelled", async () => {
    await setOnHand("amarula", 13);
    const count = await countToApprove({ amarula: "10" });
    expect(await cancelCount(shop.manager(), count.id)).toEqual({ status: "CANCELLED", countNo: count.countNo });
    expect(await onHand("amarula")).toBe(13);
    expect(await movementsOf(count.countNo)).toHaveLength(0);
    expect((await refusal(approveCount(shop.manager(), count.id))).status).toBe(409);

    const done = await countToApprove({ amarula: "13" });
    await approveCount(shop.manager(), done.id);
    const refused = await refusal(cancelCount(shop.manager(), done.id));
    expect(refused).toMatchObject({ status: 409, message: "Approved counts cannot be cancelled." });
  });

  it("sends the ticked lines back: their figures go, the count is counting, and the phone shows only them", async () => {
    await setOnHand("gin", 22);
    await setOnHand("wine", 18);
    const count = await countToApprove({ gin: "20", wine: "17" });
    const gin = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: count.id, inventoryItemId: line.gin! } });
    expect(await recountLines(shop.manager(), count.id, [gin.id])).toEqual({ lines: 1, counter: "Rudo Moyo" });

    const after = await prisma.retailStockCountLine.findUniqueOrThrow({ where: { id: gin.id } });
    expect(after).toMatchObject({ counted: null, countedAt: null, expectedAtCount: null, difference: null, recount: true });
    const head = await prisma.retailStockCount.findUniqueOrThrow({ where: { id: count.id } });
    expect(head).toMatchObject({ status: "COUNTING", submittedAt: null });
    const phone = await loadCountLines(rudo(), CLERK, count.id);
    expect(phone.lines.map((row) => row.product)).toEqual(["Gordon’s Gin 750ml"]);
    expect(await prisma.notification.count({ where: { companyId: shop.companyId, title: `${count.countNo} to count again` } })).toBe(1);

    // Not waiting for approval now.
    expect((await refusal(recountLines(shop.manager(), count.id, undefined))).status).toBe(409);
    await cancelCount(shop.manager(), count.id);
  });
});

describe("approving many from Counts", () => {
  it("names the counts approved, the ones waiting for the owner and the ones skipped", async () => {
    await setOnHand("amarula", 13);
    await setOnHand("jw", 10);
    const small = await countToApprove({ amarula: "12" });
    const big = await countToApprove({ jw: "6" });
    const counting = await startCount(shop.manager(), {
      scope: "PRODUCTS",
      lineIds: [line.bols!],
      siteId: shop.mainId,
      counterId: rudoId,
      blind: true,
      keepSelling: true,
    });
    const answer = await approveCounts(shop.manager(), [small.id, big.id, counting.id]);
    expect(answer).toEqual({ approved: [small.countNo], waiting: [big.countNo], skipped: [counting.countNo] });
    expect(await onHand("amarula")).toBe(12);
    expect(await onHand("jw")).toBe(10);
    await cancelCount(shop.manager(), big.id);
    await cancelCount(shop.manager(), counting.id);
  });
});
