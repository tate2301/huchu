/**
 * The queue's identity for a sale, across the S-7.7 rename.
 *
 * These two behaviours are worth pinning because getting either wrong loses a
 * cashier's money rather than merely looking wrong: a queued sale is cash
 * already in the drawer that has not reached the server, and the queue is the
 * only record of it.
 */

import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { prisma } from "@/lib/prisma";
import { refundSale } from "@/lib/retail/floor/refunds";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "@/lib/retail/floor/test-fixtures";

import {
  NEEDS_A_MANAGER,
  queuedReversalLabel,
  queuedSaleLabel,
  reversalNeedsManager,
  reversalRequest,
  type PosReversalQueuePayload,
  type PosSaleQueuePayload,
} from "./pos-offline-queue";

/** Only the fields the label reads; the rest of the payload is irrelevant here. */
function payload(fields: Record<string, unknown>) {
  return fields as unknown as PosSaleQueuePayload;
}

describe("what an unsent sale is called", () => {
  it("does not invent a receipt number it does not have", () => {
    // The server allocates the number when the sale lands. Until then there
    // isn't one, and showing the raw key would be worse than the old form.
    const label = queuedSaleLabel(payload({ clientRef: "3f2a1b9c-77d4-4e21-9a10-8c5b2e4f0d6a" }));
    expect(label).toBe("Unsent · 4F0D6A");
    expect(label).not.toContain("3f2a1b9c");
  });

  it("says something rather than nothing when the key is missing", () => {
    expect(queuedSaleLabel(payload({}))).toBe("Unsent sale");
  });
});

/* ── Refunds and voids done offline (FLR-09, SET-06's replay rule) ─────── */


const RULES = { refundPinOver: "20.00", voidPin: "ALWAYS" as const };

const queued = (fields: Partial<PosReversalQueuePayload> = {}): PosReversalQueuePayload => ({
  kind: "refund",
  saleId: "5d0c1b8e-61a4-4c8e-9a5e-1f3a3c2b1a00",
  saleNo: "SALE-31866",
  amount: 27.9,
  already: 0,
  saleAt: "2026-10-12T08:10:00.000Z",
  at: "2026-10-12T09:40:00.000Z",
  body: { reason: "Changed mind", lines: [], to: "ORIGINAL", restock: true },
  ...fields,
});

describe("a refund or void saved offline, in the queue", () => {
  it("is marked Needs a manager when a refund goes over the refund PIN limit, the sale's refunds together", () => {
    expect(NEEDS_A_MANAGER).toBe("Needs a manager");
    expect(queuedReversalLabel(queued())).toBe("Refund of SALE-31866");
    expect(reversalNeedsManager(queued(), RULES)).toBe(true);
    expect(reversalNeedsManager(queued({ amount: 12, already: 0 }), RULES)).toBe(false);
    expect(reversalNeedsManager(queued({ amount: 12, already: 9 }), RULES)).toBe(true);
    // Someone who holds the approve right is their own manager.
    expect(reversalNeedsManager(queued(), RULES, true)).toBe(false);
  });

  it("reads the void rule: Always, After 5 minutes from the sale, Never", () => {
    const voided = (at: string) => queued({ kind: "void", at, body: { reason: "Rang up wrong" } });
    expect(queuedReversalLabel(voided("2026-10-12T08:12:00.000Z"))).toBe("Void of SALE-31866");
    expect(reversalNeedsManager(voided("2026-10-12T08:12:00.000Z"), RULES)).toBe(true);
    expect(reversalNeedsManager(voided("2026-10-12T08:12:00.000Z"), { ...RULES, voidPin: "AFTER_5_MINUTES" })).toBe(false);
    expect(reversalNeedsManager(voided("2026-10-12T08:16:00.000Z"), { ...RULES, voidPin: "AFTER_5_MINUTES" })).toBe(true);
    expect(reversalNeedsManager(voided("2026-10-12T09:00:00.000Z"), { ...RULES, voidPin: "NEVER" })).toBe(false);
  });

  it("goes up as the till's request, dated when it was done, with an approver only once one approved it", () => {
    const sent = reversalRequest(queued());
    expect(sent.url).toBe("/api/v2/retail/pos/sales/5d0c1b8e-61a4-4c8e-9a5e-1f3a3c2b1a00/refund");
    expect(sent.body).toMatchObject({ reason: "Changed mind", to: "ORIGINAL", refundedAt: "2026-10-12T09:40:00.000Z" });
    expect(sent.body).not.toHaveProperty("approver");
    const approved = reversalRequest(queued({ kind: "void", body: { reason: "Rang up wrong" } }), { userId: "u", pin: "2468" });
    expect(approved.url.endsWith("/void")).toBe(true);
    expect(approved.body).toMatchObject({ voidedAt: "2026-10-12T09:40:00.000Z", approver: { userId: "u", pin: "2468" } });
  });
});

describe("a queued refund over the limit, replayed (SET-06's replayApproval)", () => {
  let shop: SalesShop;
  let n = 0;
  const chipo = () => ({ companyId: shop.companyId, userId: shop.chipo, userRole: "CASHIER", userName: "Chipo Dube" });
  const cardSale = async () => {
    n += 1;
    return addTestSale(shop, {
      saleNo: `SALE-Q${n}-${shop.companyId.slice(0, 4)}`,
      at: new Date(Date.now() - 90 * 60 * 1000),
      lines: [{ item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity: 1, price: "42.00", cost: "31.00" }],
      payments: [{ tender: "CARD", amount: "42.00", reference: "4412" }],
    });
  };

  beforeAll(async () => {
    shop = await makeSalesShop("Offline reversals");
    await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
    await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.managerId, pinHash: await bcrypt.hash("2468", 4) } });
  });

  afterAll(async () => {
    if (!shop) return;
    await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
    await destroySalesShop(shop);
  });

  it("is taken without an approver, with a line for a manager to review", async () => {
    const sale = await cardSale();
    const refund = await refundSale({
      actor: chipo(),
      saleId: sale.id,
      body: { lines: [{ saleLineId: sale.lineIds[0]!, quantity: "1" }], reason: "Changed mind", to: "ORIGINAL", restock: true },
      offlineAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    const row = await prisma.retailSale.findUniqueOrThrow({ where: { id: refund.id }, select: { reviewReason: true, approvedByName: true } });
    expect(row.approvedByName).toBeNull();
    expect(row.reviewReason).toContain("Refunded offline without the manager PIN it needed.");
  });

  it("is approved, with nothing to review, when it goes up with the manager's PIN", async () => {
    const sale = await cardSale();
    const refund = await refundSale({
      actor: chipo(),
      saleId: sale.id,
      body: {
        lines: [{ saleLineId: sale.lineIds[0]!, quantity: "1" }],
        reason: "Changed mind",
        to: "ORIGINAL",
        restock: true,
        approver: { userId: shop.managerId, pin: "2468" },
      },
      offlineAt: new Date(Date.now() - 30 * 60 * 1000),
    });
    const row = await prisma.retailSale.findUniqueOrThrow({ where: { id: refund.id }, select: { reviewReason: true, approvedByName: true } });
    expect(row.approvedByName).toBe("Tafara Nyathi");
    expect(row.reviewReason ?? "").not.toContain("without the manager PIN");
  });
});
