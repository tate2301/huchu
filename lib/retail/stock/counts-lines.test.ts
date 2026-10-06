/**
 * Counting on a phone (30-stock W-22 step 2), against a real Postgres: each
 * figure is weighed against on hand at the moment it arrives, so a sale rung
 * between the start and the figure is allowed for; the counter of a blind
 * count never sees what is expected; only the counter (or someone who may
 * change counts) counts; it goes for review only with every line counted, and
 * a closed count takes no figure.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import {
  CountRefusal,
  countedInput,
  loadCountLines,
  loadCountView,
  saveCountLine,
  startCount,
  submitCount,
  type CountGrants,
} from "./counts";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let managerId: string;
let counterId: string;
let otherCashierId: string;
let siteId: string;
let gin: string;
let jameson: string;
let countId: string;

const manager = () => ({ companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER" });
const counter = () => ({ companyId, userId: counterId, userName: "Kuda Banda", userRole: "CASHIER" });
const other = () => ({ companyId, userId: otherCashierId, userName: "Chipo Dube", userRole: "CASHIER" });
const CASHIER: CountGrants = { view: false, update: false, approve: false, seeCost: false };
const MANAGER: CountGrants = { view: true, update: true, approve: true, seeCost: true };

async function refusal(promise: Promise<unknown>): Promise<CountRefusal> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CountRefusal) return error;
    throw error;
  }
  throw new Error("It went through.");
}

async function stock(code: string, name: string, onHand: number, locationId: string) {
  const product = await prisma.product.create({ data: { companyId, code: `${code}-${stamp}`, name }, select: { id: true } });
  return (
    await prisma.inventoryItem.create({
      data: {
        itemCode: `${code}-${stamp}`,
        name,
        category: "OTHER",
        unit: "bottle",
        siteId,
        locationId,
        productId: product.id,
        currentStock: quantity(onHand),
        unitCost: money(12.4),
      },
      select: { id: true },
    })
  ).id;
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Count lines ${stamp}`, slug: `count-lines-${stamp}` }, select: { id: true } })).id;
  const user = async (name: string, role: "MANAGER" | "CASHIER", key: string) =>
    (await prisma.user.create({ data: { email: `${key}-${stamp}@shop.test`, name, role, companyId }, select: { id: true } })).id;
  managerId = await user("Tafara Nyathi", "MANAGER", "manager");
  counterId = await user("Kuda Banda", "CASHIER", "kuda");
  otherCashierId = await user("Chipo Dube", "CASHIER", "chipo");
  siteId = (await prisma.site.create({ data: { companyId, code: `HRE-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  const place = (await prisma.stockLocation.create({ data: { siteId, code: "SHOP", name: "Shop floor" }, select: { id: true } })).id;
  gin = await stock("GIN", "Gordon’s Gin 750ml", 22, place);
  jameson = await stock("JAMESON", "Jameson Irish Whiskey 750ml", 9, place);
  countId = (
    await startCount(manager(), { scope: "PRODUCTS", lineIds: [gin, jameson], siteId, counterId, blind: true, keepSelling: true })
  ).id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.notificationRecipient.deleteMany({ where: { notification: { companyId } } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.retailStockCount.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } }).catch(() => {});
});

const lineOf = async (itemId: string) =>
  prisma.retailStockCountLine.findFirstOrThrow({ where: { countId, inventoryItemId: itemId }, select: { id: true } });

describe("a count on the counter's phone", () => {
  it("lets its counter read it, whatever their role, never what a blind count expects", async () => {
    const view = await loadCountView(counter(), CASHIER, countId);
    expect(view).toMatchObject({ name: "2 products", status: "COUNTING", yours: true, lines: 2, counted: 0 });
    expect(view).not.toHaveProperty("difference");
    const { lines, progress } = await loadCountLines(counter(), CASHIER, countId);
    expect(progress).toEqual({ counted: 0, total: 2 });
    expect(lines.map((line) => line.product)).toEqual(["Gordon’s Gin 750ml", "Jameson Irish Whiskey 750ml"]);
    for (const line of lines) expect(line).not.toHaveProperty("expected");
    expect((await loadCountLines(manager(), MANAGER, countId)).lines[0]).toMatchObject({ expected: 22 });
  });

  it("refuses anyone else without a grant", async () => {
    expect(await refusal(loadCountView(other(), CASHIER, countId))).toMatchObject({ status: 403, message: "This count is not yours to count." });
    const line = await lineOf(gin);
    expect(await refusal(saveCountLine(other(), CASHIER, countId, line.id, "20"))).toMatchObject({ status: 403 });
  });

  it("takes only a figure: a number not below 0, at most four places", () => {
    expect(countedInput.safeParse({ counted: "-1" }).success).toBe(false);
    expect(countedInput.safeParse({ counted: "abc" }).success).toBe(false);
    expect(countedInput.safeParse({ counted: "2.12345" }).success).toBe(false);
    expect(countedInput.safeParse({ counted: "2.5" }).success).toBe(true);
    expect(countedInput.safeParse({ counted: "0" }).success).toBe(true);
  });

  it("weighs a figure against on hand when it arrives: a sale rung since the start is allowed for", async () => {
    // One Gordon's sold at the till after the count started, before it was counted.
    await recordStockMovement({
      companyId,
      userId: otherCashierId,
      itemId: gin,
      movementType: "ISSUE",
      quantity: 1,
      unit: "bottle",
      reason: "SALE",
      reference: "SALE-1",
      sourceType: "RETAIL_SALE",
      sourceId: `sale-${stamp}`,
    });
    const line = await lineOf(gin);
    const saved = await saveCountLine(counter(), CASHIER, countId, line.id, "20");
    expect(saved.progress).toEqual({ counted: 1, total: 2 });
    expect(saved.line).toMatchObject({ counted: "20" });
    expect(saved.line).not.toHaveProperty("expected");
    const stored = await prisma.retailStockCountLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(stored.expected.toNumber()).toBe(22);
    expect(stored.expectedAtCount!.toNumber()).toBe(21);
    expect(stored.difference!.toNumber()).toBe(-1);
    expect(stored.countedById).toBe(counterId);
    expect((await prisma.retailStockCount.findUniqueOrThrow({ where: { id: countId } })).firstCountedAt).not.toBeNull();
  });

  it("goes for review only with every line counted", async () => {
    expect(await refusal(submitCount(counter(), CASHIER, countId))).toMatchObject({ status: 409, message: "Count every line first: 1 to go." });
    const line = await lineOf(jameson);
    await saveCountLine(counter(), CASHIER, countId, line.id, "9");
    expect(await submitCount(counter(), CASHIER, countId)).toEqual({ status: "TO_APPROVE" });
    const count = await prisma.retailStockCount.findUniqueOrThrow({ where: { id: countId } });
    expect(count.status).toBe("TO_APPROVE");
    expect(count.submittedAt).not.toBeNull();
    const event = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId, eventType: "RETAIL_STOCK_COUNT.SUBMITTED" } });
    expect(JSON.parse(event.payloadJson ?? "{}")).toMatchObject({ lines: 2, differ: 1 });
    const notice = await prisma.notification.findFirstOrThrow({ where: { companyId, type: "RETAIL_COUNT_SUBMITTED" }, select: { title: true } });
    expect(notice.title).toMatch(/ is ready to approve$/);
    // Sent: the counter's figures are in, and it is the approver's now.
    expect(await refusal(saveCountLine(counter(), CASHIER, countId, line.id, "8"))).toMatchObject({ status: 409 });
  });

  it("takes no figure once closed", async () => {
    await prisma.retailStockCount.update({ where: { id: countId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    const line = await lineOf(gin);
    expect(await refusal(saveCountLine(manager(), MANAGER, countId, line.id, "19"))).toMatchObject({ status: 409, message: "This count is closed." });
  });
});
