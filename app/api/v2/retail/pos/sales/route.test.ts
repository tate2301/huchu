import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";
import { harareClock } from "@/lib/retail/licence-hours";

/**
 * `pos/sales`, and the refund and void beside it, as the till's offline queue
 * sends them in: a sale with `offlineCreatedAt`, a refund with `refundedAt`, a
 * void with `voidedAt`. SET-05, W-05: the server stamps the shop's ZiG rate on
 * every ZiG payment and ignores any rate the till sends. A void of a ZiG cash
 * sale undoes it exactly: the ZiG back as ZiG at the rate stamped on it, the
 * change back into the drawer, the journal reversed. SET-06: what the counter
 * would refuse goes in for a manager to look at when it was really done
 * offline, and is refused when it was not. Against the test database, on a
 * paired till, with only the sign-in faked.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST as SELL } from "./route";
import { POST as REFUND } from "./[id]/refund/route";
import { POST as VOID } from "./[id]/void/route";
import { voidRetailSaleTransaction } from "../../_services";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `sales-key-${stamp}`;
const MINUTE = 60 * 1000;
const HOUR = 60 * 60 * 1000;
let companyId = "";
let cashierId = "";
let shiftId = "";
let productId = "";
let tonicId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Sales ${stamp}`, slug: `sales-${stamp}` }, select: { id: true } })).id;
  // These replays read each sale's journal at once: this shop posts with every sale (SET-09).
  await prisma.retailPostingSettings.create({ data: { companyId, schedule: "EVERY_SALE" } });
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@sales.test`, password: "x" },
    select: { id: true },
  });
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@sales.test`, password: "x" },
      select: { id: true },
    })
  ).id;
  const site = await prisma.site.create({ data: { companyId, name: "Harare Main Branch", code: "HRE" }, select: { id: true } });
  const location = await prisma.stockLocation.create({ data: { siteId: site.id, code: "FLOOR", name: "Shop floor" } });
  const till = await prisma.retailRegister.create({
    data: { companyId, siteId: site.id, code: "FRONT", name: "Front till" },
    select: { id: true, code: true, name: true },
  });
  const device = await prisma.retailDevice.create({
    data: { companyId, registerId: till.id, kind: "BROWSER", label: "Windows PC", keyHash: hashDeviceKey(key), pairedById: owner.id },
    select: { id: true },
  });
  shiftId = (
    await prisma.retailShift.create({
      data: {
        companyId,
        shiftNo: `SH-${stamp}`,
        registerCode: till.code,
        registerName: till.name,
        registerId: till.id,
        deviceId: device.id,
        siteId: site.id,
        cashierId,
        cashierName: "Chipo Dube",
        openedAt: new Date(Date.now() - 4 * HOUR),
      },
      select: { id: true },
    })
  ).id;
  productId = (
    await prisma.product.create({
      data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml", standardPrice: 3.9 },
      select: { id: true },
    })
  ).id;
  await prisma.inventoryItem.create({
    data: {
      itemCode: `CASTLE-${stamp}`,
      name: "Castle Lager 340ml",
      category: "BEVERAGES",
      unit: "pieces",
      siteId: site.id,
      locationId: location.id,
      currentStock: 50,
      unitCost: 2,
      productId,
    },
  });
  tonicId = (
    await prisma.product.create({
      data: { companyId, code: `TONIC-${stamp}`, name: "Schweppes Tonic 200ml", standardPrice: 1.2 },
      select: { id: true },
    })
  ).id;
  await prisma.inventoryItem.create({
    data: {
      itemCode: `TONIC-${stamp}`,
      name: "Schweppes Tonic 200ml",
      category: "BEVERAGES",
      unit: "pieces",
      siteId: site.id,
      locationId: location.id,
      currentStock: 20,
      unitCost: 0.6,
      productId: tonicId,
    },
  });
  // The shop's rate, set an hour ago: 26.80 ZiG to the dollar.
  await prisma.currencyRate.create({
    data: {
      companyId,
      baseCurrency: "USD",
      quoteCurrency: "ZWG",
      rate: 26.8,
      effectiveDate: new Date(Date.now() - HOUR),
      createdById: owner.id,
    },
  });
  validateSessionMock.mockResolvedValue({
    session: {
      user: {
        id: cashierId,
        companyId,
        role: "CASHIER",
        name: "Chipo Dube",
        email: `chipo-${stamp}@sales.test`,
        enabledFeatures: ["retail.core"],
      },
    },
  });
});

afterAll(async () => {
  if (!companyId) return;
  const sales = { sale: { companyId } };
  await prisma.retailSalePayment.deleteMany({ where: sales });
  await prisma.retailSaleLine.deleteMany({ where: sales });
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.stockMovement.deleteMany({ where: { item: { site: { companyId } } } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.retailShift.deleteMany({ where: { companyId } });
  await prisma.retailDevice.deleteMany({ where: { companyId } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.product.deleteMany({ where: { companyId } });
  // The sale's posting seeds the shop's books and writes its journal.
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.taxTemplateLine.deleteMany({ where: { template: { companyId } } });
  await prisma.postingRule.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

type Result = { status: number; body: Record<string, unknown> & { id?: string; error?: string; accountingStatus?: string } };

function request(path: string, body: unknown) {
  return new NextRequest(`http://pos.test.localtest.me/api/v2/retail/pos/${path}`, {
    method: "POST",
    headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function result(response: Response): Promise<Result> {
  return { status: response.status, body: await response.json() };
}

/** A Castle sold offline (5 minutes ago unless said), sent in from the queue. */
function sell(
  ref: string,
  payment: Record<string, unknown>,
  soldAt = new Date(Date.now() - 5 * MINUTE),
  extra: Record<string, unknown> = {},
) {
  return SELL(
    request("sales", {
      clientRef: `${ref}-${stamp}`,
      shiftId,
      items: [{ productId, quantity: 1 }],
      payments: [payment],
      offlineCreatedAt: soldAt.toISOString(),
      ...extra,
    }),
  ).then(result);
}

/** A void, dated by the till. */
function voidSale(saleId: string, body: Record<string, unknown>) {
  return VOID(request(`sales/${saleId}/void`, { shiftId, ...body }), { params: Promise.resolve({ id: saleId }) }).then(result);
}

/** A refund of the sale's one Castle, dated by the till. */
async function refundSale(saleId: string, body: Record<string, unknown>) {
  const line = await prisma.retailSaleLine.findFirstOrThrow({ where: { saleId }, select: { id: true } });
  return REFUND(
    request(`sales/${saleId}/refund`, { shiftId, lines: [{ saleLineId: line.id, quantity: 1 }], ...body }),
    { params: Promise.resolve({ id: saleId }) },
  ).then(result);
}

/** The sale journal's change rounding lines, against cash over short. */
async function roundingLines(saleId: string) {
  const entry = await prisma.journalEntry.findFirstOrThrow({
    where: { companyId, sourceType: "RETAIL_SALE", sourceId: saleId },
    select: { lines: { where: { account: { code: "5420" } }, select: { debit: true, credit: true } } },
  });
  return entry.lines;
}

async function storedPayment(saleId: string) {
  const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: saleId }, include: { payments: true } });
  return { sale: stored, payment: stored.payments[0]! };
}

const reviewOf = async (saleId: string | undefined) =>
  (await prisma.retailSale.findUniqueOrThrow({ where: { id: saleId! } })).reviewReason;

/** When a refund or void was done offline: after the sale (5 minutes ago), more than a minute before it arrives. */
const offlineAct = () => new Date(Date.now() - 3 * MINUTE).toISOString();

async function tillRules(voidPin: "NEVER" | "ALWAYS" | "AFTER_5_MINUTES") {
  await prisma.retailTillRules.upsert({ where: { companyId }, update: { voidPin }, create: { companyId, voidPin } });
}

describe("a ZiG cash sale replayed from the offline queue", () => {
  it("is stored at the shop's rate when the till sends none, or another", async () => {
    for (const [ref, payment] of [
      ["zig-no-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }],
      ["zig-own-rate", { tenderType: "CASH", currency: "ZWG", amount: 105, exchangeRate: 5 }],
    ] as const) {
      const sold = await sell(ref, payment);
      // And it balances in the books: the base amount, less the change.
      expect(sold).toMatchObject({ status: 201, body: { accountingStatus: "POSTED" } });
      const { sale: stored, payment: stamped } = await storedPayment(sold.body.id!);
      expect(stamped).toMatchObject({ tenderType: "CASH", currency: "ZWG" });
      expect(stamped.exchangeRate.toString()).toBe("26.8");
      // ZiG 105 at 26.80 is US$3.92 against US$3.90: two cents owed, ZiG 0.54,
      // which the shop's nearest 1 hands back as ZiG 1 (US$0.04).
      expect(stamped.baseAmount.toString()).toBe("3.92");
      expect(stored.changeAmount?.toString()).toBe("0.04");
      expect(stored.changeZig.toString()).toBe("1");
      expect(await roundingLines(stored.id)).toEqual([{ debit: 0.02, credit: 0 }]);
    }
  });

  it("is refused when it was rung before the shop had a rate", async () => {
    const sold = await sell("zig-before-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }, new Date(Date.now() - 2 * HOUR));
    expect(sold).toMatchObject({ status: 400, body: { error: "There is no ZiG rate yet. Set it in Payments." } });
    expect(await prisma.retailSale.count({ where: { companyId, clientRef: `zig-before-rate-${stamp}` } })).toBe(0);
  });
});

describe("change on a sale, by the shop's ZiG rule", () => {
  it("hands back whole dollars, then ZiG rounded to the step, and posts what the rounding left", async () => {
    // US$5 for US$3.90 at 26.80: US$1.10 owed, US$1 and ZiG 2.68.
    const steps = [
      { step: "0.50", zig: "2.5", change: "1.09", rounding: { debit: 0, credit: 0.01 } },
      { step: "1", zig: "3", change: "1.11", rounding: { debit: 0.01, credit: 0 } },
      { step: "5", zig: "5", change: "1.19", rounding: { debit: 0.09, credit: 0 } },
    ];
    for (const { step, zig, change, rounding } of steps) {
      await prisma.retailPaymentSettings.upsert({
        where: { companyId },
        update: { zigChangeRounding: step },
        create: { companyId, zigChangeRounding: step },
      });
      const sold = await sell(`usd-change-${step}`, { tenderType: "CASH", currency: "USD", amount: 5 });
      expect(sold).toMatchObject({ status: 201, body: { accountingStatus: "POSTED" } });
      const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! } });
      expect([stored.changeZig.toString(), stored.changeAmount?.toString()]).toEqual([zig, change]);
      expect(await roundingLines(stored.id)).toEqual([rounding]);
    }
  }, 30_000);
});

describe("tenders on a sale sent in from the offline queue", () => {
  it("refuses one on account, which no customer would owe", async () => {
    const sold = await sell("on-account", { tenderType: "ON_ACCOUNT", amount: 3.9 });
    expect(sold).toMatchObject({
      status: 400,
      body: { error: "Selling on account needs the customer’s account, which the till cannot take yet." },
    });
    expect(await prisma.retailSale.count({ where: { companyId, clientRef: `on-account-${stamp}` } })).toBe(0);
  });

  it("takes one turned off since, for a manager to look at", async () => {
    // InnBucks is off (the shop's defaults); the till took it before it was.
    const sold = await sell("innbucks-off", { tenderType: "INNBUCKS", amount: 3.9, reference: "IB-77120" });
    expect(sold.status).toBe(201);
    expect(await reviewOf(sold.body.id)).toBe("Paid by InnBucks, turned off in Payments since.");
  });
});

describe("a void of a ZiG cash sale with rounded change", () => {
  it("puts the drawer back where it was and reverses the sale's journal exactly", async () => {
    await prisma.retailPaymentSettings.upsert({
      where: { companyId },
      update: { zigChangeRounding: "1" },
      create: { companyId, zigChangeRounding: "1" },
    });
    const expectedCash = async () =>
      (await prisma.retailShift.findUniqueOrThrow({ where: { id: shiftId } })).expectedCash.toString();
    const before = await expectedCash();

    // ZiG 109 at 26.80 is US$4.07 for US$3.90: 17 cents owed, ZiG 4.56, which
    // the shop's nearest 1 hands back as ZiG 5 (US$0.19), two cents given.
    const result = await sell("zig-void", { tenderType: "CASH", currency: "ZWG", amount: 109 });
    expect(result).toMatchObject({ status: 201, body: { accountingStatus: "POSTED" } });
    const { sale: sold } = await storedPayment(result.body.id!);
    expect([sold.changeZig.toString(), sold.changeAmount?.toString()]).toEqual(["5", "0.19"]);
    expect(Number(await expectedCash())).toBeCloseTo(Number(before) + 4.07 - 0.19, 2);

    // The cashier voids on her own: this shop's till rules ask no PIN for a void (SET-06).
    await tillRules("NEVER");
    const { sale: voided, accounting } = await voidRetailSaleTransaction({
      actor: { companyId, userId: cashierId, userRole: "CASHIER", userName: "Chipo Dube", userEmail: null },
      saleId: sold.id,
      shiftId,
      reason: "Rang up wrong",
    });
    expect(accounting.accountingStatus).toBe("POSTED");
    expect(await expectedCash()).toBe(before);
    expect(voided.payments).toHaveLength(1);
    expect(voided.payments[0]).toMatchObject({ tenderType: "CASH", currency: "ZWG" });
    expect(
      [voided.payments[0]!.amount, voided.payments[0]!.exchangeRate, voided.payments[0]!.baseAmount].map(String),
    ).toEqual(["-109", "26.8", "-4.07"]);
    expect([voided.changeZig.toString(), voided.changeAmount?.toString()]).toEqual(["-5", "-0.19"]);

    const journal = async (sourceType: "RETAIL_SALE" | "RETAIL_VOID", sourceId: string) => {
      const entry = await prisma.journalEntry.findFirstOrThrow({
        where: { companyId, sourceType, sourceId },
        select: { lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } },
      });
      const byAccount = new Map<string, number>();
      for (const line of entry.lines) {
        const net = Number(line.debit) - Number(line.credit);
        byAccount.set(line.account.code, Number(((byAccount.get(line.account.code) ?? 0) + net).toFixed(2)));
      }
      return byAccount;
    };
    const saleBooks = await journal("RETAIL_SALE", sold.id);
    const voidBooks = await journal("RETAIL_VOID", voided.id);
    expect(saleBooks.get("5420")).toBe(0.02);
    expect([...voidBooks.entries()].sort()).toEqual([...saleBooks.entries()].map(([code, net]) => [code, -net]).sort());
    expect([...voidBooks.values()].reduce((total, net) => total + net, 0)).toBeCloseTo(0, 2);
  });
});

describe("the till rules on a sale and a void sent in from the offline queue (SET-06)", () => {
  /** Two Castles at US$3.90, with the order discount the cashier keyed. */
  function discounted(ref: string, discountAmount: number) {
    return sell(ref, { tenderType: "CASH", currency: "USD", amount: Number((7.8 - discountAmount).toFixed(2)) }, undefined, {
      items: [{ productId, quantity: 2 }],
      discountAmount,
      overrideReason: "Regular customer",
    });
  }

  it("takes a discount over the cashier's largest, marked for a manager, and one within it clean", async () => {
    const over = await discounted("discount-over", 2);
    const within = await discounted("discount-within", 0.5);
    expect([over.status, within.status]).toEqual([201, 201]);
    // US$2 off US$7.80 is 25.6%, over the shop's 10%.
    expect(await reviewOf(over.body.id)).toBe("Discount over 10% given while offline.");
    expect(await reviewOf(within.body.id)).toBeNull();
  });

  it("takes a void the rule wanted a manager for, marked for one, since the money has gone", async () => {
    await tillRules("ALWAYS");
    const sold = await sell("void-later", { tenderType: "CASH", currency: "USD", amount: 3.9 });
    expect(sold.status).toBe(201);
    const voided = await voidSale(sold.body.id!, { reason: "Customer left", voidedAt: offlineAct() });
    expect(voided.status).toBe(201);
    expect(await reviewOf(voided.body.id)).toBe("Voided offline without the manager PIN it needed. Voids need a manager PIN.");
  });
});

describe("the discount ceiling, line by line (SET-06, W-64)", () => {
  /** Five Castles at US$3.90 and a tonic at US$1.20 given away: 5.8% off the basket, 100% off one line. */
  const items = () => [
    { productId, quantity: 5 },
    { productId: tonicId, quantity: 1, discountAmount: 1.2 },
  ];

  it("asks for a manager at the counter, however big the rest of the basket", async () => {
    const response = await SELL(
      request("sales", {
        clientRef: `free-line-${stamp}`,
        shiftId,
        items: items(),
        overrideReason: "Regular customer",
        payments: [{ tenderType: "CASH", currency: "USD", amount: 19.5 }],
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      needsApprover: true,
      reason: "Discounts over 10% need a manager PIN.",
    });
    expect(await prisma.retailSale.count({ where: { companyId, clientRef: `free-line-${stamp}` } })).toBe(0);
  });

  it("takes it from the offline queue, marked for a manager", async () => {
    const sold = await sell("free-line-offline", { tenderType: "CASH", currency: "USD", amount: 19.5 }, undefined, {
      items: items(),
      overrideReason: "Regular customer",
    });
    expect(sold.status).toBe(201);
    expect(await reviewOf(sold.body.id)).toBe("Discount over 10% given while offline.");
  });
});

describe("a product's own most off (maxDiscountPercent)", () => {
  beforeAll(async () => {
    await prisma.product.update({ where: { id: tonicId }, data: { maxDiscountPercent: 10 } });
  });
  afterAll(async () => {
    await prisma.product.update({ where: { id: tonicId }, data: { maxDiscountPercent: null } });
  });

  it("refuses a line over it at the counter, managers included, and takes one within it", async () => {
    await prisma.retailTillRules.upsert({
      where: { companyId },
      update: { maxCashierDiscountPercent: 100 },
      create: { companyId, maxCashierDiscountPercent: 100 },
    });
    const line = (ref: string, discountAmount: number) =>
      SELL(
        request("sales", {
          clientRef: `${ref}-${stamp}`,
          shiftId,
          items: [{ productId: tonicId, quantity: 2, discountAmount }],
          overrideReason: "Regular customer",
          payments: [{ tenderType: "CASH", currency: "USD", amount: Number((2.4 - discountAmount).toFixed(2)) }],
        }),
      ).then(result);
    // 10% of two tonics at US$1.20 is US$0.24.
    expect(await line("ceiling-over", 0.3)).toMatchObject({
      status: 400,
      body: { error: "The most off Schweppes Tonic 200ml is 10% (US$0.24)." },
    });
    expect((await line("ceiling-within", 0.24)).status).toBe(201);
  });

  it("takes one over it from the offline queue, marked for a manager", async () => {
    const sold = await sell("ceiling-offline", { tenderType: "CASH", currency: "USD", amount: 1.2 }, undefined, {
      items: [{ productId: tonicId, quantity: 2, discountAmount: 1.2 }],
      overrideReason: "Regular customer",
    });
    expect(sold.status).toBe(201);
    expect(await reviewOf(sold.body.id)).toContain(
      "The most off Schweppes Tonic 200ml is 10% (US$0.24). Given while offline.",
    );
  });

  afterAll(async () => {
    await prisma.retailTillRules.update({ where: { companyId }, data: { maxCashierDiscountPercent: 10 } });
  });
});

describe("a refund or void sent in late that the rules would refuse now (SET-06)", () => {
  it("takes a card refund without its reference, marked for review", async () => {
    const sold = await sell("card-sale", { tenderType: "CARD", currency: "USD", amount: 3.9, reference: "SLIP-4410" });
    expect(sold.status).toBe(201);
    const refunded = await refundSale(sold.body.id!, {
      reason: "Damaged",
      payments: [{ tenderType: "CARD", amount: 3.9 }],
      refundedAt: offlineAct(),
    });
    expect(refunded.status).toBe(201);
    expect(await reviewOf(refunded.body.id)).toBe("Refunded offline without a reference.");
  });

  it("takes a void whose reason was taken off the list since, marked for review", async () => {
    await tillRules("NEVER");
    const sold = await sell("void-unlisted", { tenderType: "CASH", currency: "USD", amount: 3.9 });
    const voided = await voidSale(sold.body.id!, { reason: "Price check", voidedAt: offlineAct() });
    expect(voided.status).toBe(201);
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: voided.body.id! } });
    expect([stored.overrideReason, stored.reviewReason]).toEqual(["Price check", "Reason no longer on the list."]);
  });
});

describe("a refund or void dated now, not done offline (SET-06)", () => {
  const now = () => new Date().toISOString();

  it("refuses a void without the manager PIN the rule asks for, as the counter does", async () => {
    await tillRules("ALWAYS");
    const sold = await sell("void-now-sale", { tenderType: "CASH", currency: "USD", amount: 3.9 });
    const voided = await voidSale(sold.body.id!, { reason: "Customer left", voidedAt: now() });
    expect(voided).toMatchObject({ status: 409, body: { needsApprover: true, error: "Voids need a manager PIN." } });
    expect(await prisma.retailSale.count({ where: { companyId, sourceSaleId: sold.body.id! } })).toBe(0);
  });

  it("refuses an unlisted reason and a card refund without its reference", async () => {
    await tillRules("NEVER");
    const sold = await sell("refund-now-sale", { tenderType: "CARD", currency: "USD", amount: 3.9, reference: "SLIP-5521" });
    const unlisted = await refundSale(sold.body.id!, {
      reason: "Gone off list",
      payments: [{ tenderType: "CARD", amount: 3.9, reference: "SLIP-5521" }],
      refundedAt: now(),
    });
    const noReference = await refundSale(sold.body.id!, {
      reason: "Damaged",
      payments: [{ tenderType: "CARD", amount: 3.9 }],
      refundedAt: now(),
    });
    expect(unlisted).toMatchObject({ status: 400, body: { error: "Pick a reason from the list." } });
    expect(noReference).toMatchObject({
      status: 400,
      body: { error: "Card needs its slip or confirmation number, 4 characters or more." },
    });
    expect(await prisma.retailSale.count({ where: { companyId, sourceSaleId: sold.body.id! } })).toBe(0);
  });
});

describe("a void from the offline queue and the five free minutes (SET-06, W-64)", () => {
  beforeAll(() => tillRules("AFTER_5_MINUTES"));

  it("takes one done offline inside the five minutes clean", async () => {
    const sold = await sell("void-quick-sale", { tenderType: "CASH", currency: "USD", amount: 3.9 }, new Date(Date.now() - 3 * MINUTE));
    const voidedAt = new Date(Date.now() - 2 * MINUTE);
    const voided = await voidSale(sold.body.id!, { reason: "Customer left", voidedAt: voidedAt.toISOString() });
    expect(voided.status).toBe(201);
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: voided.body.id! } });
    expect(stored.reviewReason).toBeNull();
    expect(stored.postedAt?.toISOString()).toBe(voidedAt.toISOString());
  });

  it("judges the rule when the void arrives, not when the till dates it", async () => {
    // Sold 30 minutes ago; the till says it was voided a minute later. The
    // counter would ask for a PIN now, so it goes in for a manager to look at.
    const sold = await sell("void-backdated-sale", { tenderType: "CASH", currency: "USD", amount: 3.9 }, new Date(Date.now() - 30 * MINUTE));
    const voided = await voidSale(sold.body.id!, {
      reason: "Customer left",
      voidedAt: new Date(Date.now() - 29 * MINUTE).toISOString(),
    });
    expect(voided.status).toBe(201);
    expect(await reviewOf(voided.body.id)).toBe(
      "Voided offline without the manager PIN it needed. Voids after 5 minutes need a manager PIN.",
    );
  });

  it("enters a void dated before its sale when it arrives, marked for review", async () => {
    const sold = await sell("void-before-sale-sale", { tenderType: "CASH", currency: "USD", amount: 3.9 }, new Date(Date.now() - 3 * HOUR));
    const arriving = Date.now();
    const voided = await voidSale(sold.body.id!, {
      reason: "Customer left",
      voidedAt: new Date(Date.now() - 5 * HOUR).toISOString(),
    });
    expect(voided.status).toBe(201);
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: voided.body.id! } });
    expect(stored.reviewReason).toBe(
      "Voided offline without the manager PIN it needed. Voids after 5 minutes need a manager PIN. " +
        "Dated before its sale or its shift; entered when it arrived.",
    );
    expect(stored.postedAt!.getTime()).toBeGreaterThanOrEqual(arriving);
  });

  it("enters a refund dated before its sale when it arrives, marked for review", async () => {
    const sold = await sell("refund-before-sale-sale", { tenderType: "CASH", currency: "USD", amount: 3.9 }, new Date(Date.now() - 2 * HOUR));
    const arriving = Date.now();
    const refunded = await refundSale(sold.body.id!, {
      reason: "Damaged",
      payments: [{ tenderType: "CASH", amount: 3.9 }],
      refundedAt: new Date(Date.now() - 3 * HOUR).toISOString(),
    });
    expect(refunded.status).toBe(201);
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: refunded.body.id! } });
    expect(stored.reviewReason).toBe("Dated before its sale or its shift; entered when it arrived.");
    expect(stored.postedAt!.getTime()).toBeGreaterThanOrEqual(arriving);
  });
});

describe("a liquor store's licence on a sale (per site, per weekday)", () => {
  let ginId = "";

  beforeAll(async () => {
    ginId = (
      await prisma.product.create({
        data: { companyId, code: `GIN-${stamp}`, name: "Gordon's Gin 750ml", standardPrice: 18, ageRestricted: true },
        select: { id: true },
      })
    ).id;
    const shelf = await prisma.inventoryItem.findFirstOrThrow({ where: { productId }, select: { siteId: true, locationId: true } });
    await prisma.inventoryItem.create({
      data: {
        itemCode: `GIN-${stamp}`,
        name: "Gordon's Gin 750ml",
        category: "BEVERAGES",
        unit: "pieces",
        siteId: shelf.siteId,
        locationId: shelf.locationId,
        currentStock: 10,
        unitCost: 11,
        productId: ginId,
      },
    });
    await prisma.retailShopProfile.create({
      data: { companyId, businessType: "LIQUOR", ageCheck: true, licenceHours: true, emptiesAndDeposits: false },
    });
  });

  afterAll(async () => {
    await prisma.retailLicenceHours.deleteMany({ where: { companyId } });
    await prisma.retailShopProfile.deleteMany({ where: { companyId } });
  });

  const gin = (ref: string, extra: Record<string, unknown> = {}) =>
    SELL(
      request("sales", {
        clientRef: `${ref}-${stamp}`,
        shiftId,
        items: [{ productId: ginId, quantity: 1 }],
        payments: [{ tenderType: "CASH", currency: "USD", amount: 18 }],
        ...extra,
      }),
    ).then(result);

  it("asks for the ID check, and stamps it on the sale", async () => {
    expect(await gin("gin-no-id")).toMatchObject({
      status: 409,
      body: { error: "Check the customer's ID before selling Gordon's Gin 750ml." },
    });
    const sold = await gin("gin-id", { idChecked: true });
    expect(sold.status).toBe(201);
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: sold.body.id! } });
    expect(stored.idCheckedAt).not.toBeNull();
  });

  it("stops it on a day this branch's licence does not sell", async () => {
    const shelf = await prisma.inventoryItem.findFirstOrThrow({ where: { productId: ginId }, select: { siteId: true } });
    const { weekday } = harareClock(new Date());
    await prisma.retailLicenceHours.create({
      data: { companyId, siteId: shelf.siteId, weekday, alcoholFrom: 0, alcoholUntil: 0 },
    });
    const refused = await gin("gin-closed", { idChecked: true });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/^Gordon's Gin 750ml can't be sold today under the licence\./);
  });
});
