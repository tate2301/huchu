/**
 * FD-2 — fiscal day lifecycle, against a real Postgres.
 *
 * These tests need the database, and deliberately so. Every invariant this
 * module has is enforced by Postgres — the partial unique index that permits
 * one open day per device, the row lock a single `UPDATE ... RETURNING` takes —
 * and a mocked client would prove the mock, not the constraint. The concurrency
 * test in particular is the whole point: it fires twenty real reservations at
 * one row and asserts the numbers come out gap-free.
 *
 * No network is involved. The closing signature is supplied by a callback so
 * the device key never has to exist here.
 *
 * Run: npx vitest run lib/accounting/fiscal-day
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@corelithzw/db/client";
import {
  FISCAL_DAY_STATUS,
  FiscalDayAlreadyOpenError,
  FiscalDayConfigError,
  FiscalDayHasPendingReceiptsError,
  FiscalDayNotOpenError,
  aggregateFiscalDayCounters,
  closeFiscalDay,
  getOpenFiscalDay,
  openFiscalDay,
  recordReceiptHash,
  requireOpenFiscalDay,
  reserveNextReceiptNumbers,
} from "@/lib/accounting/fiscal-day";

const suite = crypto.randomUUID().slice(0, 8);

let companyId: string;
/** RetailSale.siteId is a real foreign key; the sales below need a site that exists. */
let siteId: string;
/** The device the lifecycle tests run against, in order. */
let providerConfigId: string;
/** A second device, used by the concurrent-open test so it does not fight the
 *  first device's day. */
let raceConfigId: string;
/** A third device, kept unregistered (no deviceId) for the refusal test. */
let unregisteredConfigId: string;

const retailSaleIds: string[] = [];

/** A fiscal receipt needs exactly one source document
 *  (`FiscalReceipt_one_source_check`). A RetailSale is the cheapest one to
 *  fabricate — its companyId and siteId are loose strings today (FD-7.2). */
async function createReceipt(args: {
  fiscalDayId: string;
  receiptCounter: number;
  receiptGlobalNo: number;
  status: "PENDING" | "SUCCESS" | "FAILED" | "VOIDED";
  receiptType?: string;
  receiptCurrency?: string;
}) {
  const sale = await prisma.retailSale.create({
    data: {
      companyId,
      saleNo: `FD2-${suite}-${crypto.randomUUID().slice(0, 8)}`,
      siteId,
      currency: args.receiptCurrency ?? "USD",
    },
  });
  retailSaleIds.push(sale.id);

  return prisma.fiscalReceipt.create({
    data: {
      companyId,
      retailSaleId: sale.id,
      status: args.status,
      fiscalDayId: args.fiscalDayId,
      receiptCounter: args.receiptCounter,
      receiptGlobalNo: args.receiptGlobalNo,
      receiptType: args.receiptType ?? "FISCALINVOICE",
      receiptCurrency: args.receiptCurrency ?? "USD",
      providerKey: `zimra-${suite}`,
    },
  });
}

beforeAll(async () => {
  await prisma.$connect();
  const company = await prisma.company.create({
    data: { name: "FD-2 Fiscal Day Test Co", slug: `fd2-${suite}` },
  });
  companyId = company.id;

  const site = await prisma.site.create({
    data: { companyId, name: `Fiscal test site ${suite}`, code: `FT-${suite}` },
    select: { id: true },
  });
  siteId = site.id;

  const main = await prisma.fiscalisationProviderConfig.create({
    data: { companyId, providerKey: `zimra-${suite}`, deviceId: "10001", isActive: true },
  });
  providerConfigId = main.id;

  const race = await prisma.fiscalisationProviderConfig.create({
    data: { companyId, providerKey: `zimra-race-${suite}`, deviceId: "10002", isActive: true },
  });
  raceConfigId = race.id;

  const unregistered = await prisma.fiscalisationProviderConfig.create({
    data: { companyId, providerKey: `zimra-unreg-${suite}`, deviceId: null, isActive: true },
  });
  unregisteredConfigId = unregistered.id;
});

afterAll(async () => {
  await prisma.fiscalReceipt.deleteMany({ where: { companyId } });
  await prisma.retailSale.deleteMany({ where: { id: { in: retailSaleIds } } });
  await prisma.fiscalDay.deleteMany({ where: { companyId } });
  await prisma.fiscalisationProviderConfig.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
  await prisma.$disconnect();
});

describe("openFiscalDay", () => {
  it("opens day 1 with zeroed counters and no chain head", async () => {
    const day = await openFiscalDay({ companyId, providerConfigId });

    expect(day.fiscalDayNo).toBe(1);
    expect(day.status).toBe(FISCAL_DAY_STATUS.OPENED);
    expect(day.deviceId).toBe("10001");
    expect(day.lastReceiptCounter).toBe(0);
    expect(day.lastReceiptGlobalNo).toBe(0);
    expect(day.lastReceiptHash).toBeNull();
    expect(day.closedAt).toBeNull();
  });

  it("refuses a second day while one is open on the device", async () => {
    await expect(openFiscalDay({ companyId, providerConfigId })).rejects.toBeInstanceOf(
      FiscalDayAlreadyOpenError,
    );
  });

  it("refuses to open a day on a device with no deviceId", async () => {
    await expect(
      openFiscalDay({ companyId, providerConfigId: unregisteredConfigId }),
    ).rejects.toBeInstanceOf(FiscalDayConfigError);
  });

  it("lets exactly one of five simultaneous opens win", async () => {
    // The pre-read in openFiscalDay cannot decide this — all five can read "no
    // day open" before any of them inserts. The partial unique index does.
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => openFiscalDay({ companyId, providerConfigId: raceConfigId })),
    );

    const won = results.filter((r) => r.status === "fulfilled");
    expect(won).toHaveLength(1);
    for (const lost of results.filter((r) => r.status === "rejected")) {
      expect((lost as PromiseRejectedResult).reason).toBeInstanceOf(FiscalDayAlreadyOpenError);
    }

    const rows = await prisma.fiscalDay.findMany({ where: { providerConfigId: raceConfigId } });
    expect(rows).toHaveLength(1);
  });

  it("finds the open day and requires it without throwing", async () => {
    const found = await getOpenFiscalDay({ companyId, providerConfigId });
    expect(found?.fiscalDayNo).toBe(1);
    await expect(requireOpenFiscalDay({ companyId, providerConfigId })).resolves.toMatchObject({
      status: FISCAL_DAY_STATUS.OPENED,
    });
  });
});

describe("reserveNextReceiptNumbers", () => {
  it("hands 20 concurrent callers 20 distinct gap-free numbers", async () => {
    const day = await requireOpenFiscalDay({ companyId, providerConfigId });

    const reserved = await Promise.all(
      Array.from({ length: 20 }, () => reserveNextReceiptNumbers(day.id)),
    );

    const counters = reserved.map((r) => r.receiptCounter).sort((a, b) => a - b);
    const globals = reserved.map((r) => r.receiptGlobalNo).sort((a, b) => a - b);
    const expected = Array.from({ length: 20 }, (_, i) => i + 1);

    expect(new Set(counters).size).toBe(20);
    expect(counters).toEqual(expected);
    // Day 1 is the device's first, so the global numbers track the day counters.
    expect(globals).toEqual(expected);

    const after = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.lastReceiptCounter).toBe(20);
    expect(after.lastReceiptGlobalNo).toBe(20);
  });

  it("returns the chain head as it stood at the moment of reservation", async () => {
    const day = await requireOpenFiscalDay({ companyId, providerConfigId });

    const first = await reserveNextReceiptNumbers(day.id);
    expect(first.receiptCounter).toBe(21);
    expect(first.previousReceiptHash).toBeNull();

    expect(
      await recordReceiptHash({ dayId: day.id, receiptCounter: 21, receiptHash: "hash-21" }),
    ).toBe(true);

    const second = await reserveNextReceiptNumbers(day.id);
    expect(second.receiptCounter).toBe(22);
    expect(second.previousReceiptHash).toBe("hash-21");

    // A stale write cannot rewind the chain head onto an older receipt.
    expect(
      await recordReceiptHash({ dayId: day.id, receiptCounter: 21, receiptHash: "stale" }),
    ).toBe(false);
    const row = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(row.lastReceiptHash).toBe("hash-21");
  });

  it("refuses to reserve into a day that is not open", async () => {
    const day = await requireOpenFiscalDay({ companyId, providerConfigId });
    await prisma.fiscalDay.update({
      where: { id: day.id },
      data: { status: FISCAL_DAY_STATUS.CLOSING },
    });

    await expect(reserveNextReceiptNumbers(day.id)).rejects.toBeInstanceOf(FiscalDayNotOpenError);
    await expect(requireOpenFiscalDay({ companyId, providerConfigId })).rejects.toBeInstanceOf(
      FiscalDayNotOpenError,
    );

    await prisma.fiscalDay.update({
      where: { id: day.id },
      data: { status: FISCAL_DAY_STATUS.OPENED },
    });
  });
});

describe("aggregateFiscalDayCounters", () => {
  it("sums by tax rate in exact minor units and negates credit notes", () => {
    const counters = aggregateFiscalDayCounters({
      receipts: [
        { id: "r1", receiptType: "FISCALINVOICE", receiptCurrency: "USD", receiptCounter: 1, receiptGlobalNo: 1 },
        { id: "r2", receiptType: "FISCALINVOICE", receiptCurrency: "USD", receiptCounter: 2, receiptGlobalNo: 2 },
        { id: "r3", receiptType: "CREDITNOTE", receiptCurrency: "USD", receiptCounter: 3, receiptGlobalNo: 3 },
      ],
      taxLinesByReceiptId: {
        r1: [
          { taxId: 3, taxPercent: 15, salesAmountCents: 11500, taxAmountCents: 1500 },
          { taxId: 1, taxPercent: null, salesAmountCents: 5000, taxAmountCents: 0 },
        ],
        // "15" and 15 must land in the same bucket as r1's.
        r2: [{ taxId: 3, taxPercent: "15", salesAmountCents: 2300, taxAmountCents: 300 }],
        // Supplied positive; a credit note still has to reduce the day.
        r3: [{ taxId: 3, taxPercent: 15, salesAmountCents: 1150, taxAmountCents: 150 }],
      },
    });

    expect(counters.receiptCount).toBe(3);
    expect(counters.lastReceiptCounter).toBe(3);
    expect(counters.lastReceiptGlobalNo).toBe(3);
    expect(counters.receiptsWithoutTaxLines).toEqual([]);

    const find = (type: string, taxId: number) =>
      counters.counters.find((c) => c.fiscalCounterType === type && c.fiscalCounterTaxID === taxId);

    expect(find("SaleByTax", 3)?.fiscalCounterValueCents).toBe("13800");
    expect(find("SaleTaxByTax", 3)?.fiscalCounterValueCents).toBe("1800");
    expect(find("SaleByTax", 1)?.fiscalCounterValueCents).toBe("5000");
    expect(find("SaleByTax", 1)?.fiscalCounterTaxPercent).toBeNull();
    expect(find("CreditNoteByTax", 3)?.fiscalCounterValueCents).toBe("-1150");
    expect(find("CreditNoteTaxByTax", 3)?.fiscalCounterValueCents).toBe("-150");
  });

  it("is deterministic regardless of receipt order", () => {
    const receipts = [
      { id: "a", receiptType: "FISCALINVOICE", receiptCurrency: "USD", receiptCounter: 1, receiptGlobalNo: 1 },
      { id: "b", receiptType: "FISCALINVOICE", receiptCurrency: "ZWG", receiptCounter: 2, receiptGlobalNo: 2 },
    ];
    const lines = {
      a: [{ taxId: 3, taxPercent: 15, salesAmountCents: 100, taxAmountCents: 13 }],
      b: [{ taxId: 3, taxPercent: 15, salesAmountCents: 200, taxAmountCents: 26 }],
    };

    const forward = aggregateFiscalDayCounters({ receipts, taxLinesByReceiptId: lines });
    const reversed = aggregateFiscalDayCounters({
      receipts: [...receipts].reverse(),
      taxLinesByReceiptId: lines,
    });

    // The closing signature is taken over this JSON; it cannot depend on the
    // order rows came back in.
    expect(JSON.stringify(reversed.counters)).toBe(JSON.stringify(forward.counters));
  });

  it("refuses a non-integer minor-unit amount rather than rounding it", () => {
    expect(() =>
      aggregateFiscalDayCounters({
        receipts: [
          { id: "r1", receiptType: "FISCALINVOICE", receiptCurrency: "USD", receiptCounter: 1, receiptGlobalNo: 1 },
        ],
        taxLinesByReceiptId: {
          r1: [{ taxId: 3, taxPercent: 15, salesAmountCents: 1150.5, taxAmountCents: 150 }],
        },
      }),
    ).toThrow(/integer count of minor units/);
  });
});

describe("closeFiscalDay", () => {
  it("refuses to close a day holding unsubmitted receipts, and names them", async () => {
    const day = await requireOpenFiscalDay({ companyId, providerConfigId });

    const pending = await createReceipt({
      fiscalDayId: day.id,
      receiptCounter: 1,
      receiptGlobalNo: 1,
      status: "PENDING",
    });
    const failed = await createReceipt({
      fiscalDayId: day.id,
      receiptCounter: 2,
      receiptGlobalNo: 2,
      status: "FAILED",
    });
    await createReceipt({
      fiscalDayId: day.id,
      receiptCounter: 3,
      receiptGlobalNo: 3,
      status: "SUCCESS",
    });

    const error = await closeFiscalDay({ dayId: day.id }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FiscalDayHasPendingReceiptsError);
    const ids = (error as FiscalDayHasPendingReceiptsError).receipts.map((r) => r.id).sort();
    expect(ids).toEqual([pending.id, failed.id].sort());

    // The day is untouched — refusing to close must not half-close it.
    const after = await prisma.fiscalDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(after.status).toBe(FISCAL_DAY_STATUS.OPENED);
    expect(after.lastError).toMatch(/unsubmitted/);

    await prisma.fiscalReceipt.updateMany({
      where: { id: { in: [pending.id, failed.id] } },
      data: { status: "SUCCESS" },
    });
  });

  it("closes with aggregated counters and the closing signature", async () => {
    const day = await requireOpenFiscalDay({ companyId, providerConfigId });
    const receipts = await prisma.fiscalReceipt.findMany({
      where: { fiscalDayId: day.id },
      orderBy: { receiptGlobalNo: "asc" },
    });

    const taxLinesByReceiptId = Object.fromEntries(
      receipts.map((r) => [r.id, [{ taxId: 3, taxPercent: 15, salesAmountCents: 11500, taxAmountCents: 1500 }]]),
    );

    let signedOver = "";
    const result = await closeFiscalDay({
      dayId: day.id,
      companyId,
      taxLinesByReceiptId,
      signClosure: ({ countersJson, day: signing }) => {
        // The day must be CLOSING, not OPENED, by the time the signer runs.
        expect(signing.id).toBe(day.id);
        signedOver = countersJson;
        return "device-signature-fixture";
      },
    });

    expect(result.alreadyClosed).toBe(false);
    expect(result.day.status).toBe(FISCAL_DAY_STATUS.CLOSED);
    expect(result.day.closedAt).toBeInstanceOf(Date);
    expect(result.day.closingSignature).toBe("device-signature-fixture");
    expect(result.day.lastError).toBeNull();
    expect(result.day.countersJson).toBe(signedOver);

    expect(result.counters.receiptCount).toBe(receipts.length);
    expect(result.counters.receiptsWithoutTaxLines).toEqual([]);
    const sale = result.counters.counters.find((c) => c.fiscalCounterType === "SaleByTax");
    expect(sale?.fiscalCounterValueCents).toBe(String(11500 * receipts.length));

    // The stored JSON is what a later audit re-signs, so it must round-trip.
    expect(JSON.parse(result.day.countersJson ?? "{}").counters).toEqual(result.counters.counters);
  });

  it("is a no-op when the day is already closed", async () => {
    const closed = await prisma.fiscalDay.findFirstOrThrow({
      where: { providerConfigId, status: FISCAL_DAY_STATUS.CLOSED },
    });

    const again = await closeFiscalDay({ dayId: closed.id });

    expect(again.alreadyClosed).toBe(true);
    expect(again.day.closedAt?.getTime()).toBe(closed.closedAt?.getTime());
    expect(again.day.closingSignature).toBe(closed.closingSignature);
    expect(again.day.countersJson).toBe(closed.countersJson);
  });

  it("refuses to reserve numbers into the closed day", async () => {
    const closed = await prisma.fiscalDay.findFirstOrThrow({
      where: { providerConfigId, status: FISCAL_DAY_STATUS.CLOSED },
    });
    await expect(reserveNextReceiptNumbers(closed.id)).rejects.toBeInstanceOf(FiscalDayNotOpenError);
  });
});

describe("the next fiscal day", () => {
  it("resets the day counter and the chain but carries the device global number", async () => {
    const previous = await prisma.fiscalDay.findFirstOrThrow({
      where: { providerConfigId },
      orderBy: { fiscalDayNo: "desc" },
    });

    const next = await openFiscalDay({ companyId, providerConfigId });

    expect(next.fiscalDayNo).toBe(previous.fiscalDayNo + 1);
    expect(next.lastReceiptCounter).toBe(0);
    // Never resets: ZIMRA reads a drop in receiptGlobalNo as a replaced device.
    expect(next.lastReceiptGlobalNo).toBe(previous.lastReceiptGlobalNo);
    // Does reset: v7.2 chains previousReceiptHash within a fiscal day.
    expect(next.lastReceiptHash).toBeNull();

    const reserved = await reserveNextReceiptNumbers(next.id);
    expect(reserved.receiptCounter).toBe(1);
    expect(reserved.receiptGlobalNo).toBe(previous.lastReceiptGlobalNo + 1);
    expect(reserved.previousReceiptHash).toBeNull();
    expect(reserved.fiscalDayNo).toBe(next.fiscalDayNo);
    expect(reserved.deviceId).toBe("10001");
  });
});
