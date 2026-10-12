/**
 * Reviewing a count while other things happen to it (STK-06 fix pass),
 * against a real Postgres: an approver's correction racing the approval
 * lands before the approval reads the lines (or is refused), so what moved
 * is each line's difference and the approved net is the lines' sum; a Why
 * set while the approval commits is refused, not written onto an approved
 * line; the record PDF keeps a blind count's expected figures from its
 * counter while they count; and a bulk approval that breaks partway names
 * what went through and what did not.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { recordPdfType } from "@/lib/retail/record-pdf";

import { approveCount, approveCounts, cancelCount, countIdsInput, countPatch, setLineWhy } from "./count-review";
import { NOT_WAITING } from "./count-words";
import { CLOSED, CountRefusal, saveCountLine, startCount, submitCount, type CountGrants } from "./counts";

let shop: TestShop;
let rudoId: string;
const item: Record<string, string> = {};

const rudo = () => ({ companyId: shop.companyId, userId: rudoId, userName: "Rudo Moyo", userRole: "STOCK_CLERK" });
const CLERK: CountGrants = { view: true, update: true, approve: false, seeCost: false };
const MANAGER: CountGrants = { view: true, update: true, approve: true, seeCost: true };
const onHand = async (key: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item[key]! } })).currentStock.toNumber();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function countToApprove(figures: Record<string, string>): Promise<{ id: string; countNo: string }> {
  const keys = Object.keys(figures);
  const started = await startCount(shop.manager(), {
    scope: "PRODUCTS",
    lineIds: keys.map((key) => item[key]!),
    siteId: shop.mainId,
    counterId: rudoId,
    blind: true,
    keepSelling: true,
  });
  for (const key of keys) {
    const row = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: started.id, inventoryItemId: item[key]! } });
    await saveCountLine(rudo(), CLERK, started.id, row.id, figures[key]!);
  }
  await submitCount(rudo(), CLERK, started.id);
  return { id: started.id, countNo: started.countNo };
}

/** Holds a stock line's lock, as a sale would, until `release` is called. */
function holdStockLine(key: string): { release: () => void; done: Promise<unknown> } {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const done = prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "InventoryItem" WHERE "id" = ${item[key]} FOR UPDATE`;
      await held;
    },
    { timeout: 30_000 },
  );
  return { release, done };
}

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );

beforeAll(async () => {
  shop = await makeTestShop("CountReviewRaces");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  rudoId = (
    await prisma.user.create({
      data: { email: `rudo-${shop.companyId}@shop.test`, name: "Rudo Moyo", role: "STOCK_CLERK", companyId: shop.companyId },
      select: { id: true },
    })
  ).id;
  item.gin = (await addTestProduct(shop.companyId, { name: "Gordon’s Gin 750ml", price: "20.00", cost: "12.40" }, { onHand: 22 })).itemId;
  item.wine = (await addTestProduct(shop.companyId, { name: "Nederburg Cabernet 750ml", price: "20.00", cost: "9.40" }, { onHand: 18 })).itemId;
}, 120_000);

afterAll(async () => {
  vi.restoreAllMocks();
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

describe("a correction racing the approval", () => {
  it("lands before the approval reads the lines: what moved is each line's difference, and the net is the lines' sum", async () => {
    const count = await countToApprove({ gin: "20", wine: "16" });
    const ginLine = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: count.id, inventoryItemId: item.gin! } });
    const ginBefore = await onHand("gin");
    const wineBefore = await onHand("wine");

    // A sale holds the gin line: the correction (Counted 20 → 22, on blur)
    // is under way when "Approve and adjust" is sent.
    const sale = holdStockLine("gin");
    await sleep(200);
    const correction = settle(saveCountLine(shop.manager(), MANAGER, count.id, ginLine.id, "22"));
    await sleep(300);
    const approval = settle(approveCount(shop.manager(), count.id));
    await sleep(500);
    sale.release();
    await sale.done;
    const [corrected, approved] = await Promise.all([correction, approval]);
    expect(corrected.ok).toBe(true);
    expect(approved.ok).toBe(true);

    const saved = await prisma.retailStockCount.findUniqueOrThrow({ where: { id: count.id }, include: { lines: true } });
    const moves = await prisma.stockMovement.findMany({ where: { reference: count.countNo, reason: "COUNT" } });
    expect(saved.status).toBe("APPROVED");
    expect(saved.lines.find((row) => row.id === ginLine.id)?.difference?.toNumber()).toBe(0);
    for (const row of saved.lines) {
      const moved = moves.filter((move) => move.itemId === row.inventoryItemId).reduce((sum, move) => sum + move.change.toNumber(), 0);
      expect(moved).toBe(row.difference?.toNumber() ?? 0);
    }
    const lineNet = saved.lines.reduce((sum, row) => sum + Math.round((row.difference?.toNumber() ?? 0) * row.unitCost.toNumber() * 100), 0) / 100;
    expect(saved.differenceValue?.toNumber()).toBe(lineNet);
    expect(lineNet).toBe(-18.8);
    expect(await onHand("gin")).toBe(ginBefore);
    expect(await onHand("wine")).toBe(wineBefore - 2);
  });

  it("is refused once the count is approved", async () => {
    const count = await countToApprove({ wine: "15" });
    const wineLine = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: count.id } });
    await approveCount(shop.manager(), count.id);
    const refused = await saveCountLine(shop.manager(), MANAGER, count.id, wineLine.id, "16").catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(CountRefusal);
    expect((refused as CountRefusal).message).toBe(CLOSED);
  });
});

describe("a Why racing the approval", () => {
  it("waits for the approval's lock and is refused, so the line never reads differently from its movement", async () => {
    const count = await countToApprove({ wine: "12" });
    const wineLine = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: count.id } });
    // The approval holds the count and waits on the wine line while the Why is set.
    const sale = holdStockLine("wine");
    await sleep(200);
    const approval = settle(approveCount(shop.manager(), count.id));
    await sleep(300);
    const why = settle(setLineWhy(shop.manager(), count.id, wineLine.id, "BROKEN"));
    await sleep(300);
    sale.release();
    await sale.done;
    const [approved, said] = await Promise.all([approval, why]);
    expect(approved.ok).toBe(true);
    expect(said.ok).toBe(false);
    expect(said.ok ? null : (said.error as CountRefusal).message).toBe(NOT_WAITING);
    const saved = await prisma.retailStockCountLine.findUniqueOrThrow({ where: { id: wineLine.id } });
    expect(saved.why).toBeNull();
  });
});

describe("the record PDF of a blind count", () => {
  it("shows its counter, while counting, what they counted and nothing to compare it with", async () => {
    const started = await startCount(shop.manager(), {
      scope: "PRODUCTS",
      lineIds: [item.wine!],
      siteId: shop.mainId,
      counterId: rudoId,
      blind: true,
      keepSelling: true,
    });
    const wineLine = await prisma.retailStockCountLine.findFirstOrThrow({ where: { countId: started.id } });
    await saveCountLine(rudo(), CLERK, started.id, wineLine.id, "7");
    const render = recordPdfType("RetailStockCount")!.render;

    const asCounter = await render({ companyId: shop.companyId, userId: rudoId, role: "STOCK_CLERK", seesEveryDrawer: false }, started.id, null);
    const counterHtml = (asCounter as { content: string }).content;
    expect(counterHtml).not.toContain("Expected");
    expect(counterHtml).not.toContain("Difference");
    expect(counterHtml).not.toContain("Differ");
    expect(counterHtml).not.toContain(`<td class="num mono">${await onHand("wine")}</td>`);
    expect(counterHtml).toContain('<td class="num mono">7</td>');

    // Anyone else sees the figures to compare.
    const asManager = await render({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER", seesEveryDrawer: true }, started.id, null);
    const managerHtml = (asManager as { content: string }).content;
    expect(managerHtml).toContain("Expected");
    expect(managerHtml).toContain(`<td class="num mono">${await onHand("wine")}</td>`);
    await cancelCount(shop.manager(), started.id);
  });
});

describe("approving many", () => {
  it("names a count that broke partway as failed while the others stand", async () => {
    const first = await countToApprove({ gin: "21" });
    const second = await countToApprove({ wine: "13" });
    vi.spyOn(prisma.retailStockCount, "findFirst").mockRejectedValueOnce(new Error("The connection dropped."));
    const answer = await approveCounts(shop.manager(), [first.id, second.id]);
    expect(answer).toEqual({ approved: [second.countNo], waiting: [], skipped: [], failed: [first.countNo] });
    expect((await prisma.retailStockCount.findUniqueOrThrow({ where: { id: first.id } })).status).toBe("TO_APPROVE");
    await cancelCount(shop.manager(), first.id);
  });

  it("asks for a count to be ticked when an id is not one", () => {
    const parsed = countIdsInput.safeParse({ ids: ["not-an-id"] });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Tick a count first.");
  });
});

describe("renaming the shelf", () => {
  it("takes the name and ignores any other key", () => {
    expect(countPatch.safeParse({ name: "Back shelf", status: "APPROVED" })).toEqual({ success: true, data: { name: "Back shelf" } });
  });
});
