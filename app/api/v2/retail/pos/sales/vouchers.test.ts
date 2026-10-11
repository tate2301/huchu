import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { addTestProduct, makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { issueVoucher, type Issued } from "@/lib/retail/vouchers/issue";
import { barcodeText, WRONG_SECRET } from "@/lib/retail/vouchers/redeem";
import { VOUCHER_REFUND_REFUSAL } from "../../_services";

/**
 * `pos/sales` with vouchers (PRD-10, W-18) on a paired till, against the test
 * database: US$10.00 paid US$7.40 by gift voucher and US$2.60 cash leaves
 * US$12.60 on it, a use row and Dr Vouchers owed; a wrong secret or a payment
 * without one is refused and nothing is sold; two tills spending the same
 * voucher at once cannot both have it; a gift voucher bought in a sale is paid
 * on top of the goods, issued with the sale and owed in its journal (Cr 2250),
 * and the sale cannot be voided at the till; a discount voucher takes 10% off
 * after the promotions and gives up one use; voiding a sale paid by voucher
 * puts the money back on it (2250 ties out with what it holds) and gives a
 * discount voucher its use back; a refund onto a voucher is refused; the
 * till's check reads a scan.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";
import { POST as VOID } from "./[id]/void/route";
import { POST as REFUND } from "./[id]/refund/route";
import { GET as CHECK } from "../vouchers/check/route";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `vouchers-key-${stamp}`;
const backKey = `vouchers-back-${stamp}`;
let shop: TestShop;
let shiftId = "";
let backShiftId = "";
const ids: Record<string, string> = {};
const vouchers: Record<string, Issued> = {};

const issue = (input: Partial<Parameters<typeof issueVoucher>[1]>) =>
  prisma.$transaction((tx) =>
    issueVoucher(tx, { actor: shop.owner(), kind: "GIFT", funding: "SOLD", valueCents: 2000, expiresOn: "2027-10-01", sendBy: "PRINT", ...input }),
  );

beforeAll(async () => {
  shop = await makeTestShop("Sale vouchers");
  await prisma.retailPostingSettings.create({ data: { companyId: shop.companyId, schedule: "EVERY_SALE" } });
  await prisma.retailPaymentSettings.create({ data: { companyId: shop.companyId, takeVouchers: true } });
  const add = async (code: string, name: string, price: string) => {
    ids[code] = (await addTestProduct(shop.companyId, { name, price, cost: "1.00", ageCheck: false }, { siteId: shop.mainId, onHand: 60 })).productId;
  };
  await add("brandy", "Klipdrift Brandy 750ml", "10.00");
  await add("castle", "Castle Lager 340ml", "1.20");
  await add("jameson", "Jameson Irish Whiskey 750ml", "27.90");
  await add("gin", "Gordon's Gin 750ml", "10.00");

  vouchers.gift = await issue({ valueCents: 2000 });
  vouchers.race = await issue({ valueCents: 1000 });
  vouchers.discount = await issue({ kind: "DISCOUNT", funding: "GIVEN", valueCents: null, percentOff: 10, copies: 2, minSaleCents: 2000 });

  const cashierId = (
    await prisma.user.create({
      data: { companyId: shop.companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@vouchers.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const openTill = async (code: string, name: string, deviceKey: string) => {
    const till = await prisma.retailRegister.create({
      data: { companyId: shop.companyId, siteId: shop.mainId, code, name },
      select: { id: true, code: true, name: true },
    });
    const device = await prisma.retailDevice.create({
      data: { companyId: shop.companyId, registerId: till.id, kind: "BROWSER", label: name, keyHash: hashDeviceKey(deviceKey), pairedById: shop.ownerId },
      select: { id: true },
    });
    return (
      await prisma.retailShift.create({
        data: {
          companyId: shop.companyId,
          shiftNo: `SH-${code}-${stamp}`,
          registerCode: till.code,
          registerName: till.name,
          registerId: till.id,
          deviceId: device.id,
          siteId: shop.mainId,
          cashierId,
          cashierName: "Chipo Dube",
          openedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        },
        select: { id: true },
      })
    ).id;
  };
  shiftId = await openTill("FRONT", "Front till", key);
  backShiftId = await openTill("BACK", "Back till", backKey);
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: cashierId, companyId: shop.companyId, role: "CASHIER", name: "Chipo Dube", email: `chipo-${stamp}@vouchers.test`, enabledFeatures: ["retail.core"] },
    },
  });
}, 90_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.retailVoucherUse.deleteMany({ where: { companyId } });
  await prisma.retailVoucher.deleteMany({ where: { companyId } });
  await prisma.retailSalePayment.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSaleLine.deleteMany({ where: { sale: { companyId } } });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

type Line = { productId: string; quantity: number; unitPrice: number };
type Payment = Record<string, unknown>;

function sell(ref: string, lines: Line[], payments: Payment[], extra: Record<string, unknown> = {}, back = false) {
  return SELL(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sales", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${back ? backKey : key}`, "content-type": "application/json" },
      body: JSON.stringify({ clientRef: `${ref}-${stamp}`, shiftId: back ? backShiftId : shiftId, idChecked: true, items: lines, payments, ...extra }),
    }),
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string } }));
}

const cash = (amount: number) => ({ tenderType: "CASH", currency: "USD", amount });
const byVoucher = (voucher: Issued, amount: number, secret = voucher.secret) => ({
  tenderType: "VOUCHER",
  currency: "USD",
  amount,
  voucherCode: voucher.code,
  voucherSecret: secret,
});
const brandy = () => [{ productId: ids.brandy!, quantity: 1, unitPrice: 10 }];
const salesOf = (ref: string) => prisma.retailSale.count({ where: { companyId: shop.companyId, clientRef: `${ref}-${stamp}` } });

/** The sale's journal netted by account: debit less credit. */
async function books(saleId: string, sourceType: "RETAIL_SALE" | "RETAIL_VOID" = "RETAIL_SALE") {
  const entry = await prisma.journalEntry.findFirstOrThrow({
    where: { companyId: shop.companyId, sourceType, sourceId: saleId },
    select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
  });
  const byAccount: Record<string, number> = {};
  for (const line of entry.lines) {
    byAccount[line.account.code] = Number(((byAccount[line.account.code] ?? 0) + Number(line.debit) - Number(line.credit)).toFixed(2));
  }
  return byAccount;
}
function voidSale(saleId: string) {
  return VOID(
    new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/sales/${saleId}/void`, {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ shiftId, reason: "Customer left", voidedAt: new Date(Date.now() - 5 * 60_000).toISOString() }),
    }),
    { params: Promise.resolve({ id: saleId }) },
  ).then(async (response) => ({ status: response.status, body: (await response.json()) as Record<string, unknown> & { id?: string; error?: string } }));
}
const balanced = (byAccount: Record<string, number>) => Math.abs(Math.round(Object.values(byAccount).reduce((sum, net) => sum + net, 0) * 100));

describe("paying with a gift voucher", () => {
  it("takes US$7.40 off it and US$2.60 in cash, and the books spend what the shop owed", async () => {
    const sold = await sell("split", brandy(), [byVoucher(vouchers.gift!, 7.4), cash(2.6)]);
    expect(sold.status).toBe(201);
    const voucher = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: vouchers.gift!.id }, include: { uses: true } });
    expect(voucher.balance.toFixed(2)).toBe("12.60");
    expect(voucher.uses.map((use) => [use.saleId, use.amount.toFixed(2), use.balanceAfter?.toFixed(2)])).toEqual([[sold.body.id, "7.40", "12.60"]]);
    const payment = await prisma.retailSalePayment.findFirstOrThrow({ where: { saleId: sold.body.id!, tenderType: "VOUCHER" } });
    expect(payment.voucherId).toBe(vouchers.gift!.id);
    const journal = await books(sold.body.id!);
    expect(journal["2250"]).toBe(7.4);
    expect(balanced(journal)).toBe(0);
    const redeemed = await prisma.platformAuditEvent.count({ where: { entityId: vouchers.gift!.id, eventType: "RETAIL_VOUCHER.REDEEMED" } });
    expect(redeemed).toBe(1);
  });

  it("refuses a wrong secret, a payment without one, and more than is left; nothing is sold", async () => {
    expect(await sell("wrong", brandy(), [byVoucher(vouchers.gift!, 7.4, "AAAAAA"), cash(2.6)])).toMatchObject({ status: 409, body: { error: WRONG_SECRET } });
    expect(await sell("bare", brandy(), [{ tenderType: "VOUCHER", currency: "USD", amount: 10, voucherCode: vouchers.gift!.code }])).toMatchObject({
      status: 400,
      body: { error: "A voucher payment needs its code and its secret." },
    });
    expect(await sell("too-much", [{ productId: ids.jameson!, quantity: 1, unitPrice: 27.9 }], [byVoucher(vouchers.gift!, 15), cash(12.9)])).toMatchObject({
      status: 409,
      body: { error: "That voucher has US$12.60 left." },
    });
    expect([await salesOf("wrong"), await salesOf("bare"), await salesOf("too-much")]).toEqual([0, 0, 0]);
    expect((await prisma.retailVoucher.findUniqueOrThrow({ where: { id: vouchers.gift!.id } })).balance.toFixed(2)).toBe("12.60");
  });

  it("lets only one of two tills spending the same US$7.40 of a US$10.00 voucher at once have it", async () => {
    const both = await Promise.all([
      sell("race-a", brandy(), [byVoucher(vouchers.race!, 7.4), cash(2.6)]),
      sell("race-b", [{ productId: ids.gin!, quantity: 1, unitPrice: 10 }], [byVoucher(vouchers.race!, 7.4), cash(2.6)], {}, true),
    ]);
    expect(both.map((sale) => sale.status).sort()).toEqual([201, 409]);
    expect(both.find((sale) => sale.status === 409)?.body.error).toBe("That voucher has US$2.60 left.");
    const voucher = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: vouchers.race!.id }, include: { uses: true } });
    expect([voucher.balance.toFixed(2), voucher.uses.length]).toEqual(["2.60", 1]);
    expect((await salesOf("race-a")) + (await salesOf("race-b"))).toBe(1);
  }, 30_000);
});

describe("selling a gift voucher", () => {
  it("is paid on top of the goods, issued with the sale, owed in its journal, and not voided at the till", async () => {
    const sold = await sell("sells", [{ productId: ids.castle!, quantity: 1, unitPrice: 1.2 }], [cash(21.2)], { vouchersSold: [{ value: "20.00" }], total: 21.2 });
    expect(sold.status).toBe(201);
    expect(sold.body.vouchersSold).toEqual([expect.objectContaining({ code: expect.stringMatching(/^GV-\d{4}$/), value: "US$20.00", secret: expect.any(String) })]);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! } });
    expect([sale.totalAmount.toFixed(2), sale.vouchersSoldAmount.toFixed(2)]).toEqual(["1.20", "20.00"]);
    const voucher = await prisma.retailVoucher.findFirstOrThrow({ where: { companyId: shop.companyId, soldSaleId: sale.id } });
    expect([voucher.kind, voucher.funding, voucher.balance.toFixed(2)]).toEqual(["GIFT", "SOLD", "20.00"]);
    const journal = await books(sale.id);
    expect(journal["2250"]).toBe(-20);
    expect(balanced(journal)).toBe(0);

    const voided = await voidSale(sale.id);
    expect(voided.status).not.toBe(201);
    expect(voided.body.error).toBe("This sale sold gift vouchers. Void them on Products › Vouchers instead.");
  });
});

describe("a discount voucher", () => {
  it("refuses a basket under its smallest sale, then takes 10% off and gives up one use", async () => {
    const discount = { code: vouchers.discount!.code, secret: vouchers.discount!.secret };
    expect(await sell("dv-small", brandy(), [cash(10)], { discountVoucher: discount })).toMatchObject({
      status: 409,
      body: { error: "It works on sales of US$20.00 or more." },
    });
    const sold = await sell("dv", [{ productId: ids.jameson!, quantity: 1, unitPrice: 27.9 }], [cash(25.11)], { discountVoucher: discount });
    expect(sold.status).toBe(201);
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! } });
    expect([sale.totalAmount.toFixed(2), sale.discountVoucherId]).toEqual(["25.11", vouchers.discount!.id]);
    const voucher = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: vouchers.discount!.id }, include: { uses: true } });
    expect([voucher.usesLeft, voucher.uses.map((use) => use.amount.toFixed(2))]).toEqual([1, ["2.79"]]);
    expect(await sell("dv-as-money", brandy(), [byVoucher(vouchers.discount!, 10)])).toMatchObject({
      status: 400,
      body: { error: `${vouchers.discount!.code} is a discount voucher. Take it off the sale instead.` },
    });
  });
});

describe("voiding a sale paid by voucher", () => {
  it("puts the money back on the voucher, so Vouchers owed is again what the voucher holds", async () => {
    // A US$15.00 gift voucher bought at the till (Cr 2250 15.00), then US$10.00 of it spent (Dr 2250 10.00).
    const bought = await sell("owed-buy", [{ productId: ids.castle!, quantity: 1, unitPrice: 1.2 }], [cash(16.2)], { vouchersSold: [{ value: "15.00" }], total: 16.2 });
    expect(bought.status).toBe(201);
    const voucher = await prisma.retailVoucher.findFirstOrThrow({ where: { companyId: shop.companyId, soldSaleId: bought.body.id! } });
    const secret = voucher.secret;
    const spent = await sell("owed-spend", brandy(), [{ tenderType: "VOUCHER", currency: "USD", amount: 10, voucherCode: voucher.code, voucherSecret: secret }]);
    expect(spent.status).toBe(201);
    expect((await prisma.retailVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).balance.toFixed(2)).toBe("5.00");

    const voided = await voidSale(spent.body.id!);
    expect(voided.status).toBe(201);
    const after = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: voucher.id }, include: { uses: { orderBy: { createdAt: "asc" } } } });
    expect(after.balance.toFixed(2)).toBe("15.00");
    expect(after.uses.map((use) => [use.saleId, use.amount.toFixed(2), use.balanceAfter?.toFixed(2)])).toEqual([
      [spent.body.id, "10.00", "5.00"],
      [voided.body.id, "-10.00", "15.00"],
    ]);
    const reversed = await prisma.retailSalePayment.findFirstOrThrow({ where: { saleId: voided.body.id!, tenderType: "VOUCHER" } });
    expect([reversed.amount.toFixed(2), reversed.voucherId]).toEqual(["-10.00", voucher.id]);
    expect(await prisma.platformAuditEvent.count({ where: { entityId: voucher.id, eventType: "RETAIL_VOUCHER.RESTORED" } })).toBe(1);

    // 2250 over the three journals is what the voucher holds: owed 15, spent 10, put back 10.
    const voidJournal = await books(voided.body.id!, "RETAIL_VOID");
    expect(voidJournal["2250"]).toBe(-10);
    expect(balanced(voidJournal)).toBe(0);
    const owed = -((await books(bought.body.id!))["2250"]! + (await books(spent.body.id!))["2250"]! + voidJournal["2250"]!);
    expect(owed).toBe(Number(after.balance));
  }, 30_000);

  it("refuses to void a sale whose voucher was voided since, and changes nothing", async () => {
    const voucher = await issue({ valueCents: 1000 });
    const spent = await sell("voided-since", brandy(), [byVoucher(voucher, 10)]);
    expect(spent.status).toBe(201);
    await prisma.retailVoucher.update({ where: { id: voucher.id }, data: { voidedAt: new Date(), voidReason: "Reported stolen" } });
    expect(await voidSale(spent.body.id!)).toMatchObject({
      status: 400,
      body: { error: `${voucher.code} was voided, so what was paid with it cannot go back on it.` },
    });
    const sale = await prisma.retailSale.findUniqueOrThrow({ where: { id: spent.body.id! } });
    expect(sale.status).toBe("POSTED");
    expect((await prisma.retailVoucher.findUniqueOrThrow({ where: { id: voucher.id } })).balance.toFixed(2)).toBe("0.00");
  });

  it("gives a discount voucher its use back", async () => {
    const discount = await issue({ kind: "DISCOUNT", funding: "GIVEN", valueCents: null, percentOff: 10, copies: 3 });
    const sold = await sell("dv-void", [{ productId: ids.jameson!, quantity: 1, unitPrice: 27.9 }], [cash(25.11)], {
      discountVoucher: { code: discount.code, secret: discount.secret },
    });
    expect(sold.status).toBe(201);
    expect((await prisma.retailVoucher.findUniqueOrThrow({ where: { id: discount.id } })).usesLeft).toBe(2);
    const voided = await voidSale(sold.body.id!);
    expect(voided.status).toBe(201);
    const after = await prisma.retailVoucher.findUniqueOrThrow({ where: { id: discount.id }, include: { uses: { orderBy: { createdAt: "asc" } } } });
    expect([after.usesLeft, after.uses.map((use) => [use.saleId, use.amount.toFixed(2)])]).toEqual([
      3,
      [
        [sold.body.id, "2.79"],
        [voided.body.id, "-2.79"],
      ],
    ]);
  });
});

describe("refunding onto a voucher", () => {
  it("is refused until a refund issues its credit note", async () => {
    const sold = await sell("refund-voucher", brandy(), [cash(10)]);
    const line = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId: sold.body.id! } });
    const refused = await REFUND(
      new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/sales/${sold.body.id}/refund`, {
        method: "POST",
        headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          shiftId,
          reason: "Damaged",
          lines: [{ saleLineId: line.id, quantity: 1 }],
          payments: [{ tenderType: "VOUCHER", amount: 10 }],
          refundedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        }),
      }),
      { params: Promise.resolve({ id: sold.body.id! }) },
    );
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error?: string }).error).toBe(VOUCHER_REFUND_REFUSAL);
    expect(await prisma.retailSale.count({ where: { companyId: shop.companyId, sourceSaleId: sold.body.id!, saleType: "REFUND" } })).toBe(0);
  });
});

describe("the till's check", () => {
  it("reads a scanned barcode and says what is left", async () => {
    const check = await CHECK(
      new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/vouchers/check?scan=${encodeURIComponent(barcodeText(vouchers.gift!.code, vouchers.gift!.secret))}`, {
        headers: { cookie: `${DEVICE_COOKIE}=${key}` },
      }),
    );
    expect(await check.json()).toMatchObject({ data: { code: vouchers.gift!.code, left: 12.6, usable: true }, usable: true, reason: null });
  });
});
