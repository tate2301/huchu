import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { prisma } from "@/lib/prisma";
import { addTestProduct } from "@/lib/retail/products/test-fixtures";
import { runRetailPosting } from "@/lib/retail/posting-settings";
import { addDays, todayIn } from "@/lib/workspace/format";

import { sendLaybyReminders } from "./layby-reminders";
import { cancelLayby, handOver, payLayby, startLayby } from "./laybys";
import { destroySalesShop, makeSalesShop, type SalesShop } from "./test-fixtures";

/**
 * Lay-bys (FLR-06) through the services the sheets post to, against the test
 * database: the smallest deposit, goods off the shelf, two lay-bys after the
 * last bottle, paying it off, the hand-over's sale and journal, a cancel's
 * fee, refund and journal, who may cancel, cash into the drawer, and the
 * weekly reminder.
 */

let shop: SalesShop;
let drawer = "";
let n = 0;

const chipo = () => ({ companyId: shop.companyId, userId: shop.chipo, userRole: "CASHIER", userName: "Chipo Dube" });
const tafara = () => ({ companyId: shop.companyId, userId: shop.managerId, userRole: "MANAGER", userName: "Tafara Nyathi" });
const atTill = () => ({ place: { registerId: shop.frontTill } });
const due = () => addDays(todayIn(), 17);

/** A gift box at US$23.00, US$15.00 cost, on its own line so each test counts its own stock. */
async function giftBox(onHand: number) {
  n += 1;
  return addTestProduct(shop.companyId, { name: `Gift box ${n}`, price: "23.00", cost: "15.00" }, { onHand });
}

const onHand = async (itemId: string) =>
  Number((await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId }, select: { currentStock: true } })).currentStock);

const expectedCash = async () =>
  Number((await prisma.retailShift.findUniqueOrThrow({ where: { id: drawer }, select: { expectedCash: true } })).expectedCash);

/** Two gift boxes, US$46.00, for Tapiwa. */
async function twoBoxes(deposit: string, extra: Record<string, unknown> = {}) {
  const box = await giftBox(5);
  const started = await startLayby(
    tafara(),
    {
      customerId: shop.tapiwa,
      lines: [{ productId: box.productId, quantity: "2" }],
      deposit,
      depositTender: "ECOCASH",
      reference: "MP2610.1234",
      dueOn: due(),
      remindWeekly: true,
      ...extra,
    },
    atTill(),
  );
  return { box, started };
}

async function journal(sourceType: string, sourceId: string) {
  await runRetailPosting(shop.companyId, "BY_HAND", null);
  return prisma.journalEntry.findFirst({
    where: { companyId: shop.companyId, sourceType: sourceType as never, sourceId },
    include: { lines: { include: { account: { select: { code: true } } } } },
  });
}

type Entry = NonNullable<Awaited<ReturnType<typeof journal>>>;

const balanced = (entry: Entry) => {
  const debit = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
  const credit = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);
  return [debit.toFixed(2), credit.toFixed(2)];
};

const on = (entry: Entry, code: string, side: "debit" | "credit") =>
  entry.lines.filter((line) => line.account.code === code).reduce((sum, line) => sum + Number(line[side]), 0).toFixed(2);

beforeAll(async () => {
  shop = await makeSalesShop("Laybys");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  drawer = (
    await prisma.retailShift.create({
      data: {
        companyId: shop.companyId,
        shiftNo: `SH-L-${shop.companyId.slice(0, 6)}`,
        registerId: shop.frontTill,
        registerCode: `FRONT-${shop.companyId.slice(0, 6)}`,
        registerName: "Front till",
        siteId: shop.mainId,
        cashierId: shop.chipo,
        cashierName: "Chipo Dube",
        expectedCash: 50,
        openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  if (!shop) return;
  await prisma.retailLaybyPayment.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailLaybyLine.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailLayby.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailCashMovement.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.retailShift.updateMany({ where: { companyId: shop.companyId }, data: { status: "CLOSED" } });
  await prisma.retailSale.updateMany({ where: { companyId: shop.companyId }, data: { shiftId: null } });
  await prisma.retailShift.deleteMany({ where: { companyId: shop.companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId: shop.companyId } });
  await destroySalesShop(shop);
});

describe("starting a lay-by", () => {
  it("takes no less than the smallest deposit and never the whole price", async () => {
    await expect(twoBoxes("9.00")).rejects.toMatchObject({ status: 400, message: "At least US$9.20.", fieldErrors: { dep: "At least US$9.20." } });
    await expect(twoBoxes("46.00")).rejects.toMatchObject({ status: 400, fieldErrors: { dep: "That pays it all. Sell it instead." } });
  });

  it("puts the goods aside: on hand drops by the lines", async () => {
    const { box, started } = await twoBoxes("9.20");
    expect(started).toMatchObject({ laybyNo: expect.stringMatching(/^LAY-/), left: "36.80" });
    expect(await onHand(box.itemId)).toBe(3);
    const move = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: box.itemId, reason: "LAYBY_ASIDE" } });
    expect([move.movementType, Number(move.quantity), move.reference]).toEqual(["ISSUE", 2, started.laybyNo]);
    // The deposit sits in Lay-by deposits held until the goods go.
    const deposit = await prisma.retailLaybyPayment.findFirstOrThrow({ where: { laybyId: started.id } });
    const entry = await journal("RETAIL_LAYBY_PAYMENT", deposit.id);
    expect(entry).not.toBeNull();
    expect(on(entry!, "2260", "credit")).toBe("9.20");
    expect(balanced(entry!)).toEqual(["9.20", "9.20"]);
  });

  it("lets only one of two lay-bys after the last unit have it", async () => {
    const box = await giftBox(1);
    const one = () =>
      startLayby(
        tafara(),
        { customerId: shop.tinashe, lines: [{ productId: box.productId, quantity: "1" }], deposit: "10.00", depositTender: "ECOCASH", reference: "MP2610.9", dueOn: due(), remindWeekly: false },
        atTill(),
      );
    const results = await Promise.allSettled([one(), one()]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toMatchObject({ status: expect.any(Number) });
    expect([400, 409]).toContain(refused.reason.status);
    expect(await onHand(box.itemId)).toBe(0);
  });

  it("puts a cash deposit into the till's drawer as cash taken in", async () => {
    const before = await expectedCash();
    const { started } = await twoBoxes("20.00", { depositTender: "CASH", reference: null });
    expect(await expectedCash()).toBe(before + 20);
    const payment = await prisma.retailLaybyPayment.findFirstOrThrow({ where: { laybyId: started.id }, include: { cashMovement: true } });
    expect(payment.shiftId).toBe(drawer);
    expect([payment.cashMovement?.type, Number(payment.cashMovement?.amount), payment.cashMovement?.reasonCode]).toEqual(["TAKEN_IN", 20, "LAYBY_PAYMENT"]);
  });
});

describe("paying it off and handing it over", () => {
  it("is ready once the rest is paid, and the hand-over sells it from the lay-by", async () => {
    const { box, started } = await twoBoxes("10.00");
    const part = await payLayby(chipo(), started.id, { amount: "20.00", tender: "ECOCASH", reference: "MP2610.55" }, atTill());
    expect([part.status, part.left]).toEqual(["PAYING", "16.00"]);
    await expect(payLayby(chipo(), started.id, { amount: "17.00", tender: "ECOCASH", reference: "MP2610.56" }, atTill())).rejects.toMatchObject({
      status: 400,
      message: "Only US$16.00 is left.",
    });
    const rest = await payLayby(chipo(), started.id, { amount: "16.00", tender: "ECOCASH", reference: "MP2610.57" }, atTill());
    expect([rest.status, rest.left]).toEqual(["READY", "0.00"]);

    const done = await handOver(chipo(), started.id, {}, atTill());
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: done.saleId }, include: { payments: true } });
    expect([sale.saleType, Number(sale.totalAmount), sale.customerId]).toEqual(["SALE", 46, shop.tapiwa]);
    expect(sale.payments.map((payment) => [payment.tenderType, Number(payment.amount)])).toEqual([["LAYBY", 46]]);
    const layby = await prisma.retailLayby.findUniqueOrThrow({ where: { id: started.id } });
    expect([layby.status, layby.saleId]).toEqual(["COLLECTED", sale.id]);
    // The goods left when they were put aside: no second movement.
    expect(await prisma.stockMovement.count({ where: { itemId: box.itemId } })).toBe(1);
    expect(await onHand(box.itemId)).toBe(3);

    const entry = await journal("RETAIL_SALE", sale.id);
    expect(entry).not.toBeNull();
    expect(on(entry!, "2260", "debit")).toBe("46.00");
    const [debit, credit] = balanced(entry!);
    expect(debit).toBe(credit);
    // Revenue and VAT take the 46.00; the cost of the boxes moves to cost of sales.
    const revenueAndVat = entry!.lines
      .filter((line) => line.account.code !== "2260" && Number(line.credit) > 0 && !line.account.code.startsWith("1"))
      .reduce((sum, line) => sum + Number(line.credit), 0);
    expect(revenueAndVat.toFixed(2)).toBe("46.00");
    expect(entry!.lines.some((line) => Number(line.debit) === 30 && line.account.code.startsWith("5"))).toBe(true);
  });
});

describe("cancelling", () => {
  it("is refused to a cashier", async () => {
    const { started } = await twoBoxes("10.00");
    await expect(cancelLayby(chipo(), started.id, { tender: "ECOCASH", reference: "MP-back" }, atTill())).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the fee, pays back the rest, puts the goods back and posts it", async () => {
    await prisma.retailTillRules.upsert({
      where: { companyId: shop.companyId },
      create: { companyId: shop.companyId, laybyCancelFee: "2.00" },
      update: { laybyCancelFee: "2.00" },
    });
    const { box, started } = await twoBoxes("10.00");
    await payLayby(tafara(), started.id, { amount: "5.00", tender: "CASH" }, atTill());
    const before = await expectedCash();
    const done = await cancelLayby(tafara(), started.id, { tender: "CASH" }, atTill());
    expect([done.paidBack, done.fee]).toEqual(["13.00", "2.00"]);
    expect(await expectedCash()).toBe(before - 13);
    expect(await onHand(box.itemId)).toBe(5);
    const back = await prisma.stockMovement.findFirstOrThrow({ where: { itemId: box.itemId, reason: "LAYBY_BACK" } });
    expect([back.movementType, Number(back.quantity)]).toEqual(["RECEIPT", 2]);
    const layby = await prisma.retailLayby.findUniqueOrThrow({ where: { id: started.id } });
    expect([layby.status, Number(layby.cancelFee)]).toEqual(["CANCELLED", 2]);

    const entry = await journal("RETAIL_LAYBY_CANCEL", started.id);
    expect(entry).not.toBeNull();
    expect(balanced(entry!)).toEqual(["15.00", "15.00"]);
    expect(on(entry!, "2260", "debit")).toBe("15.00");
    expect(on(entry!, "4200", "credit")).toBe("2.00");
    await expect(cancelLayby(tafara(), started.id, { tender: "CASH" }, atTill())).rejects.toMatchObject({ status: 409 });
  });
});

describe("the weekly reminder", () => {
  it("goes once a week to a lay-by still being paid", async () => {
    const { started } = await twoBoxes("10.00");
    const week = 7 * 86_400_000;
    await prisma.retailLayby.update({ where: { id: started.id }, data: { createdAt: new Date(Date.now() - week - 60_000) } });
    // Every other lay-by here was started today: only this one is a week old.
    expect(await sendLaybyReminders(shop.companyId)).toBe(1);
    expect(await sendLaybyReminders(shop.companyId)).toBe(0);
    expect(await sendLaybyReminders(shop.companyId, new Date(Date.now() + 3 * 86_400_000))).toBe(0);
    const later = await sendLaybyReminders(shop.companyId, new Date(Date.now() + week + 60_000));
    expect(later).toBeGreaterThanOrEqual(1);
    const sent = await prisma.retailMessage.findMany({ where: { companyId: shop.companyId, template: "layby-reminder", entityId: started.id } });
    expect(sent).toHaveLength(2);
    expect(sent[0]!.body).toContain(started.laybyNo);
  });
});
