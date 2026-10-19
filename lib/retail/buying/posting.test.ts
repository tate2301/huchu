/**
 * Money out to the books (40-buying 3.5, BUY-05), against the test database:
 * a requisition paid out and accounted for through the services, posted at
 * once. Each entry balances and reads the right accounts — an order's cash Dr
 * 2000 / Cr the money account, an expense's Dr its type's account, the change
 * back the other way — and an expense type with no account leaves its payout
 * PENDING (`EVENT_ACCOUNT_MISSING`) while the money that moved stands.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { raiseOrder } from "./orders";
import { postPayout } from "./posting";
import { accountFor, approveRequisition, askForMoney, payOut } from "./requisitions";
import { createSupplier } from "./suppliers";

let shop: TestShop;
let safe: string;
let repairs: string;
let unbooked: string;
let castle: { productId: string; itemId: string };
let afdis: string;

const deps = { requestUrl: null };
const RECEIPT = { url: "/demo/receipts/repairs-receipt.png", name: "Receipt.png", contentType: "image/png", size: 676 };

/** An entry's lines as "{code} D|C {amount}", sorted. */
async function entryOf(sourceType: "RETAIL_REQUISITION_PAYOUT" | "RETAIL_REQUISITION_CHANGE", sourceId: string) {
  const entry = await prisma.journalEntry.findFirstOrThrow({
    where: { companyId: shop.companyId, sourceType, sourceId },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0);
  const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0);
  return {
    balanced: Math.abs(debit - credit) < 0.005,
    lines: entry.lines.map((line) => `${line.account.code} ${line.debit > 0 ? `D ${line.debit}` : `C ${line.credit}`}`).sort(),
  };
}

const expense = async (typeId: string, amount: string) => {
  const asked = await askForMoney(shop.manager(), { for: "expense", expenseTypeId: typeId, whatFor: "Fridge repair, front till", amount, currency: "US$", payFromId: safe }, deps);
  await approveRequisition(shop.owner(), asked.id, {}, deps);
  return asked;
};

beforeAll(async () => {
  shop = await makeTestShop("Money out");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  const code = async (value: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code: value }, select: { id: true } })).id;
  safe = (
    await prisma.bankAccount.create({
      data: { companyId: shop.companyId, name: "Office safe", kind: "CASH", currency: "USD", openingBalance: 10000, ledgerAccountId: await code("1005") },
      select: { id: true },
    })
  ).id;
  repairs = (await prisma.retailExpenseType.create({ data: { companyId: shop.companyId, name: "Repairs and maintenance", category: "EQUIPMENT", ledgerAccountId: await code("5300") }, select: { id: true } })).id;
  unbooked = (await prisma.retailExpenseType.create({ data: { companyId: shop.companyId, name: "Odd jobs", category: "OTHER" }, select: { id: true } })).id;
  castle = await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.86", categoryId: shop.ciderId }, { siteId: shop.mainId, onHand: 10 });
  afdis = (await prisma.$transaction((tx) => createSupplier(tx, shop.manager(), { name: "Afdis Distillers" }))).id;
}, 90_000);

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.purchasePayment.deleteMany({ where: { companyId } });
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.retailAttachment.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await prisma.crmRequisition.deleteMany({ where: { companyId } });
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.retailPurchaseOrder.deleteMany({ where: { companyId } });
  await prisma.vendor.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("an order's cash", () => {
  it("posts the payout Dr 2000 / Cr the money account, the change Dr the money account / Cr 2000, and nets what was spent on 2000", async () => {
    const draft = await raiseOrder(
      shop.manager(),
      { supplierId: afdis, siteId: shop.mainId, expectedDate: "2026-12-01", lines: [{ productId: castle.productId, quantity: 20, unitCost: "10.00" }], payment: "CASH_ON_DELIVERY", send: false },
      { requestUrl: "http://localhost:3000/retail/buying/orders" },
    );
    const asked = await askForMoney(shop.manager(), { for: "order", orderId: draft.id, amount: "231.00", currency: "US$", payFromId: safe }, deps);
    await approveRequisition(shop.owner(), asked.id, {}, deps);
    const paid = await payOut(shop.owner(), asked.id, { paid: "231.00", fromId: safe, toId: shop.managerId, how: "Cash" }, deps);
    expect(paid.accountingStatus).toBe("POSTED");
    expect(await entryOf("RETAIL_REQUISITION_PAYOUT", asked.id)).toEqual({ balanced: true, lines: ["1005 C 231", "2000 D 231"] });

    const done = await accountFor(shop.manager(), asked.id, { spent: "193.40", changeIntoId: safe, receipts: [RECEIPT] }, deps);
    expect(done.accountingStatus).toBe("POSTED");
    expect(await entryOf("RETAIL_REQUISITION_CHANGE", asked.id)).toEqual({ balanced: true, lines: ["1005 D 37.6", "2000 C 37.6"] });

    const ap = await prisma.journalLine.findMany({ where: { entry: { companyId: shop.companyId, sourceId: asked.id }, account: { code: "2000" } }, select: { debit: true, credit: true } });
    expect(ap.reduce((sum, line) => sum + line.debit - line.credit, 0).toFixed(2)).toBe("193.40");
  });
});

describe("an expense's cash", () => {
  it("puts the payout on 1150 Cash advances, then expenses what was spent to the expense type's account and takes the change off the advance", async () => {
    const asked = await expense(repairs, "85.00");
    await payOut(shop.owner(), asked.id, { paid: "85.00", fromId: safe, toId: shop.ownerId, how: "Cash" }, deps);
    expect(await entryOf("RETAIL_REQUISITION_PAYOUT", asked.id)).toEqual({ balanced: true, lines: ["1005 C 85", "1150 D 85"] });
    const done = await accountFor(shop.owner(), asked.id, { spent: "80.00", changeIntoId: safe, receipts: [RECEIPT] }, deps);
    expect(done.accountingStatus).toBe("POSTED");
    expect(await entryOf("RETAIL_REQUISITION_CHANGE", asked.id)).toEqual({ balanced: true, lines: ["1005 D 5", "1150 C 5"] });
    const spent = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: shop.companyId, sourceType: "REQUISITION_ACQUITTAL", sourceId: { startsWith: `${asked.id}:` } },
      select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
    });
    expect(spent.lines.map((line) => `${line.account.code} ${line.debit > 0 ? `D ${line.debit}` : `C ${line.credit}`}`).sort()).toEqual(["1150 C 80", "5300 D 80"]);
    const advance = await prisma.journalLine.findMany({ where: { entry: { companyId: shop.companyId, OR: [{ sourceId: asked.id }, { sourceId: { startsWith: `${asked.id}:` } }] }, account: { code: "1150" } }, select: { debit: true, credit: true } });
    expect(advance.reduce((sum, line) => sum + line.debit - line.credit, 0)).toBe(0);
  });

  it("posts the payout of an expense type with no account, and expenses it to its category's when it is accounted for", async () => {
    const asked = await expense(unbooked, "20.00");
    const paid = await payOut(shop.owner(), asked.id, { paid: "20.00", fromId: safe, toId: shop.ownerId, how: "Cash" }, deps);
    expect(paid.accountingStatus).toBe("POSTED");
    expect(await entryOf("RETAIL_REQUISITION_PAYOUT", asked.id)).toEqual({ balanced: true, lines: ["1005 C 20", "1150 D 20"] });
    expect((await postPayout(shop.companyId, asked.id, { userId: shop.managerId })).accountingStatus).toBe("POSTED");
    await accountFor(shop.owner(), asked.id, { spent: "20.00", receipts: [RECEIPT] }, deps);
    const spent = await prisma.journalEntry.findFirstOrThrow({
      where: { companyId: shop.companyId, sourceType: "REQUISITION_ACQUITTAL", sourceId: `${asked.id}:OTHER` },
      select: { lines: { select: { debit: true, account: { select: { code: true } } } } },
    });
    expect(spent.lines.find((line) => line.debit > 0)?.account.code).toBe("5590");
  });
});
