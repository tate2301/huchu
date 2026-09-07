/**
 * FD-2 — the fiscal day: open, allocate receipt numbers, close.
 *
 * A ZIMRA device does not submit loose receipts. It opens a fiscal day, submits
 * receipts numbered within it, and closes the day with a Z-report of counters
 * aggregated by tax. Everything ZIMRA can detect fraud with lives in those
 * numbers: `receiptCounter` is the receipt's place in the day, `receiptGlobalNo`
 * its place on the device for all time, and both must be gap-free. A gap reads
 * as a receipt we hid; a repeat reads as a forgery. Either one invalidates every
 * receipt after it, because each receipt's signature covers the previous
 * receipt's hash.
 *
 * That is why this module exists as a seam of its own, and why two things in it
 * are written the way they are rather than the obvious way:
 *
 * 1. **Opening a day never checks-then-writes.** Two tills, or a till and the
 *    console, or a retry of a request whose response was lost, can call
 *    `openFiscalDay` in the same millisecond. Both would read "no day open" and
 *    both would insert, and a device with two open days has two counters
 *    issuing the same numbers. The `FiscalDay_one_open_per_device` partial
 *    unique index (added in `20260818120000_fdms_foundations`) is the actual
 *    guard; the pre-read below exists only to give the loser a good error
 *    message, and the code is correct if it is deleted.
 *
 * 2. **Reserving numbers is one atomic `UPDATE ... RETURNING`.** Not a read,
 *    not a `MAX()` over the receipts table, not a Prisma read-modify-write. A
 *    single statement takes the row lock, increments and returns, so N
 *    concurrent callers serialise into N consecutive numbers with no gaps and
 *    no duplicates. The gold module's `pg_advisory_xact_lock` in
 *    `lib/gold/fifo-link.ts` is the same idea for a case where the contended
 *    thing is a *set* of rows; here the contended thing is one row, and the row
 *    lock a bare UPDATE already takes is both cheaper and stronger.
 *
 * **The hash chain resets at the day boundary, the global number does not.**
 * v7.2 chains `previousReceiptHash` within a fiscal day — the day's first
 * receipt carries an empty previous hash — while `receiptGlobalNo` counts the
 * device's whole life. So a freshly opened day starts with `lastReceiptHash`
 * null and `lastReceiptCounter` 0 but inherits the previous day's
 * `lastReceiptGlobalNo` (see {@link openFiscalDayCounters}). If the sandbox
 * ever rejects a day's first receipt for its previous hash, that policy is the
 * single line to change — `lastReceiptHash` seeding in {@link openFiscalDay} —
 * and nowhere else.
 *
 * No transport lives here. Talking to FDGA (`OpenDay`, `CloseDay`) is the
 * connector's job and signing is `fdms-receipt-signing`'s; this module owns the
 * durable state those two operate on, so it can be tested against a real
 * database with no network at all.
 */
import type { Prisma, PrismaClient, FiscalDay, FiscalReceiptStatus } from "@corelithzw/db";
import { Prisma as PrismaNs } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { openFiscalDayCounters } from "./fdms-receipt-signing";

/** A Prisma client or an open transaction. Callers that write a receipt row in
 *  the same transaction as its number reservation pass the transaction here —
 *  which is what makes a rolled-back receipt give its number back instead of
 *  burning it into a gap. */
export type FiscalDayDb = PrismaClient | Prisma.TransactionClient;

export const FISCAL_DAY_STATUS = {
  OPENED: "OPENED",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED",
} as const;

export type FiscalDayStatus = (typeof FISCAL_DAY_STATUS)[keyof typeof FISCAL_DAY_STATUS];

/**
 * A receipt in one of these statuses has not been accepted by ZIMRA.
 *
 * FAILED counts as unsubmitted deliberately: it holds a `receiptGlobalNo` that
 * ZIMRA has never seen, so closing the day around it submits a Z-report whose
 * counters cover a receipt that does not exist on their side. Resolve it —
 * replay it or void it — before the day closes.
 */
const UNSUBMITTED_STATUSES: FiscalReceiptStatus[] = ["PENDING", "FAILED"];

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** Base for every refusal here, so a caller can tell a fiscal-day refusal apart
 *  from a transport failure and never retry it blindly. */
export class FiscalDayError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "FiscalDayError";
    this.code = code;
  }
}

export class FiscalDayConfigError extends FiscalDayError {
  constructor(message: string) {
    super("FISCAL_DAY_CONFIG", message);
    this.name = "FiscalDayConfigError";
  }
}

export class FiscalDayNotFoundError extends FiscalDayError {
  readonly dayId: string;

  constructor(dayId: string) {
    super("FISCAL_DAY_NOT_FOUND", `Fiscal day ${dayId} does not exist`);
    this.name = "FiscalDayNotFoundError";
    this.dayId = dayId;
  }
}

/**
 * Issuing a receipt into a day that is closed, closing, or was never opened.
 *
 * This is a named refusal rather than a crash because it is an ordinary
 * operational state — the supervisor closed the day and a till kept ringing —
 * and the till has to be told to stop, not shown a stack trace.
 */
export class FiscalDayNotOpenError extends FiscalDayError {
  readonly dayId: string | null;
  readonly status: string | null;

  constructor(args: { dayId?: string | null; status?: string | null; message?: string }) {
    super(
      "FISCAL_DAY_NOT_OPEN",
      args.message ??
        (args.status
          ? `Fiscal day ${args.dayId ?? "?"} is ${args.status}, not OPENED`
          : "No fiscal day is open for this device"),
    );
    this.name = "FiscalDayNotOpenError";
    this.dayId = args.dayId ?? null;
    this.status = args.status ?? null;
  }
}

export class FiscalDayAlreadyOpenError extends FiscalDayError {
  readonly openDayId: string;
  readonly fiscalDayNo: number;

  constructor(day: { id: string; fiscalDayNo: number; status: string }) {
    super(
      "FISCAL_DAY_ALREADY_OPEN",
      `Fiscal day ${day.fiscalDayNo} (${day.id}) is already ${day.status} on this device`,
    );
    this.name = "FiscalDayAlreadyOpenError";
    this.openDayId = day.id;
    this.fiscalDayNo = day.fiscalDayNo;
  }
}

/** Named so the console can list the offending receipts (FD-2.2) instead of
 *  showing a supervisor a day that simply refuses to close. */
export class FiscalDayHasPendingReceiptsError extends FiscalDayError {
  readonly dayId: string;
  readonly receipts: Array<{ id: string; status: string; receiptGlobalNo: number | null }>;

  constructor(dayId: string, receipts: Array<{ id: string; status: string; receiptGlobalNo: number | null }>) {
    super(
      "FISCAL_DAY_HAS_PENDING_RECEIPTS",
      `Fiscal day ${dayId} has ${receipts.length} unsubmitted receipt(s) and cannot be closed`,
    );
    this.name = "FiscalDayHasPendingReceiptsError";
    this.dayId = dayId;
    this.receipts = receipts;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "P2002";
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The day currently accepting receipts on this device, or null.
 *
 * A CLOSING day is deliberately not returned: it has stopped taking receipts
 * but its Z-report has not been accepted yet, so it is neither open nor closed.
 * Use {@link getActiveFiscalDay} when you need to see one.
 */
export async function getOpenFiscalDay(
  input: { companyId: string; providerConfigId: string },
  db: FiscalDayDb = prisma,
): Promise<FiscalDay | null> {
  return db.fiscalDay.findFirst({
    where: {
      companyId: input.companyId,
      providerConfigId: input.providerConfigId,
      status: FISCAL_DAY_STATUS.OPENED,
    },
  });
}

/** The device's not-yet-closed day, OPENED or CLOSING — the row the partial
 *  unique index permits exactly one of. */
export async function getActiveFiscalDay(
  input: { companyId?: string; providerConfigId: string },
  db: FiscalDayDb = prisma,
): Promise<FiscalDay | null> {
  return db.fiscalDay.findFirst({
    where: {
      ...(input.companyId ? { companyId: input.companyId } : {}),
      providerConfigId: input.providerConfigId,
      status: { not: FISCAL_DAY_STATUS.CLOSED },
    },
  });
}

/** Same as {@link getOpenFiscalDay} but refuses instead of returning null, so
 *  the receipt path can call it as a precondition and never has to reason about
 *  a null day. */
export async function requireOpenFiscalDay(
  input: { companyId: string; providerConfigId: string },
  db: FiscalDayDb = prisma,
): Promise<FiscalDay> {
  const open = await getOpenFiscalDay(input, db);
  if (open) return open;

  const active = await getActiveFiscalDay(input, db);
  throw new FiscalDayNotOpenError({ dayId: active?.id ?? null, status: active?.status ?? null });
}

export async function getFiscalDay(dayId: string, db: FiscalDayDb = prisma): Promise<FiscalDay> {
  const day = await db.fiscalDay.findUnique({ where: { id: dayId } });
  if (!day) throw new FiscalDayNotFoundError(dayId);
  return day;
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export type OpenFiscalDayInput = {
  companyId: string;
  providerConfigId: string;
  /** Overrides the device ID denormalised from the provider config. Only the
   *  registration flow should need this. */
  deviceId?: string;
  openedAt?: Date;
};

const OPEN_ATTEMPTS = 5;

/**
 * Open the device's next fiscal day.
 *
 * The day number is allocated as `max(fiscalDayNo) + 1` for the device and the
 * insert is allowed to fail: the two unique indexes decide the winner, not this
 * function. On a P2002 we re-read to find out *which* index fired — an active
 * day means somebody else opened one and we refuse; a day-number collision
 * means somebody else took the number we picked while we were picking it, and
 * we simply pick the next one. Bounded retries, because an unbounded loop
 * against a constraint we have misdiagnosed is a spin, not a recovery.
 */
export async function openFiscalDay(input: OpenFiscalDayInput): Promise<FiscalDay> {
  const provider = await prisma.fiscalisationProviderConfig.findFirst({
    where: { id: input.providerConfigId, companyId: input.companyId },
  });
  if (!provider) {
    throw new FiscalDayConfigError(
      `Fiscalisation provider ${input.providerConfigId} not found for this company`,
    );
  }
  if (!provider.isActive) {
    throw new FiscalDayConfigError(
      `Fiscalisation provider ${provider.providerKey} is not active; a day cannot be opened on it`,
    );
  }

  // The device ID is signed into every receipt of the day, so a day cannot be
  // opened before the device is registered — opening one would produce receipts
  // ZIMRA cannot attribute, and the day number would be burned regardless.
  const deviceId = input.deviceId ?? provider.deviceId;
  if (!deviceId) {
    throw new FiscalDayConfigError(
      `Fiscalisation provider ${provider.providerKey} has no deviceId; register the device before opening a fiscal day`,
    );
  }

  for (let attempt = 0; attempt < OPEN_ATTEMPTS; attempt += 1) {
    const active = await getActiveFiscalDay(
      { companyId: input.companyId, providerConfigId: provider.id },
      prisma,
    );
    if (active) throw new FiscalDayAlreadyOpenError(active);

    const previous = await prisma.fiscalDay.findFirst({
      where: { providerConfigId: provider.id },
      orderBy: { fiscalDayNo: "desc" },
    });

    const seed = openFiscalDayCounters(
      previous
        ? { receiptCounter: previous.lastReceiptCounter, receiptGlobalNo: previous.lastReceiptGlobalNo }
        : null,
    );

    try {
      return await prisma.fiscalDay.create({
        data: {
          companyId: input.companyId,
          providerConfigId: provider.id,
          deviceId,
          fiscalDayNo: (previous?.fiscalDayNo ?? 0) + 1,
          status: FISCAL_DAY_STATUS.OPENED,
          openedAt: input.openedAt ?? new Date(),
          lastReceiptCounter: seed.receiptCounter,
          lastReceiptGlobalNo: seed.receiptGlobalNo,
          // Null, not the previous day's hash: the chain restarts each fiscal
          // day (see the module header).
          lastReceiptHash: null,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const conflicting = await getActiveFiscalDay({ providerConfigId: provider.id }, prisma);
      if (conflicting) throw new FiscalDayAlreadyOpenError(conflicting);
      // Otherwise the day-number index fired; loop and take the next number.
    }
  }

  throw new FiscalDayConfigError(
    `Could not allocate a fiscal day number for device ${deviceId} after ${OPEN_ATTEMPTS} attempts`,
  );
}

// ---------------------------------------------------------------------------
// Counter reservation
// ---------------------------------------------------------------------------

export type ReservedReceiptNumbers = {
  fiscalDayId: string;
  fiscalDayNo: number;
  deviceId: string;
  /** Position in the fiscal day. The day's first receipt gets 1. */
  receiptCounter: number;
  /** Position on the device for all time. Never resets, never skips. */
  receiptGlobalNo: number;
  /** The hash this receipt must chain onto; null for the day's first. */
  previousReceiptHash: string | null;
};

type ReserveRow = {
  fiscalDayNo: number;
  deviceId: string;
  lastReceiptCounter: number;
  lastReceiptGlobalNo: number;
  previousReceiptHash: string | null;
};

/**
 * Take the next receipt numbers for a day, atomically.
 *
 * One statement. It takes the row lock, increments both counters and returns
 * them, so twenty concurrent callers get twenty consecutive numbers — the
 * property the whole chain rests on. Anything with a read in front of it (a
 * `findUnique` then an `update`, or `MAX(receiptGlobalNo)+1` over the receipts
 * table) hands the same number to two callers under load, and the second
 * receipt ZIMRA sees with that number is a forgery to them.
 *
 * `previousReceiptHash` is returned from the same statement rather than fetched
 * separately, because between a separate read and this update another caller
 * could have taken a number and moved the chain on.
 *
 * The `status = 'OPENED'` predicate is part of the same statement too: a day
 * that closes concurrently makes this update match zero rows and refuse, rather
 * than issuing a number into a day whose Z-report is already being computed.
 *
 * Pass the transaction client when the receipt row is written in a
 * transaction — a rollback then returns the numbers instead of leaving a gap.
 */
export async function reserveNextReceiptNumbers(
  dayId: string,
  db: FiscalDayDb = prisma,
): Promise<ReservedReceiptNumbers> {
  const rows = await db.$queryRaw<ReserveRow[]>(PrismaNs.sql`
    UPDATE "FiscalDay"
       SET "lastReceiptCounter"  = "lastReceiptCounter" + 1,
           "lastReceiptGlobalNo" = "lastReceiptGlobalNo" + 1,
           "updatedAt"           = NOW()
     WHERE "id" = ${dayId}
       AND "status" = ${FISCAL_DAY_STATUS.OPENED}
    RETURNING "fiscalDayNo",
              "deviceId",
              "lastReceiptCounter",
              "lastReceiptGlobalNo",
              "lastReceiptHash" AS "previousReceiptHash"
  `);

  const row = rows[0];
  if (!row) {
    // Zero rows means the predicate failed, not that something broke. Find out
    // which half so the caller gets the right refusal.
    const day = await db.fiscalDay.findUnique({ where: { id: dayId }, select: { id: true, status: true } });
    if (!day) throw new FiscalDayNotFoundError(dayId);
    throw new FiscalDayNotOpenError({ dayId: day.id, status: day.status });
  }

  return {
    fiscalDayId: dayId,
    fiscalDayNo: Number(row.fiscalDayNo),
    deviceId: row.deviceId,
    receiptCounter: Number(row.lastReceiptCounter),
    receiptGlobalNo: Number(row.lastReceiptGlobalNo),
    previousReceiptHash: row.previousReceiptHash,
  };
}

/**
 * Move the day's chain head onto a receipt that has just been signed.
 *
 * Guarded by `receiptCounter`: the update only applies when the day is still at
 * the position this receipt was reserved at, so a late or duplicated call
 * cannot rewind the chain head and make the *next* receipt chain onto a hash
 * that is no longer the last one. Returns false when it did not apply, which is
 * the caller's signal that something wrote out of order.
 */
export async function recordReceiptHash(
  input: { dayId: string; receiptCounter: number; receiptHash: string },
  db: FiscalDayDb = prisma,
): Promise<boolean> {
  const updated = await db.fiscalDay.updateMany({
    where: {
      id: input.dayId,
      status: FISCAL_DAY_STATUS.OPENED,
      lastReceiptCounter: input.receiptCounter,
    },
    data: { lastReceiptHash: input.receiptHash },
  });
  return updated.count === 1;
}

// ---------------------------------------------------------------------------
// Counters (Z-report)
// ---------------------------------------------------------------------------

/** One receipt's tax breakdown, already aggregated per taxID by the signer —
 *  the same lines that went into the receipt signature. */
export type FiscalDayTaxLineInput = {
  /** `TaxCode.zimraTaxId` (FD-0.2). */
  taxId: number;
  /** Null for an exempt/zero-rated line, which carries no percent. */
  taxPercent?: number | string | null;
  /** Sales value INCLUDING tax, in minor units. */
  salesAmountCents: bigint | number;
  /** Tax value in minor units. */
  taxAmountCents: bigint | number;
};

export type FiscalDayReceiptInput = {
  id: string;
  receiptType: string | null;
  receiptCurrency: string | null;
  receiptCounter: number | null;
  receiptGlobalNo: number | null;
};

export type FiscalDayCounterLine = {
  /** v7.2 counter names: SaleByTax, SaleTaxByTax, CreditNoteByTax, … */
  fiscalCounterType: string;
  fiscalCounterCurrency: string;
  fiscalCounterTaxID: number;
  /** Percent as a fixed-2 string, or null for an exempt line. */
  fiscalCounterTaxPercent: string | null;
  /** Minor units as a decimal string. See {@link buildFiscalDayCountersJson}. */
  fiscalCounterValueCents: string;
};

export type FiscalDayCounters = {
  receiptCount: number;
  lastReceiptCounter: number;
  lastReceiptGlobalNo: number;
  counters: FiscalDayCounterLine[];
  /** Receipts we had no tax lines for. Empty is the healthy case; anything here
   *  means the Z-report under-reports and FD-2.2 has something to show. */
  receiptsWithoutTaxLines: string[];
};

const COUNTER_TYPES: Record<string, { sales: string; tax: string; negate: boolean }> = {
  FISCALINVOICE: { sales: "SaleByTax", tax: "SaleTaxByTax", negate: false },
  CREDITNOTE: { sales: "CreditNoteByTax", tax: "CreditNoteTaxByTax", negate: true },
  DEBITNOTE: { sales: "DebitNoteByTax", tax: "DebitNoteTaxByTax", negate: false },
};

function toCents(value: bigint | number, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (!Number.isSafeInteger(value)) {
    // A non-integer here is a float that reached a total — the exact thing the
    // standing instruction forbids. Refuse rather than round into a Z-report
    // that will not reconcile with the receipts it claims to summarise.
    throw new FiscalDayError(
      "FISCAL_DAY_INEXACT_AMOUNT",
      `${field} must be an integer count of minor units, received ${String(value)}`,
    );
  }
  return BigInt(value);
}

function normalisePercent(percent: number | string | null | undefined): string | null {
  if (percent === null || percent === undefined || percent === "") return null;
  // Fixed-2 so that 15, "15", 15.0 and Decimal(15) are one bucket rather than
  // four. The percent is a label on a counter, never something we sum.
  return new PrismaNs.Decimal(percent).toFixed(2);
}

/**
 * Aggregate a fiscal day's receipts into the counter set CloseDay submits.
 *
 * Exact by construction: every value is a `bigint` count of minor units, summed
 * as integers and only ever rendered as a decimal string. A Z-report that
 * disagrees with the receipts it covers by a cent is a discrepancy ZIMRA raises
 * against the taxpayer, so nothing here is allowed to touch a float.
 *
 * Credit notes are stored negative regardless of the sign the caller supplies:
 * v7.2 counts a credit note as a reduction of the day's sales, and a caller
 * that hands us positive magnitudes (which is the natural way to hold a credit
 * note internally) would otherwise inflate the day.
 */
export function aggregateFiscalDayCounters(input: {
  receipts: FiscalDayReceiptInput[];
  taxLinesByReceiptId: Record<string, FiscalDayTaxLineInput[]>;
  defaultCurrency?: string;
}): FiscalDayCounters {
  const buckets = new Map<string, FiscalDayCounterLine & { value: bigint }>();
  const receiptsWithoutTaxLines: string[] = [];
  let lastReceiptCounter = 0;
  let lastReceiptGlobalNo = 0;

  const add = (
    type: string,
    currency: string,
    taxId: number,
    percent: string | null,
    value: bigint,
  ) => {
    const key = `${type}|${currency}|${taxId}|${percent ?? ""}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.value += value;
      return;
    }
    buckets.set(key, {
      fiscalCounterType: type,
      fiscalCounterCurrency: currency,
      fiscalCounterTaxID: taxId,
      fiscalCounterTaxPercent: percent,
      fiscalCounterValueCents: "0",
      value,
    });
  };

  for (const receipt of input.receipts) {
    lastReceiptCounter = Math.max(lastReceiptCounter, receipt.receiptCounter ?? 0);
    lastReceiptGlobalNo = Math.max(lastReceiptGlobalNo, receipt.receiptGlobalNo ?? 0);

    const lines = input.taxLinesByReceiptId[receipt.id];
    if (!lines || lines.length === 0) {
      receiptsWithoutTaxLines.push(receipt.id);
      continue;
    }

    const type = (receipt.receiptType ?? "FISCALINVOICE").toUpperCase();
    const shape = COUNTER_TYPES[type];
    if (!shape) {
      throw new FiscalDayError(
        "FISCAL_DAY_UNKNOWN_RECEIPT_TYPE",
        `Receipt ${receipt.id} has receiptType ${type}, which has no fiscal day counter`,
      );
    }
    const currency = (receipt.receiptCurrency ?? input.defaultCurrency ?? "USD").toUpperCase();

    for (const line of lines) {
      const percent = normalisePercent(line.taxPercent);
      const sales = toCents(line.salesAmountCents, `receipt ${receipt.id} salesAmountCents`);
      const tax = toCents(line.taxAmountCents, `receipt ${receipt.id} taxAmountCents`);
      const zero = BigInt(0);
      const sign = (v: bigint) => (shape.negate ? -(v < zero ? -v : v) : v);
      add(shape.sales, currency, line.taxId, percent, sign(sales));
      add(shape.tax, currency, line.taxId, percent, sign(tax));
    }
  }

  // Sorted so the JSON — and therefore the closing signature over it — is a
  // function of the day's contents and not of Map insertion order.
  const counters = [...buckets.values()]
    .sort(
      (a, b) =>
        a.fiscalCounterType.localeCompare(b.fiscalCounterType) ||
        a.fiscalCounterCurrency.localeCompare(b.fiscalCounterCurrency) ||
        a.fiscalCounterTaxID - b.fiscalCounterTaxID ||
        (a.fiscalCounterTaxPercent ?? "").localeCompare(b.fiscalCounterTaxPercent ?? ""),
    )
    .map(({ value, ...line }) => ({ ...line, fiscalCounterValueCents: value.toString() }));

  return {
    receiptCount: input.receipts.length,
    lastReceiptCounter,
    lastReceiptGlobalNo,
    counters,
    receiptsWithoutTaxLines,
  };
}

/**
 * The exact bytes stored in `countersJson` and handed to the closing signer.
 *
 * Minor units are rendered as decimal *strings*: JSON has no exact integer past
 * 2^53 and `JSON.stringify` throws on a bigint, and a Z-report that silently
 * lost precision is worse than one that fails to serialise.
 */
export function buildFiscalDayCountersJson(counters: FiscalDayCounters): string {
  return JSON.stringify(counters);
}

// ---------------------------------------------------------------------------
// Close
// ---------------------------------------------------------------------------

export type CloseFiscalDayInput = {
  dayId: string;
  /** Tenant guard for callers that hold a session rather than a trusted id. */
  companyId?: string;
  /**
   * Per-receipt tax lines, keyed by `FiscalReceipt.id`. Until FD-3 persists the
   * signed tax breakdown on the receipt row, the caller that built those lines
   * is the only thing that still has them.
   */
  taxLinesByReceiptId?: Record<string, FiscalDayTaxLineInput[]>;
  /** Signature over {@link buildFiscalDayCountersJson}'s output. Supply either
   *  this or `signClosure`; the device key lives in the device module, not
   *  here, which is what keeps this file testable with no keys at all. */
  closingSignature?: string | null;
  signClosure?: (args: {
    day: FiscalDay;
    counters: FiscalDayCounters;
    countersJson: string;
  }) => string | Promise<string>;
  closedAt?: Date;
};

export type CloseFiscalDayResult = {
  day: FiscalDay;
  counters: FiscalDayCounters;
  /** True when the day was already CLOSED and nothing was rewritten. */
  alreadyClosed: boolean;
};

/**
 * Close a fiscal day: refuse if anything is unsubmitted, aggregate, sign, close.
 *
 * The day passes through CLOSING before CLOSED because the FDGA `CloseDay` call
 * sits between the two: a crash mid-call must leave a day that is visibly
 * *stuck closing* — no longer taking receipts, not yet reported — rather than
 * one that looks open and starts issuing numbers into a day ZIMRA may already
 * have closed. Recovery from CLOSING is re-running this function, which is why
 * it accepts a CLOSING day as an input state.
 *
 * Closing an already-CLOSED day is a no-op that returns the day, not an error:
 * the DoD requires resubmitting an operation to be observably harmless, and a
 * retried close must not produce a second Z-report.
 */
export async function closeFiscalDay(input: CloseFiscalDayInput): Promise<CloseFiscalDayResult> {
  const day = await getFiscalDay(input.dayId);
  if (input.companyId && day.companyId !== input.companyId) {
    throw new FiscalDayNotFoundError(input.dayId);
  }

  const receipts = await prisma.fiscalReceipt.findMany({
    where: { fiscalDayId: day.id },
    select: {
      id: true,
      status: true,
      receiptType: true,
      receiptCurrency: true,
      receiptCounter: true,
      receiptGlobalNo: true,
    },
    orderBy: [{ receiptGlobalNo: "asc" }],
  });

  if (day.status === FISCAL_DAY_STATUS.CLOSED) {
    return {
      day,
      counters: aggregateFiscalDayCounters({
        receipts,
        taxLinesByReceiptId: input.taxLinesByReceiptId ?? {},
      }),
      alreadyClosed: true,
    };
  }

  const unsubmitted = receipts.filter((r) => UNSUBMITTED_STATUSES.includes(r.status));
  if (unsubmitted.length > 0) {
    const detail = unsubmitted.map((r) => ({
      id: r.id,
      status: r.status as string,
      receiptGlobalNo: r.receiptGlobalNo,
    }));
    // Recorded on the day as well as thrown: the supervisor who hits this is
    // usually not the person reading the API response.
    await prisma.fiscalDay.update({
      where: { id: day.id },
      data: { lastError: `${unsubmitted.length} unsubmitted receipt(s) block close` },
    });
    throw new FiscalDayHasPendingReceiptsError(day.id, detail);
  }

  // OPENED -> CLOSING, guarded: a day that closed underneath us must not be
  // reopened into CLOSING by this update.
  const claimed = await prisma.fiscalDay.updateMany({
    where: {
      id: day.id,
      status: { in: [FISCAL_DAY_STATUS.OPENED, FISCAL_DAY_STATUS.CLOSING] },
    },
    data: { status: FISCAL_DAY_STATUS.CLOSING, lastError: null },
  });
  if (claimed.count !== 1) {
    const current = await getFiscalDay(day.id);
    throw new FiscalDayNotOpenError({ dayId: current.id, status: current.status });
  }

  const counters = aggregateFiscalDayCounters({
    receipts,
    taxLinesByReceiptId: input.taxLinesByReceiptId ?? {},
  });
  const countersJson = buildFiscalDayCountersJson(counters);

  let signature = input.closingSignature ?? null;
  if (input.signClosure) {
    try {
      signature = await input.signClosure({ day, counters, countersJson });
    } catch (error) {
      // Leave the day CLOSING: it has stopped taking receipts and the failure is
      // recoverable by re-running close once the key or transport is fixed.
      await prisma.fiscalDay.update({
        where: { id: day.id },
        data: { lastError: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  const closed = await prisma.fiscalDay.update({
    where: { id: day.id },
    data: {
      status: FISCAL_DAY_STATUS.CLOSED,
      closedAt: input.closedAt ?? new Date(),
      countersJson,
      closingSignature: signature,
      lastError: null,
    },
  });

  return { day: closed, counters, alreadyClosed: false };
}
