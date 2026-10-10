/**
 * Reversing movements from Movements (30-stock W-28 step 3), against a real
 * Postgres: a hand adjustment goes back with a movement the other way under
 * the same reference, a case break puts both legs back, a sale is skipped
 * with why, and nothing is reversed twice.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { recordStockMovement } from "@/lib/inventory/stock-movements";
import { money, quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { STOCK_LIST_RUNS, reverseMovementsAsk } from "@/lib/retail/asks/stock";

import { reverseMovements, ReverseRefused } from "./reverse";
import { reversedToast, skipReason } from "./reverse-words";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let userId: string;
let siteId: string;
let locationId: string;
let ice: string;
let single: string;
let caseLine: string;
let adjustmentId: string;
let saleId: string;
let caseOut: string;
let singlesIn: string;

const actor = () => ({ companyId, userId, userName: "Tafara Nyathi", userRole: "MANAGER" });

async function line(code: string, stock: number) {
  const productId = (await prisma.product.create({ data: { companyId, code: `${code}-${stamp}`, name: code }, select: { id: true } })).id;
  return (
    await prisma.inventoryItem.create({
      data: { itemCode: `${code}-${stamp}`, name: code, category: "OTHER", unit: "each", siteId, locationId, productId, currentStock: quantity(stock), unitCost: money(1) },
      select: { id: true },
    })
  ).id;
}

const onHand = async (id: string) => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).currentStock.toNumber();

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Reverse ${stamp}`, slug: `reverse-${stamp}` }, select: { id: true } })).id;
  userId = (await prisma.user.create({ data: { email: `mgr-${stamp}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId }, select: { id: true } })).id;
  siteId = (await prisma.site.create({ data: { companyId, code: `R-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  locationId = (await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })).id;
  ice = await line("ICE", 40);
  single = await line("CASTLE", 2);
  caseLine = await line("CASTLE-CASE", 4);
  const base = { companyId, userId, unit: "each", sourceType: "RETAIL_STOCK_ADJUSTMENT" as const };
  adjustmentId = (
    await recordStockMovement({ ...base, itemId: ice, movementType: "ADJUSTMENT", quantity: -1, reason: "CORRECTION", reference: "ADJ-0031" })
  ).movement.id;
  saleId = (
    await recordStockMovement({ ...base, itemId: ice, movementType: "ISSUE", quantity: 1, sourceType: "RETAIL_SALE", reason: "SALE", reference: "S-031862" })
  ).movement.id;
  caseOut = (
    await recordStockMovement({ ...base, itemId: caseLine, movementType: "ISSUE", quantity: 1, reason: "CASE_BROKEN", reference: "BRK-0012" })
  ).movement.id;
  singlesIn = (
    await recordStockMovement({ ...base, itemId: single, movementType: "RECEIPT", quantity: 24, reason: "CASE_BROKEN", reference: "BRK-0012" })
  ).movement.id;
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.stockMovement.deleteMany({ where: { reversesId: { not: null }, item: { site: { companyId } } } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("what can be reversed", () => {
  it("says why a document is not reversed here", () => {
    const base = { id: "m", reference: "SALE-31862", reversed: false };
    expect(skipReason({ ...base, reason: "SALE" })).toMatchObject({ kind: "sale", why: "SALE-31862 is a sale: refund it from the sale." });
    expect(skipReason({ ...base, reference: "GRN-0004", reason: "RECEIVED" })?.kind).toBe("delivery");
    expect(skipReason({ ...base, reason: "TRANSFER_OUT" })?.kind).toBe("transfer");
    expect(skipReason({ ...base, reason: "COUNT" })?.kind).toBe("count");
    expect(skipReason({ ...base, reason: "OPENING" })?.kind).toBe("other");
    expect(skipReason({ ...base, reference: "ADJ-0031", reason: "BROKEN" })).toBeNull();
    expect(skipReason({ ...base, reference: "ADJ-0031", reason: "BROKEN", reversed: true })?.why).toBe("ADJ-0031 is already reversed.");
  });

  it("words the toast from what the server answered", () => {
    expect(reversedToast({ reversed: [1], skipped: [{ kind: "sale" }] })).toBe("1 movement reversed. 1 was a sale: refund it from the sale.");
    expect(reversedToast({ reversed: [1, 2], skipped: [] })).toBe("2 movements reversed.");
    expect(reversedToast({ reversed: [], skipped: [{ kind: "reversed" }, { kind: "reversed" }] })).toBe(
      "Nothing was reversed. 2 were already reversed.",
    );
    expect(STOCK_LIST_RUNS.reversemovements!.done(2, [], { reversed: [{}], skipped: [{ kind: "sale" }] })).toBe(
      "1 movement reversed. 1 was a sale: refund it from the sale.",
    );
  });

  it("asks first, in the board's words", () => {
    expect(reverseMovementsAsk(2)).toEqual({
      title: "Reverse 2 movements?",
      body: "Each goes back with a movement the other way, dated now, and the books follow. Sales, deliveries, counts and transfers are not reversed here; open them instead.",
      keep: "Keep them",
      go: "Reverse them",
      fill: "bad",
    });
    expect(reverseMovementsAsk(1).title).toBe("Reverse 1 movement?");
  });
});

describe("reverseMovements", () => {
  it("puts an adjustment back under its own reference and skips the sale", async () => {
    expect(await onHand(ice)).toBe(38);
    const result = await reverseMovements({ actor: actor(), ids: [adjustmentId, saleId] });
    expect(result.reversed.map((entry) => [entry.reference, entry.change])).toEqual([["ADJ-0031", 1]]);
    expect(result.skipped).toEqual([
      { id: saleId, reference: "S-031862", kind: "sale", why: "S-031862 is a sale: refund it from the sale." },
    ]);
    expect(await onHand(ice)).toBe(39);
    const reversal = await prisma.stockMovement.findUniqueOrThrow({ where: { reversesId: adjustmentId } });
    expect(reversal).toMatchObject({ reason: "REVERSAL", reference: "ADJ-0031", issuedById: userId });
    expect(reversal.change.toNumber()).toBe(1);
    expect(reversal.balanceAfter?.toNumber()).toBe(39);
    const audit = await prisma.platformAuditEvent.findMany({ where: { companyId, eventType: "RETAIL_STOCK.MOVEMENTS_REVERSED" } });
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0]!.payloadJson ?? "{}")).toMatchObject({ references: ["ADJ-0031"] });
  });

  it("never reverses a movement twice", async () => {
    const again = await reverseMovements({ actor: actor(), ids: [adjustmentId] });
    expect(again.reversed).toEqual([]);
    expect(again.skipped[0]).toMatchObject({ kind: "reversed", why: "ADJ-0031 is already reversed." });
    expect(await onHand(ice)).toBe(39);
  });

  it("refuses to take back singles that were since sold, and changes nothing", async () => {
    await prisma.inventoryItem.update({ where: { id: single }, data: { currentStock: quantity(10) } });
    await expect(reverseMovements({ actor: actor(), ids: [caseOut] })).rejects.toBeInstanceOf(ReverseRefused);
    expect(await onHand(caseLine)).toBe(3);
    await prisma.inventoryItem.update({ where: { id: single }, data: { currentStock: quantity(26) } });
  });

  it("puts both legs of a case break back from either one", async () => {
    const result = await reverseMovements({ actor: actor(), ids: [caseOut] });
    expect(result.reversed.map((entry) => entry.id).sort()).toEqual([caseOut, singlesIn].sort());
    expect(await onHand(caseLine)).toBe(4);
    expect(await onHand(single)).toBe(2);
    const legs = await prisma.stockMovement.count({ where: { reason: "REVERSAL", reference: "BRK-0012", item: { site: { companyId } } } });
    expect(legs).toBe(2);
  });

  it("skips what is not this shop's", async () => {
    const result = await reverseMovements({ actor: actor(), ids: ["00000000-0000-0000-0000-000000000000"] });
    expect(result.skipped[0]).toMatchObject({ kind: "other", why: "That movement is not this shop's." });
  });
});
