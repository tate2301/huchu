import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/retail/device-words";
import { hashDeviceKey } from "@/lib/retail/devices";

/**
 * SET-05, W-05: the server stamps the shop's ZiG rate on every ZiG payment and
 * ignores any rate the till sends — on a sale replayed from the offline queue
 * too, which takes the same path (`createRetailSaleTransaction`) as one rung now.
 * Against the test database, on a paired till, with only the sign-in faked.
 * A void of a ZiG cash sale undoes it exactly: the ZiG back as ZiG at the
 * rate stamped on it, the change back into the drawer, the journal reversed.
 */

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api-utils")>()),
  validateSession: validateSessionMock,
}));

import { POST } from "./route";
import { voidRetailSaleTransaction } from "../../_services";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const key = `sync-key-${stamp}`;
const HOUR = 60 * 60 * 1000;
let companyId = "";
let cashierId = "";
let shiftId = "";
let productId = "";

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Sync ${stamp}`, slug: `sync-${stamp}` }, select: { id: true } })).id;
  // These replays read each sale's journal at once: this shop posts with every sale (SET-09).
  await prisma.retailPostingSettings.create({ data: { companyId, schedule: "EVERY_SALE" } });
  const owner = await prisma.user.create({
    data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@sync.test`, password: "x" },
    select: { id: true },
  });
  cashierId = (
    await prisma.user.create({
      data: { companyId, name: "Chipo Dube", role: "CASHIER", email: `chipo-${stamp}@sync.test`, password: "x" },
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
        email: `chipo-${stamp}@sync.test`,
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

function sale(id: string, payment: Record<string, unknown>, soldAt = new Date(Date.now() - 5 * 60 * 1000)) {
  return {
    clientOperationId: id,
    operation: "create-sale",
    offlineCreatedAt: soldAt.toISOString(),
    payload: {
      clientRef: `${id}-${stamp}`,
      shiftId,
      items: [{ productId, quantity: 1 }],
      payments: [payment],
      offlineCreatedAt: soldAt.toISOString(),
      offlineCreated: true,
    },
  };
}

async function sync(operations: unknown[]) {
  const response = await POST(
    new NextRequest("http://pos.test.localtest.me/api/v2/retail/pos/sync", {
      method: "POST",
      headers: { cookie: `${DEVICE_COOKIE}=${key}`, "content-type": "application/json" },
      body: JSON.stringify({ operations }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    results: Array<{ clientOperationId: string; status: string; serverId?: string; error?: string; accountingStatus?: string }>;
  };
  return new Map(body.results.map((result) => [result.clientOperationId, result]));
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

describe("a ZiG cash sale replayed through pos/sync", () => {
  it("is stored at the shop's rate when the till sends none, or another", async () => {
    const results = await sync([
      sale("zig-no-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }),
      sale("zig-own-rate", { tenderType: "CASH", currency: "ZWG", amount: 105, exchangeRate: 5 }),
    ]);

    for (const id of ["zig-no-rate", "zig-own-rate"]) {
      const result = results.get(id)!;
      // And it balances in the books: the base amount, less the change.
      expect(result).toMatchObject({ status: "synced", accountingStatus: "POSTED" });
      const { sale: stored, payment } = await storedPayment(result.serverId!);
      expect(payment).toMatchObject({ tenderType: "CASH", currency: "ZWG" });
      expect(payment.exchangeRate.toString()).toBe("26.8");
      // ZiG 105 at 26.80 is US$3.92 against US$3.90: two cents owed, ZiG 0.54,
      // which the shop's nearest 1 hands back as ZiG 1 (US$0.04).
      expect(payment.baseAmount.toString()).toBe("3.92");
      expect(stored.changeAmount?.toString()).toBe("0.04");
      expect(stored.changeZig.toString()).toBe("1");
      expect(await roundingLines(stored.id)).toEqual([{ debit: 0.02, credit: 0 }]);
    }
  });

  it("fails the operation for a sale rung before the shop had a rate", async () => {
    const results = await sync([
      sale("zig-before-rate", { tenderType: "CASH", currency: "ZWG", amount: 105 }, new Date(Date.now() - 2 * HOUR)),
    ]);
    expect(results.get("zig-before-rate")).toMatchObject({
      status: "failed",
      error: "There is no ZiG rate yet. Set it in Payments.",
    });
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
      const id = `usd-change-${step}`;
      const result = (await sync([sale(id, { tenderType: "CASH", currency: "USD", amount: 5 })])).get(id)!;
      expect(result).toMatchObject({ status: "synced", accountingStatus: "POSTED" });
      const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: result.serverId! } });
      expect([stored.changeZig.toString(), stored.changeAmount?.toString()]).toEqual([zig, change]);
      expect(await roundingLines(stored.id)).toEqual([rounding]);
    }
  });
});

describe("tenders on a sale sent in from the offline queue", () => {
  it("refuses one on account, which no customer would owe", async () => {
    const results = await sync([sale("on-account", { tenderType: "ON_ACCOUNT", amount: 3.9 })]);
    expect(results.get("on-account")).toMatchObject({
      status: "failed",
      error: "Selling on account needs the customer’s account, which the till cannot take yet.",
    });
    expect(await prisma.retailSale.count({ where: { companyId, clientRef: `on-account-${stamp}` } })).toBe(0);
  });

  it("takes one turned off since, for a manager to look at", async () => {
    // InnBucks is off (the shop's defaults); the till took it before it was.
    const results = await sync([sale("innbucks-off", { tenderType: "INNBUCKS", amount: 3.9, reference: "IB-77120" })]);
    const result = results.get("innbucks-off")!;
    expect(result).toMatchObject({ status: "synced" });
    const stored = await prisma.retailSale.findUniqueOrThrow({ where: { id: result.serverId! } });
    expect(stored.reviewReason).toBe("Paid by InnBucks, turned off in Payments since.");
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
    const result = (await sync([sale("zig-void", { tenderType: "CASH", currency: "ZWG", amount: 109 })])).get("zig-void")!;
    expect(result).toMatchObject({ status: "synced", accountingStatus: "POSTED" });
    const { sale: sold } = await storedPayment(result.serverId!);
    expect([sold.changeZig.toString(), sold.changeAmount?.toString()]).toEqual(["5", "0.19"]);
    expect(Number(await expectedCash())).toBeCloseTo(Number(before) + 4.07 - 0.19, 2);

    const { sale: voided, accounting } = await voidRetailSaleTransaction({
      actor: { companyId, userId: cashierId, userRole: "CASHIER", userName: "Chipo Dube", userEmail: null },
      saleId: sold.id,
      shiftId,
      reason: "Rang the wrong tender",
      approvedBy: { id: cashierId, name: "Tafara Nyathi" },
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
