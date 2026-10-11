import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { issueCreditNote, issueVoucher, issueVouchers, VoucherRefusal } from "./issue";

/**
 * Issuing vouchers (PRD-10, W-18) against the test database: each kind takes
 * its own code sequence; a gift voucher sent on WhatsApp queues one message
 * in the shop's words with its code and secret; given vouchers are owed in
 * one journal for their value times how many; a refund's credit note is good
 * for three months and names the sale it came from.
 */

let shop: TestShop;
let customerId = "";

async function books(sourceId: string) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: shop.companyId, sourceType: "RETAIL_VOUCHER_ISSUE", sourceId },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  const byAccount: Record<string, number> = {};
  for (const line of entries.flatMap((entry) => entry.lines)) {
    byAccount[line.account.code] = Number(((byAccount[line.account.code] ?? 0) + Number(line.debit) - Number(line.credit)).toFixed(2));
  }
  return byAccount;
}

beforeAll(async () => {
  shop = await makeTestShop("Voucher issue");
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  await addTestProduct(shop.companyId, { name: "Castle Lager 340ml", price: "1.20", cost: "0.80" }, { siteId: shop.mainId, onHand: 10 });
  customerId = (await prisma.customer.create({ data: { companyId: shop.companyId, name: "Tapiwa Marange", phone: "+263771234567" }, select: { id: true } })).id;
}, 60_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailMessage.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.retailVoucher.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("codes", () => {
  it("numbers gift vouchers, credit notes and discount vouchers each in their own run", async () => {
    const one = (kind: "GIFT" | "CREDIT_NOTE" | "DISCOUNT") =>
      prisma.$transaction((tx) =>
        issueVoucher(tx, {
          actor: shop.owner(),
          kind,
          funding: "GIVEN",
          valueCents: kind === "DISCOUNT" ? null : 1000,
          percentOff: kind === "DISCOUNT" ? 10 : null,
          copies: kind === "DISCOUNT" ? 5 : 1,
          expiresOn: "2027-10-01",
          sendBy: "PRINT",
        }),
      );
    const codes = [(await one("GIFT")).code, (await one("CREDIT_NOTE")).code, (await one("DISCOUNT")).code, (await one("GIFT")).code];
    expect(codes).toEqual(["GV-0001", "CN-0001", "DV-0001", "GV-0002"]);
    const discount = await prisma.retailVoucher.findFirstOrThrow({ where: { companyId: shop.companyId, code: "DV-0001" } });
    expect([discount.usesLeft, discount.copies, discount.balance.toFixed(2)]).toEqual([5, 5, "0.00"]);
  });
});

describe("issuing from the sheet", () => {
  it("sends a gift voucher on WhatsApp in the shop's words, with its code and secret", async () => {
    const answer = await issueVouchers(
      shop.manager(),
      { kind: "GIFT", value: "50.00", howMany: 1, holder: "Tapiwa Marange", expires: "3 October 2027", minSale: null, sendBy: "WHATSAPP" },
      new Date("2026-10-03T08:00:00Z"),
    );
    const voucher = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: answer.vouchers[0]!.id } });
    expect(answer).toMatchObject({ printUrl: null, sent: 1, message: `${voucher.code} for US$50.00 sent to Tapiwa Marange on WhatsApp.` });
    expect([voucher.customerId, voucher.sentAt?.toISOString()]).toEqual([customerId, "2026-10-03T08:00:00.000Z"]);
    const messages = await prisma.retailMessage.findMany({ where: { companyId: shop.companyId, entityId: voucher.id } });
    const company = (await prisma.company.findUniqueOrThrow({ where: { id: shop.companyId }, select: { name: true } })).name;
    expect(messages.map((message) => [message.channel, message.to, message.status, message.body])).toEqual([
      [
        "WHATSAPP",
        "+263771234567",
        "QUEUED",
        `${company}: a US$50.00 gift voucher for you, ${voucher.code}, code ${voucher.secret}. Use it at ${company} until 3 October 2027.`,
      ],
    ]);
  });

  it("owes three given US$20.00 vouchers in one journal, Dr Promotions and gifts / Cr Vouchers owed US$60.00", async () => {
    const answer = await issueVouchers(
      shop.manager(),
      { kind: "GIFT", value: "20.00", howMany: 3, holder: null, expires: "3 October 2027", minSale: null, sendBy: "PRINT" },
      new Date("2026-10-03T08:00:00Z"),
    );
    expect(answer.message).toBe("3 gift vouchers for US$20.00 are ready to print.");
    expect(await books(answer.vouchers[0]!.id)).toEqual({ "5450": 60, "2250": -60 });
  });

  it("refuses WhatsApp to a customer with no number, under Send by, and issues nothing", async () => {
    await prisma.customer.create({ data: { companyId: shop.companyId, name: "Nyasha Gwenzi", phone: null } });
    const before = await prisma.retailVoucher.count({ where: { companyId: shop.companyId } });
    const refused = await issueVouchers(shop.manager(), {
      kind: "GIFT",
      value: "10.00",
      howMany: 1,
      holder: "Nyasha Gwenzi",
      expires: "3 October 2027",
      minSale: null,
      sendBy: "BOTH",
    }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(VoucherRefusal);
    expect(refused).toMatchObject({ status: 400, fieldErrors: { send: "Nyasha Gwenzi has no WhatsApp number." } });
    expect(await prisma.retailVoucher.count({ where: { companyId: shop.companyId } })).toBe(before);
  });
});

describe("a refund's credit note", () => {
  it("is a credit note funded by the refund, good for three months, naming the sale; nothing is worth nothing", async () => {
    const sale = await prisma.retailSale.create({ data: { companyId: shop.companyId, saleNo: `SALE-CN-${Date.now()}`, siteId: shop.mainId }, select: { id: true } });
    const note = await prisma.$transaction((tx) =>
      issueCreditNote(tx, { actor: shop.owner(), sourceSaleId: sale.id, value: "12.60", customerId, now: new Date("2026-10-02T09:00:00Z") }),
    );
    expect([note.code, note.kind, note.expiresOn]).toEqual(["CN-0002", "CREDIT_NOTE", "2027-01-02"]);
    const stored = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: note.id } });
    expect([stored.funding, stored.balance.toFixed(2), stored.value?.toFixed(2), stored.soldSaleId, stored.customerId]).toEqual(["REFUND", "12.60", "12.60", sale.id, customerId]);
    await expect(prisma.$transaction((tx) => issueCreditNote(tx, { actor: shop.owner(), sourceSaleId: sale.id, value: 0 }))).rejects.toMatchObject({
      status: 400,
      message: "A credit note is worth more than nothing.",
    });
  });
});
