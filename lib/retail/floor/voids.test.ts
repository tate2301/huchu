import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { prisma } from "@/lib/prisma";
import { ApprovalNeeded } from "@/lib/retail/manager-pin";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { ensureRetailSaleAccountingPosted } from "@/app/api/v2/retail/_services";

import { refundSale } from "./refunds";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";
import { voidForm, voidSale } from "./voids";

/**
 * Void a sale (FLR-02, W-41) through `voidSale`, against the test database:
 * today's sales only, never one with a refund, "After 5 minutes" free inside
 * them and asked after, a cash void needs an open drawer, and the sale and its
 * VOID sum to zero in takings, stock and the journal.
 */

let shop: SalesShop;
let drawer = "";
let n = 0;

const chipo = () => ({ companyId: shop.companyId, userId: shop.chipo, userRole: "CASHIER", userName: "Chipo Dube" });
const tafara = () => ({ companyId: shop.companyId, userId: shop.managerId, userRole: "MANAGER", userName: "Tafara Nyathi" });

/** Johnnie Walker and a bag of ice, US$44.20, rung `minutesAgo` minutes ago on the front till. */
async function sale(minutesAgo: number, extra: Partial<Parameters<typeof addTestSale>[1]> = {}) {
  n += 1;
  return addTestSale(shop, {
    saleNo: `SALE-V${n}-${shop.companyId.slice(0, 4)}`,
    at: new Date(Date.now() - minutesAgo * 60 * 1000),
    lines: [
      { item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity: 1, price: "42.00", cost: "31.00" },
      { item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" },
    ],
    payments: [{ tender: "CARD", amount: "44.20", reference: "4412" }],
    shiftId: drawer,
    ...extra,
  });
}

async function nets(sourceType: "RETAIL_SALE" | "RETAIL_VOID", sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const entry = await prisma.journalEntry.findFirstOrThrow({
    where: { companyId: shop.companyId, sourceType, sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  const byAccount = new Map<string, number>();
  for (const line of entry.lines) {
    byAccount.set(line.account.code, Number(((byAccount.get(line.account.code) ?? 0) + Number(line.debit) - Number(line.credit)).toFixed(2)));
  }
  return byAccount;
}

beforeAll(async () => {
  shop = await makeSalesShop("Voids");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.retailTillRules.create({ data: { companyId: shop.companyId, voidPin: "AFTER_5_MINUTES" } });
  drawer = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-V-${shop.companyId.slice(0, 6)}`,
        registerId: shop.frontTill,
        registerCode: `FRONT-${shop.companyId.slice(0, 6)}`,
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: shop.chipo,
        cashierName: "Chipo Dube",
        expectedCash: 200,
        openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailSale.updateMany({ where: { companyId: shop.companyId }, data: { shiftId: null } });
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await destroySalesShop(shop);
});

describe("which sales can be voided", () => {
  it("refuses yesterday's sale", async () => {
    const old = await sale(26 * 60);
    await expect(voidSale({ actor: tafara(), saleId: old.id, body: { reason: "Rang up wrong" } })).rejects.toMatchObject({
      status: 409,
      message: "Only today’s sales can be voided. Refund it instead.",
    });
  });

  it("refuses a sale with a refund against it", async () => {
    const sold = await sale(3);
    const refund = await refundSale({
      actor: tafara(),
      saleId: sold.id,
      body: { lines: [{ saleLineId: sold.lineIds[1]!, quantity: "1" }], reason: "Damaged", to: "ORIGINAL", restock: true },
    });
    expect(refund.saleNo).toMatch(/^RFD-/);
    await expect(voidForm(tafara(), sold.id)).rejects.toMatchObject({ status: 409 });
    const saleNo = (await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.id } })).saleNo;
    await expect(voidSale({ actor: tafara(), saleId: sold.id, body: { reason: "Rang up wrong" } })).rejects.toMatchObject({
      status: 409,
      message: `${saleNo} has a refund against it. Refund the rest instead.`,
    });
  });

  it("refuses a lay-by's hand-over, so its money cannot land back on Lay-by deposits held", async () => {
    const handedOver = await sale(3, { payments: [{ tender: "LAYBY", amount: "44.20" }] });
    const saleNo = (await prisma.retailSale.findUniqueOrThrow({ where: { id: handedOver.id } })).saleNo;
    await expect(voidForm(tafara(), handedOver.id)).rejects.toMatchObject({ status: 409 });
    await expect(voidSale({ actor: tafara(), saleId: handedOver.id, body: { reason: "Rang up wrong" } })).rejects.toMatchObject({
      status: 409,
      message: `${saleNo} was a lay-by's hand-over. Refund it instead.`,
    });
    expect(await prisma.retailSale.count({ where: { sourceSaleId: handedOver.id } })).toBe(0);
  });
});

describe("Voids need a manager PIN: after 5 minutes", () => {
  it("lets a cashier void inside the five minutes, and asks for a manager after them", async () => {
    const fresh = await sale(2);
    expect((await voidForm(chipo(), fresh.id)).needsApproval).toBe(false);
    const voided = await voidSale({ actor: chipo(), saleId: fresh.id, body: { reason: "Customer left" } });
    expect(voided.sale.approvedByName).toBeNull();

    const later = await sale(10);
    expect((await voidForm(chipo(), later.id)).needsApproval).toBe(true);
    await expect(voidSale({ actor: chipo(), saleId: later.id, body: { reason: "Customer left" } })).rejects.toBeInstanceOf(ApprovalNeeded);
  });
});

describe("a void", () => {
  it("nets the sale to zero in takings, stock and the journal", async () => {
    const sold = await sale(20);
    const row = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.id }, include: { lines: true, payments: true } });
    await ensureRetailSaleAccountingPosted({ actor: tafara(), sale: row });
    const voided = await voidSale({ actor: tafara(), saleId: sold.id, body: { reason: "Rang up wrong", note: "Rang twice" } });
    expect(voided.voidNo).toMatch(/^VOID-/);

    const after = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.id } });
    expect([after.status, after.voidReason, after.approvedByName, after.notes]).toEqual(["VOIDED", "Rang up wrong", "Tafara Nyathi", "Rang twice"]);
    expect(Number(after.baseAmount) + Number(voided.sale.baseAmount)).toBe(0);

    const back = await prisma.stockMovement.findMany({ where: { reference: voided.voidNo, item: { site: { companyId: shop.companyId } } } });
    expect(back.map((move) => [move.movementType, move.reason, Number(move.quantity)]).sort()).toEqual([
      ["RECEIPT", "VOID", 1],
      ["RECEIPT", "VOID", 1],
    ]);
    const card = voided.sale.payments[0]!;
    expect([card.tenderType, card.amount.toFixed(2), card.reference]).toEqual(["CARD", "-44.20", "Reversal of 4412"]);

    const saleBooks = await nets("RETAIL_SALE", sold.id);
    const voidBooks = await nets("RETAIL_VOID", voided.sale.id);
    expect([...voidBooks.entries()].sort()).toEqual([...saleBooks.entries()].map(([code, net]) => [code, -net]).sort());
  });

  it("of a cash sale needs an open drawer", async () => {
    const sold = await sale(15, { payments: [{ tender: "CASH", amount: "44.20" }] });
    await prisma.retailShift.update({ where: { id: drawer }, data: { status: "CLOSED", closedAt: new Date() } });
    try {
      await expect(voidSale({ actor: tafara(), saleId: sold.id, body: { reason: "Rang up wrong" } })).rejects.toMatchObject({
        status: 409,
        message: "Front till’s shift is closed. Refund it instead.",
      });
    } finally {
      await prisma.retailShift.update({ where: { id: drawer }, data: { status: "OPEN", closedAt: null } });
    }
    const voided = await voidSale({ actor: tafara(), saleId: sold.id, body: { reason: "Rang up wrong" } });
    expect(voided.sale.shiftId).toBe(drawer);
  });
});
