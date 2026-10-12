import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { prisma } from "@/lib/prisma";
import { ApprovalNeeded, ApprovalRefused } from "@/lib/retail/manager-pin";
import { runRetailPosting } from "@/lib/retail/posting-settings";

import { refundForm, refundSale, type RefundInput } from "./refunds";
import { ReversalRefused } from "./reversal";
import { refundDoneSentence } from "./reversal-words";
import { addTestSale, destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";

/**
 * Refund a sale (FLR-02, W-41) through `refundSale`, the service the sheet
 * and the till both post to, against the test database: what is left of a
 * line, deposits to the cent, the refund PIN limit on the sale's refunds
 * together, a wrong PIN counted, two refunds at once, the four ways the money
 * goes back, damaged goods written off into Losses, and the journal.
 */

let shop: SalesShop;
let drawer = "";
let n = 0;

const chipo = () => ({ companyId: shop.companyId, userId: shop.chipo, userRole: "CASHIER", userName: "Chipo Dube" });
const tafara = () => ({ companyId: shop.companyId, userId: shop.managerId, userRole: "MANAGER", userName: "Tafara Nyathi" });

const body = (lines: RefundInput["lines"], extra: Partial<RefundInput> = {}): RefundInput => ({
  lines,
  reason: "Changed mind",
  to: "ORIGINAL",
  restock: true,
  ...extra,
});

/** Two Johnnie Walkers (deposit US$1.01 on the pair) and a bag of ice, US$86.20, paid by card. */
async function cardSale(extra: Partial<Parameters<typeof addTestSale>[1]> = {}) {
  n += 1;
  return addTestSale(shop, {
    saleNo: `SALE-R${n}-${shop.companyId.slice(0, 4)}`,
    at: new Date(Date.now() - 30 * 60 * 1000),
    lines: [
      { item: shop.johnnie, name: "Johnnie Walker Black 750ml", quantity: 2, price: "42.00", cost: "31.00", deposit: "1.01" },
      { item: shop.ice, name: "Ice 2kg bag", quantity: 1, price: "2.20", cost: "1.10" },
    ],
    payments: [{ tender: "CARD", amount: "87.21", reference: "4412" }],
    deposit: "1.01",
    shiftId: drawer,
    ...extra,
  });
}

async function journal(sourceType: string, sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  const entry = await prisma.journalEntry.findFirst({
    where: { companyId: shop.companyId, sourceType: sourceType as never, sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
  return entry;
}

beforeAll(async () => {
  shop = await makeSalesShop("Refunds");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.retailTillPin.create({ data: { companyId: shop.companyId, userId: shop.managerId, pinHash: await bcrypt.hash("2468", 4) } });
  drawer = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-R-${shop.companyId.slice(0, 6)}`,
        registerId: shop.frontTill,
        registerCode: `FRONT-${shop.companyId.slice(0, 6)}`,
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: shop.chipo,
        cashierName: "Chipo Dube",
        expectedCash: 300,
        openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailVoucher.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailShift.updateMany({ where: { companyId: shop.companyId }, data: { status: "CLOSED" } });
  await prisma.retailSale.updateMany({ where: { companyId: shop.companyId }, data: { shiftId: null } });
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailEmptiesEntry.deleteMany({ where: { companyId: shop.companyId } });
  await destroySalesShop(shop);
});

describe("what comes back", () => {
  it("refunds part of a sale, then exactly what is left of it, deposits to the cent", async () => {
    const sale = await cardSale();
    const form = await refundForm(tafara(), sale.id);
    expect(form.to.map((option) => option.label)).toEqual(["The card", "Cash", "Credit note", "Voucher"]);
    expect(form.lines.map((line) => [line.name, line.left, line.price])).toEqual([
      ["Johnnie Walker Black 750ml", 2, "42.00"],
      ["Ice 2kg bag", 1, "2.20"],
    ]);

    const first = await refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[0]!, quantity: "1" }], { reason: "Damaged" }) });
    // 42.00 and half of the deposit, rounded up: 0.51.
    expect(first.value).toBe("42.51");
    expect(first.saleNo).toMatch(/^RFD-/);
    expect(refundDoneSentence(first)).toBe(`${first.saleNo} done. US$42.51 back on the card.`);
    const payment = await prisma.retailSalePayment.findFirstOrThrow({ where: { saleId: first.id } });
    expect([payment.tenderType, payment.amount.toFixed(2), payment.reference]).toEqual(["CARD", "-42.51", "Reversal of 4412"]);
    // Tafara holds the approve right, so over the limit the approval is her own.
    expect(first.sale.approvedByName).toBe("Tafara Nyathi");

    const rest = await refundSale({
      actor: tafara(),
      saleId: sale.id,
      body: body([
        { saleLineId: sale.lineIds[0]!, quantity: "1" },
        { saleLineId: sale.lineIds[1]!, quantity: "1" },
      ]),
    });
    expect(rest.value).toBe("44.70");
    const docs = await prisma.retailSale.findMany({ where: { sourceSaleId: sale.id, saleType: "REFUND" } });
    const goods = docs.reduce((sum, doc) => sum + Number(doc.totalAmount), 0);
    const deposits = docs.reduce((sum, doc) => sum + Number(doc.depositAmount), 0);
    expect([goods.toFixed(2), deposits.toFixed(2)]).toEqual(["-86.20", "-1.01"]);

    await expect(
      refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[1]!, quantity: "1" }]) }),
    ).rejects.toMatchObject({ status: 400, fieldErrors: { lines: "All of the Ice 2kg bag has come back already." } });
  });

  it("never lets two refunds at once hand back more than was sold", async () => {
    const sale = await cardSale();
    const one = () => refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[0]!, quantity: "2" }]) });
    const results = await Promise.allSettled([one(), one()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(ReversalRefused);
    expect(await prisma.retailSale.count({ where: { sourceSaleId: sale.id, saleType: "REFUND" } })).toBe(1);
  });
});

describe("the refund PIN (SET-06, C-31)", () => {
  it("asks a cashier for a manager over US$20.00, counts a wrong PIN, and takes Tafara's", async () => {
    const sale = await cardSale();
    const lines = [{ saleLineId: sale.lineIds[0]!, quantity: "1" }];
    await expect(refundSale({ actor: chipo(), saleId: sale.id, body: body(lines) })).rejects.toBeInstanceOf(ApprovalNeeded);

    await expect(
      refundSale({ actor: chipo(), saleId: sale.id, body: body(lines, { approver: { userId: shop.managerId, pin: "1111" } }) }),
    ).rejects.toMatchObject({ field: "pin", message: "That PIN is not right." });
    await expect(refundSale({ actor: chipo(), saleId: sale.id, body: body(lines, { approver: { userId: shop.managerId, pin: "1111" } }) })).rejects.toBeInstanceOf(
      ApprovalRefused,
    );
    const pin = await prisma.retailTillPin.findUniqueOrThrow({ where: { userId: shop.managerId } });
    expect(pin.failedAttempts).toBe(2);
    expect(await prisma.retailSale.count({ where: { sourceSaleId: sale.id } })).toBe(0);

    const approved = await refundSale({ actor: chipo(), saleId: sale.id, body: body(lines, { approver: { userId: shop.managerId, pin: "2468" } }) });
    expect(approved.sale.approvedByName).toBe("Tafara Nyathi");
    await prisma.retailTillPin.update({ where: { userId: shop.managerId }, data: { failedAttempts: 0 } });
  });

  it("lets a cashier refund under the limit on her own", async () => {
    const sale = await cardSale();
    const refund = await refundSale({ actor: chipo(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[1]!, quantity: "1" }]) });
    expect([refund.value, refund.sale.approvedByName]).toEqual(["2.20", null]);
  });
});

describe("how the money goes back", () => {
  it("refuses the original tender on a cash sale", async () => {
    const sale = await cardSale({ payments: [{ tender: "CASH", amount: "87.21" }] });
    const form = await refundForm(tafara(), sale.id);
    expect(form.to.map((option) => option.value)).toEqual(["CASH", "CREDIT_NOTE", "VOUCHER"]);
    await expect(refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[1]!, quantity: "1" }]) })).rejects.toMatchObject({
      status: 400,
      fieldErrors: { to: "Pay it back in cash, or as a credit note or voucher." },
    });
  });

  it("takes cash out of the chosen drawer, and asks which when several are open", async () => {
    const backTill = await prisma.retailRegister.create({
      data: { companyId: shop.companyId, code: `BAR-${shop.companyId.slice(0, 6)}`, name: "Bar till", siteId: shop.mainId },
      select: { id: true },
    });
    const bar = await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-B-${shop.companyId.slice(0, 6)}`,
        registerId: backTill.id,
        registerCode: `BAR-${shop.companyId.slice(0, 6)}`,
        registerName: "Bar till",
        siteId: shop.mainId,
        cashierId: shop.farai,
        cashierName: "Farai Moyo",
        expectedCash: 100,
      },
      select: { id: true },
    });
    // A sale with no drawer of its own and no till: Tafara has none open, so she is asked.
    const sale = await cardSale({ shiftId: undefined, payments: [{ tender: "CASH", amount: "87.21" }] });
    await prisma.retailSale.update({ where: { id: sale.id }, data: { registerId: null } });
    const lines = [{ saleLineId: sale.lineIds[1]!, quantity: "1" }];
    await expect(refundSale({ actor: tafara(), saleId: sale.id, body: body(lines, { to: "CASH" }) })).rejects.toMatchObject({
      status: 409,
      message: "Pick the drawer the cash comes out of.",
      extra: { choose: [expect.objectContaining({ shiftId: bar.id }), expect.objectContaining({ shiftId: drawer })] },
    });
    const refund = await refundSale({ actor: tafara(), saleId: sale.id, body: body(lines, { to: "CASH", shiftId: bar.id }) });
    expect(refundDoneSentence(refund)).toBe(`${refund.saleNo} done. US$2.20 in cash from the bar till.`);
    expect(Number((await prisma.retailShift.findUniqueOrThrow({ where: { id: bar.id } })).expectedCash)).toBe(97.8);
    expect(refund.sale.shiftId).toBe(bar.id);
    await prisma.retailShift.update({ where: { id: bar.id }, data: { status: "CLOSED", closedAt: new Date() } });
  });

  it("issues a credit note for a customer, paid by a VOUCHER tender", async () => {
    const walkIn = await cardSale();
    await expect(
      refundSale({ actor: tafara(), saleId: walkIn.id, body: body([{ saleLineId: walkIn.lineIds[1]!, quantity: "1" }], { to: "CREDIT_NOTE" }) }),
    ).rejects.toMatchObject({ status: 400, fieldErrors: { customer: "A credit note needs a customer." } });

    const sale = await cardSale({ customerId: shop.tapiwa });
    const refund = await refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[1]!, quantity: "1" }], { to: "CREDIT_NOTE" }) });
    expect(refund.voucherCode).toMatch(/^CN-/);
    const note = await prisma.retailVoucher.findFirstOrThrow({ where: { companyId: shop.companyId, code: refund.voucherCode! } });
    expect([note.kind, note.funding, note.value?.toFixed(2), note.customerId]).toEqual(["CREDIT_NOTE", "REFUND", "2.20", shop.tapiwa]);
    const payment = await prisma.retailSalePayment.findFirstOrThrow({ where: { saleId: refund.id } });
    expect([payment.tenderType, payment.voucherId, payment.amount.toFixed(2)]).toEqual(["VOUCHER", note.id, "-2.20"]);
    expect(refundDoneSentence(refund)).toBe(`${refund.saleNo} done. US$2.20 as credit note ${refund.voucherCode}.`);
  });
});

describe("damaged goods", () => {
  it("come back in, are written off as BROKEN under the refund's number, and post a loss", async () => {
    const sale = await cardSale();
    const refund = await refundSale({
      actor: tafara(),
      saleId: sale.id,
      body: body([{ saleLineId: sale.lineIds[0]!, quantity: "1" }], { reason: "Damaged", restock: false }),
    });
    expect(refund.sale.restocked).toBe(false);
    const moves = await prisma.stockMovement.findMany({ where: { reference: refund.saleNo, item: { site: { companyId: shop.companyId } } }, orderBy: { createdAt: "asc" } });
    expect(moves.map((move) => [move.movementType, move.reason, Number(move.quantity)])).toEqual([
      ["RECEIPT", "REFUND", 1],
      ["ADJUSTMENT", "BROKEN", -1],
    ]);
    // Dr Breakage / Cr Stock at its cost: what Insights › Losses reads.
    const loss = await journal("RETAIL_STOCK_ADJUSTMENT", moves[1]!.id);
    expect(
      loss?.lines.map((line) => ({ code: line.account.code, debit: Number(line.debit), credit: Number(line.credit) })).sort((a, b) => a.code.localeCompare(b.code)),
    ).toEqual([
      { code: "1200", debit: 0, credit: 31 },
      { code: "5410", debit: 31, credit: 0 },
    ]);
  });
});

describe("the books and the points", () => {
  it("post a balanced refund journal and take back the points in the share refunded", async () => {
    const sale = await cardSale({ customerId: shop.tapiwa });
    await prisma.retailPointsEntry.create({
      data: { companyId: shop.companyId, customerId: shop.tapiwa, kind: "EARNED", points: 86, value: 0, saleId: sale.id },
    });
    const refund = await refundSale({ actor: tafara(), saleId: sale.id, body: body([{ saleLineId: sale.lineIds[0]!, quantity: "1" }]) });
    const entry = await journal("RETAIL_REFUND", refund.id);
    expect(entry).not.toBeNull();
    const debit = entry!.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = entry!.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit.toFixed(2)).toBe(credit.toFixed(2));
    const back = await prisma.retailPointsEntry.findMany({ where: { saleId: refund.id, kind: "REVERSED" } });
    // US$42.00 of US$86.20: about half of the 86 points.
    expect(back.reduce((sum, row) => sum + row.points, 0)).toBeLessThan(-40);
    expect(back.reduce((sum, row) => sum + row.points, 0)).toBeGreaterThan(-45);
  });
});
