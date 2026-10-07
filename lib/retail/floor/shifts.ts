import { Prisma, type RetailTenderType } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { markActivityFailed } from "@/lib/activity/context";
import { reserveIdentifier } from "@/lib/id-generator";
import { exceeds, money, sumMoney, toNumberOrZero } from "@/lib/money";
import { emitRetailNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { auditShiftClosed, auditShiftOpened } from "@/lib/retail/audit";
import { getCashNetFromPayments, shiftOpenPosting, sumCashMovementDeltas } from "@/lib/retail/cash-up";
import { closeFiscalDayIfLastShift, openFiscalDayIfNone } from "@/lib/retail/fiscal-settings";
import { canRetailRoleDo, canRetailSessionDo, retailPermissionDenial, type SessionLike } from "@/lib/retail/permission-matrix";
import { latestZigRate, loadPaymentSettings, NoZigRate } from "@/lib/retail/payment-settings";
import { closeShiftUncounted } from "@/lib/retail/shift-close-uncounted";
import { FLOAT_MESSAGE, FLOAT_PATTERN, tillWords } from "@/lib/retail/shift-open-rules";
import { tenderLabel } from "@/lib/retail/words";
import { shiftState } from "@/lib/reports/loaders/retail/floor";
import { createApprovalAction } from "@/lib/workflow/approvals";
import { formatDuration, formatMoney, formatSigned, formatTime } from "@/lib/workspace/format";
import { postedChange } from "@/lib/retail/sale-totals";
import { countsBlind } from "@/lib/retail/shift-record";
import { normalizeRetailPostingPayments, postRetailJournal, type RetailAccountingResult } from "@/app/api/v2/retail/_helpers";

import { countDrawer, DENOMINATIONS, floatLeftProblem, needsExplaining, type CountCurrency, type CountRow, type DrawerState } from "./count";

/**
 * Opening a shift (50-floor W-37, FLR-03): who may open one for whom, on
 * which till, with which floats, and what it does to the drawer and the
 * books. The back office (`POST /api/v2/retail/shifts`, a manager opening for
 * a cashier) and the till (`POST /api/v2/retail/pos/shifts`, the device's own
 * till and the person signed in) both open through `openShift`.
 *
 * The money: the US$ float plus the ZiG float at today's rate (ZiG per US$1,
 * stamped here, never the client's) is what the drawer should hold. The open
 * journal moves that from the vault to each drawer's till account: Dr 1000
 * the dollars, Dr 1001 the ZiG part, Cr 1005 the whole. The ZiG part's
 * dollar value is kept on the shift (`openingFloatZigBase`), so the Z-report
 * and a backfill read the float at the rate it was counted in.
 *
 * Closing one (W-39, FLR-04) is below: `closeShift` counts by note under the
 * shift's row lock, `closeUncounted` closes a drawer nobody can count, and
 * `closeForm` is what the close page reads.
 */

export type ShiftSession = SessionLike & {
  user: { id: string; companyId: string; name?: string | null; role?: string | null; email?: string | null };
};

/** A refusal in the sheet's words: the status, the sentence, and the field it belongs under. */
export class ShiftRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly field?: "till" | "who" | "float" | "zig",
  ) {
    super(message);
    this.name = "ShiftRefused";
  }
}

export type OpenShiftInput = {
  session: ShiftSession;
  registerId: string;
  /** Whose drawer: left out, the caller's own. */
  cashierId?: string;
  openingFloat: string;
  openingFloatZig?: string;
  /** The device it is opened on at the till; none in the back office. */
  deviceId?: string | null;
  notes?: string | null;
  periodOverrideReason?: string | null;
};

const cents = (value: Prisma.Decimal) => money(value);

/** The float as typed: two decimals or fewer, zero or more. */
function floatOf(value: string | undefined, field: "float" | "zig"): Prisma.Decimal {
  const typed = (value ?? "").trim();
  if (!typed) return new Prisma.Decimal(0);
  if (!FLOAT_PATTERN.test(typed)) throw new ShiftRefused(400, FLOAT_MESSAGE, field);
  return new Prisma.Decimal(typed);
}

type Till = { id: string; code: string; name: string; siteId: string };
type Cashier = { id: string; name: string };

/** The till, active at an active site, or 404 under Till. */
async function tillFor(companyId: string, registerId: string, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<Till> {
  const register = await db.retailRegister.findFirst({
    where: { id: registerId, companyId, isActive: true, site: { isActive: true } },
    select: { id: true, code: true, name: true, siteId: true },
  });
  if (!register) throw new ShiftRefused(404, "Till not found", "till");
  return register;
}

/** Refuses a till with an open shift, and a cashier with a shift open anywhere. */
async function refuseBusy(db: Prisma.TransactionClient | typeof prisma, companyId: string, till: Till, cashier: Cashier) {
  const tillBusy = await db.retailShift.findFirst({
    where: { companyId, registerId: till.id, status: "OPEN" },
    select: { id: true },
  });
  if (tillBusy) throw new ShiftRefused(409, `${till.name} already has an open shift.`);
  const cashierBusy = await db.retailShift.findFirst({
    where: { companyId, cashierId: cashier.id, status: "OPEN" },
    select: { registerName: true },
  });
  if (cashierBusy) throw new ShiftRefused(409, `${cashier.name} already has a shift open on ${tillWords(cashierBusy.registerName)}.`);
}

/** Open a shift. Throws `ShiftRefused` in the sheet's words, or `NoZigRate` for a ZiG float with no rate. */
export async function openShift(input: OpenShiftInput): Promise<{
  shift: Prisma.RetailShiftGetPayload<object>;
  accounting: RetailAccountingResult;
  zigBase: Prisma.Decimal;
}> {
  const { session } = input;
  const companyId = session.user.companyId;
  const cashierId = input.cashierId ?? session.user.id;

  // Someone else's drawer is cash control (owner, manager); your own is selling.
  const [resource, action] =
    cashierId === session.user.id ? (["retail.sell", "open-shift"] as const) : (["retail.cash-control", "open-shift"] as const);
  if (!canRetailSessionDo(session, resource, action)) {
    throw new ShiftRefused(403, retailPermissionDenial(session, resource, action)!);
  }

  const till = await tillFor(companyId, input.registerId);

  const person = await prisma.user.findFirst({
    where: { id: cashierId, companyId, isActive: true },
    select: { id: true, name: true, role: true },
  });
  if (!person) throw new ShiftRefused(404, "Person not found", "who");
  if (!canRetailRoleDo(person.role, "retail.sell", "open-shift")) {
    throw new ShiftRefused(400, `${person.name} cannot sell at a till.`, "who");
  }
  const cashier = { id: person.id, name: person.name };

  await refuseBusy(prisma, companyId, till, cashier);

  const openingFloat = floatOf(input.openingFloat, "float");
  const settings = await loadPaymentSettings(companyId);
  // A shop that takes no ZiG cash has no ZiG in the drawer: whatever was sent is ignored.
  const openingFloatZig = settings.tenders.cashZig ? floatOf(input.openingFloatZig, "zig") : new Prisma.Decimal(0);
  let rate: Prisma.Decimal | null = null;
  if (exceeds(openingFloatZig, 0)) {
    const zig = await latestZigRate(companyId);
    if (!zig) throw new NoZigRate();
    rate = new Prisma.Decimal(zig.value);
  }
  const zigBase = rate ? cents(openingFloatZig.div(rate)) : new Prisma.Decimal(0);
  const expectedCash = openingFloat.plus(zigBase);

  const actor = {
    companyId,
    userId: session.user.id,
    userRole: session.user.role ?? null,
    userName: session.user.name ?? null,
    userEmail: session.user.email ?? null,
  };

  const shift = await prisma.$transaction(async (tx) => {
    // Two openings of one till queue on its row, and two openings for one
    // cashier (on two tills) on the cashier's lock; the second sees the first's shift.
    await tx.$queryRaw`SELECT "id" FROM "RetailRegister" WHERE "id" = ${till.id} FOR UPDATE`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`retail-shift-cashier:${companyId}:${cashier.id}`}))::text`;
    await refuseBusy(tx, companyId, till, cashier);
    const shiftNo = await reserveIdentifier(tx, { companyId, entity: "RETAIL_SHIFT" });
    const created = await tx.retailShift.create({
      data: {
        companyId,
        shiftNo,
        registerId: till.id,
        registerCode: till.code,
        registerName: till.name,
        deviceId: input.deviceId ?? null,
        siteId: till.siteId,
        cashierId: cashier.id,
        cashierName: cashier.name,
        openingFloat,
        openingFloatZig,
        openingFloatZigBase: zigBase,
        expectedCash,
        notes: input.notes?.trim() || null,
        status: "OPEN",
      },
    });
    await auditShiftOpened(tx, {
      actor,
      shiftId: created.id,
      shiftNo: created.shiftNo,
      siteId: created.siteId,
      registerCode: created.registerCode,
      cashierId: created.cashierId,
      openingFloat,
      openingFloatZig,
      rate,
    });
    return created;
  });

  const opened = shiftOpenPosting(shift);
  const accounting: RetailAccountingResult = exceeds(opened.amount, 0)
    ? await postRetailJournal({
        companyId,
        sourceType: "RETAIL_SHIFT_OPEN",
        sourceId: shift.id,
        siteId: shift.siteId,
        registerCode: shift.registerCode,
        entryDate: shift.openedAt,
        description: `Retail shift open ${shift.shiftNo}`,
        createdById: session.user.id,
        actorRole: session.user.role ?? undefined,
        periodOverrideReason: input.periodOverrideReason ?? undefined,
        amount: toNumberOrZero(opened.amount),
        netAmount: toNumberOrZero(opened.amount),
        taxAmount: 0,
        grossAmount: toNumberOrZero(opened.amount),
        payload: opened.payload,
      })
    : { accountingStatus: "POSTED", accountingError: null, accountingCode: null, journalEntryId: null };

  // The day's first shift opens the shop's fiscal day when none is open (SET-08), so its sales are signed.
  await openFiscalDayIfNone(companyId, shift.openedAt);

  return { shift, accounting, zigBase };
}

/** What Open a shift fills in once a till is picked: the float the last close left, and whether the shop takes ZiG. */
export async function openingDefaults(
  companyId: string,
  registerId: string,
): Promise<{ float: string; hint: string; takesZig: boolean; zigFloat: string }> {
  await tillFor(companyId, registerId);
  const [last, settings] = await Promise.all([
    prisma.retailShift.findFirst({
      where: { companyId, registerId, status: "CLOSED", floatLeft: { not: null } },
      orderBy: { closedAt: "desc" },
      select: { floatLeft: true },
    }),
    loadPaymentSettings(companyId),
  ]);
  const left = last?.floatLeft ? money(last.floatLeft).toFixed(2) : null;
  return {
    float: left ?? "",
    hint: left ? `Counted in. Last close left US$${Number(left).toLocaleString("en-US", { minimumFractionDigits: 2 })}.` : "Counted in.",
    takesZig: settings.tenders.cashZig,
    zigFloat: "0.00",
  };
}

/** A refusal of `openShift` as the routes answer it, in the sheet's words; anything else is thrown on. */
export function shiftRefusal(error: unknown): NextResponse {
  if (error instanceof ShiftRefused) {
    return error.field
      ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status)
      : errorResponse(error.message, error.status);
  }
  if (error instanceof NoZigRate) return errorResponse(error.message, 409);
  throw error;
}

/* ── Count and close (50-floor W-39, FLR-04) ─────────────────────────────── */

const countRow = z.object({ denomination: z.string().trim().max(10), count: z.number().int().min(0).max(100000) });

/** What the close page and the till post. */
export const closeInput = z.object({
  counts: z.object({ USD: z.array(countRow).max(20), ZWG: z.array(countRow).max(20).optional() }),
  note: z.string().trim().max(500).optional(),
  floatLeft: z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/),
});
export type CloseInput = z.infer<typeof closeInput>;

/** A close refused: the status, the sentence, the fields it belongs under, and the difference when the count revealed it. */
export class CloseRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly fieldErrors?: Record<string, string>,
    readonly difference?: string,
  ) {
    super(message);
    this.name = "CloseRefused";
  }
}

const WHOLE_NOTES = "Count whole notes.";
const NOTE_NEEDED = "Say what happened.";

/** `fiscalDayClosed`: the fiscal day's number when this close was the shop's last shift and closed it (SET-08), so the till can say so. */
export type CloseResult = { shiftNo: string; closedAt: string; difference: string; state: DrawerState; fiscalDayClosed: number | null };

type ClosingShift = Prisma.RetailShiftGetPayload<object>;

const auditActorOf = (session: ShiftSession) => ({
  companyId: session.user.companyId,
  userId: session.user.id,
  userRole: session.user.role ?? null,
  userName: session.user.name ?? null,
});

/** Whether this session may close this drawer: its own with selling, anybody's with cash control. */
function mayClose(session: ShiftSession, shift: { cashierId: string }): boolean {
  if (shift.cashierId === session.user.id && canRetailSessionDo(session, "retail.sell", "close-shift")) return true;
  return canRetailSessionDo(session, "retail.cash-control", "close-shift");
}

/** The role-level gate every close route answers first: "Your role cannot close a till shift in sales". */
export function closeDenial(session: ShiftSession): string | null {
  if (canRetailSessionDo(session, "retail.cash-control", "close-shift")) return null;
  return retailPermissionDenial(session, "retail.sell", "close-shift");
}

async function shiftToClose(session: ShiftSession, shiftId: string): Promise<ClosingShift> {
  const shift = await prisma.retailShift.findFirst({ where: { id: shiftId, companyId: session.user.companyId } });
  if (!shift) throw new CloseRefused(404, "Shift not found");
  if (!mayClose(session, shift)) throw new CloseRefused(403, `Only ${shift.shiftNo}’s cashier or a manager can close it.`);
  if (shift.status !== "OPEN") throw new CloseRefused(409, `${shift.shiftNo} is closed already.`);
  return shift;
}

/** Each row a known note of its currency, counted once; zero rows dropped. */
function rowsOf(rows: ReadonlyArray<CountRow> | undefined, currency: CountCurrency): CountRow[] {
  const known: readonly string[] = DENOMINATIONS[currency];
  const key = currency === "USD" ? "usd" : "zwg";
  const seen = new Set<string>();
  const kept: CountRow[] = [];
  for (const row of rows ?? []) {
    const denomination = row.denomination.trim();
    if (!known.includes(denomination) || seen.has(denomination)) {
      const sentence = `Count ${currency === "USD" ? "US$" : "ZiG"} notes: ${known.join(", ")}.`;
      throw new CloseRefused(400, sentence, { [key]: sentence });
    }
    seen.add(denomination);
    if (row.count > 0) kept.push({ denomination, count: row.count });
  }
  return kept;
}

/**
 * What the shift has put on the ZiG till account (1001), in US$: the ZiG
 * float at its opening rate, each sale's ZiG cash less the ZiG change it gave
 * (exactly as its journal debits 1001: `normalizeRetailPostingPayments`, with
 * a refund or a void taking it back), and every ZiG cash movement. The close
 * credits 1001 with this, so the ZiG till account is empty after every close.
 */
async function zigBooked(db: Prisma.TransactionClient, shift: { id: string; companyId: string; openingFloatZigBase: Prisma.Decimal }): Promise<Prisma.Decimal> {
  const [sales, movements] = await Promise.all([
    db.retailSale.findMany({
      where: { shiftId: shift.id, companyId: shift.companyId },
      select: {
        saleType: true,
        totalAmount: true,
        depositAmount: true,
        tenderedAmount: true,
        changeAmount: true,
        changeZig: true,
        payments: { select: { tenderType: true, baseAmount: true, currency: true } },
      },
    }),
    db.retailCashMovement.findMany({ where: { shiftId: shift.id, companyId: shift.companyId, currency: "ZWG" }, select: { type: true, baseAmount: true } }),
  ]);
  return sumMoney([money(shift.openingFloatZigBase), ...sales.map(saleZigBooked), sumCashMovementDeltas(movements)]);
}

/** What one sale's journal puts on the ZiG till account, in US$: its ZiG cash less the change taken off it; a refund or void negative. */
export function saleZigBooked(sale: Parameters<typeof postedChange>[0] & {
  payments: Array<{ tenderType: RetailTenderType; baseAmount: Prisma.Decimal.Value; currency: string | null }>;
}): Prisma.Decimal {
  const change = postedChange(sale);
  const kept = normalizeRetailPostingPayments({
    payments: sale.payments.map((payment) => ({ tenderType: payment.tenderType, amount: toNumberOrZero(money(payment.baseAmount).abs()), currency: payment.currency })),
    change: { usd: change.usd, zig: change.zig },
  });
  const zig = sumMoney(kept.filter((payment) => payment.tenderType === "CASH" && (payment.currency ?? "").toUpperCase() === "ZWG").map((payment) => money(payment.amount)));
  return sale.saleType === "REFUND" || sale.saleType === "VOID" ? zig.negated() : zig;
}

/**
 * The close journal's lines (RETAIL_SHIFT_CLOSE, 98-decisions FLR-04): the
 * whole count goes to the vault (1005), and the next opening takes its float
 * back out, as every opening does. Each till account gives up what the shift
 * booked to it, after the variance: 1001 its ZiG, 1000 the rest of the count.
 * When the variance took more off a till account than it held, that account
 * takes the excess back (`usdBack`, `zigBack`), so both read zero afterwards.
 */
export function closePosting(input: { counted: Prisma.Decimal.Value; zigBooked: Prisma.Decimal.Value }): {
  amount: Prisma.Decimal;
  payload: { usd: number; zig: number; usdBack: number; zigBack: number };
} {
  const counted = money(input.counted);
  const zig = money(input.zigBooked);
  const usd = counted.minus(zig);
  const zero = new Prisma.Decimal(0);
  return {
    amount: counted,
    payload: {
      usd: toNumberOrZero(Prisma.Decimal.max(usd, zero)),
      zig: toNumberOrZero(Prisma.Decimal.max(zig, zero)),
      usdBack: toNumberOrZero(Prisma.Decimal.max(usd.negated(), zero)),
      zigBack: toNumberOrZero(Prisma.Decimal.max(zig.negated(), zero)),
    },
  };
}

/**
 * Count and close a drawer. The count is checked, then — under the shift's
 * row lock, so a sale either lands before and is counted or finds the shift
 * closed — the difference is worked out against what should be there, the
 * shift closes with its count, and after the commit the variance (to the
 * cent) and the whole count to the vault post, leaving both till accounts at
 * zero (98-decisions FLR-04), owners and managers hear of a difference, and
 * the last shift closes the fiscal day. A blind cashier learns the difference from the
 * 400 that asks what happened.
 */
export async function closeShift(input: {
  session: ShiftSession;
  shiftId: string;
  body: CloseInput;
  periodOverrideReason?: string | null;
  now?: Date;
}): Promise<CloseResult> {
  const { session, body } = input;
  const companyId = session.user.companyId;
  const shift = await shiftToClose(session, input.shiftId);

  const usd = rowsOf(body.counts.USD, "USD");
  const zigRows = rowsOf(body.counts.ZWG, "ZWG");
  const settings = await loadPaymentSettings(companyId);
  if (zigRows.length > 0 && !settings.tenders.cashZig) {
    throw new CloseRefused(400, "This shop does not take ZiG cash.", { zwg: "This shop does not take ZiG cash." });
  }
  let rate: Prisma.Decimal | null = null;
  if (zigRows.length > 0) {
    const today = await latestZigRate(companyId);
    if (!today) throw new NoZigRate();
    rate = new Prisma.Decimal(today.value);
  }
  const floatLeft = new Prisma.Decimal(body.floatLeft);
  const note = body.note?.trim() || null;

  const actor = auditActorOf(session);
  const closedAt = input.now ?? new Date();

  const { closed, count, raw, zig } = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<Array<{ status: string; expectedCash: Prisma.Decimal }>>`
      SELECT "status", "expectedCash" FROM "RetailShift" WHERE "id" = ${shift.id} FOR UPDATE`;
    if (!locked || locked.status !== "OPEN") throw new CloseRefused(409, `${shift.shiftNo} is closed already.`);
    // Under the lock, so no sale or movement lands between what is booked and what is counted.
    const zig = await zigBooked(tx, shift);
    const count = countDrawer({ usd, zig: zigRows, rate, expected: money(locked.expectedCash).toFixed(2), floatLeft: floatLeft.toFixed(2) });
    const only = floatLeftProblem(floatLeft.toFixed(2), count.countedUsd);
    if (only) throw new CloseRefused(400, only, { floatLeft: only });
    if (needsExplaining(count.difference) && !note) {
      throw new CloseRefused(
        400,
        `It is out by ${formatSigned(Number(count.difference))}. Say what happened, then close.`,
        { note: NOTE_NEEDED },
        count.difference,
      );
    }
    const updated = await tx.retailShift.updateMany({
      where: { id: shift.id, companyId, status: "OPEN" },
      data: {
        status: "CLOSED",
        closedAt,
        closedById: session.user.id,
        countedCash: count.counted,
        countedUsd: count.countedUsd,
        countedZig: count.countedZig,
        countRate: rate ?? new Prisma.Decimal(1),
        countLines: { USD: usd, ZWG: zigRows },
        variance: count.difference,
        closeNote: note,
        floatLeft,
        toSafe: count.toSafe,
      },
    });
    if (updated.count !== 1) throw new CloseRefused(409, `${shift.shiftNo} is closed already.`);
    await auditShiftClosed(tx, {
      actor,
      shiftId: shift.id,
      shiftNo: shift.shiftNo,
      cashierId: shift.cashierId,
      expectedCash: locked.expectedCash,
      countedCash: count.counted,
      variance: count.difference,
      notes: note,
      count: { countedUsd: count.countedUsd, countedZig: count.countedZig, rate: rate?.toFixed(4) ?? null, floatLeft: floatLeft.toFixed(2), toSafe: count.toSafe },
    });
    // A drawer that balanced is signed off as it closes; a different one waits for a manager's sign-off.
    if (count.state === "BALANCED") {
      await createApprovalAction(tx, {
        companyId,
        entityType: "RETAIL_SHIFT",
        entityId: shift.id,
        action: "APPROVE",
        actedById: session.user.id,
        fromStatus: "OPEN",
        toStatus: "CLOSED",
        note: `Counted ${count.counted} against ${money(locked.expectedCash).toFixed(2)} expected; balanced`,
      });
    }
    const closed = await tx.retailShift.findUniqueOrThrow({ where: { id: shift.id } });
    // Counted less expected to the cent: the variance books it all, the cents the tolerance calls none included.
    const raw = new Prisma.Decimal(count.counted).minus(money(locked.expectedCash));
    return { closed, count, raw, zig };
  });

  const journal = {
    companyId,
    sourceId: closed.id,
    siteId: closed.siteId,
    registerCode: closed.registerCode,
    entryDate: closedAt,
    createdById: session.user.id,
    actorRole: session.user.role ?? undefined,
    periodOverrideReason: input.periodOverrideReason ?? undefined,
    taxAmount: 0,
  };
  // The variance moves the till accounts from what was booked to what was counted, cent for cent:
  // a drawer the tolerance calls balanced still books its stray cent to over/short.
  if (!raw.isZero()) {
    const abs = toNumberOrZero(raw.abs());
    await postRetailJournal({
      ...journal,
      sourceType: "RETAIL_SHIFT_VARIANCE",
      sourceSubtype: raw.isNegative() ? "SHORT" : "OVER",
      description: `Retail shift variance ${closed.shiftNo}`,
      amount: abs,
      netAmount: abs,
      grossAmount: abs,
      invertDirection: raw.isNegative(),
    });
  }
  // The whole count to the vault, each till account emptied of what the shift booked to it.
  const toVault = closePosting({ counted: count.counted, zigBooked: zig });
  if (Object.values(toVault.payload).some((value) => value > 0)) {
    await postRetailJournal({
      ...journal,
      sourceType: "RETAIL_SHIFT_CLOSE",
      description: `Retail shift close ${closed.shiftNo}`,
      amount: toNumberOrZero(toVault.amount),
      netAmount: toNumberOrZero(toVault.amount),
      grossAmount: toNumberOrZero(toVault.amount),
      payload: toVault.payload,
    });
  }

  const difference = new Prisma.Decimal(count.difference);
  if (!difference.isZero()) {
    const words = difference.isNegative() ? `short ${formatMoney(toNumberOrZero(difference.abs()))}` : `over ${formatMoney(toNumberOrZero(difference))}`;
    await tellManagers(companyId, session.user.id, closed, `${closed.shiftNo} is ${words}`);
  }

  // "Close the fiscal day · With the last shift" (SET-08): the shop's last open shift closing closes its day.
  const fiscalDay = await closeFiscalDayIfLastShift(actor);

  return { shiftNo: closed.shiftNo, closedAt: closedAt.toISOString(), difference: count.difference, state: count.state, fiscalDayClosed: fiscalDay.closed };
}

/** A drawer closed out or uncounted: every active owner and manager but the person who closed it. */
async function tellManagers(companyId: string, closerId: string, shift: ClosingShift, title: string) {
  const recipients = await prisma.user.findMany({
    where: { companyId, isActive: true, role: { in: ["SUPERADMIN", "MANAGER", "SHOP_MANAGER"] }, id: { not: closerId } },
    select: { id: true },
  });
  await emitRetailNotification({
    companyId,
    recipientIds: recipients.map((person) => person.id),
    type: "RETAIL_SHIFT_DIFFERENCE",
    title,
    summary: `${shift.registerName} · ${shift.cashierName}. Sign it off on the overview.`,
    entityType: "RETAIL_SHIFT",
    entityId: shift.id,
    viewPath: `/retail/shifts/${shift.id}`,
    severity: "WARNING",
  });
}

/** The routes' answer to a close: the result, or the refusal in the page's words. */
export async function answerClose(input: { session: ShiftSession; shiftId: string; body: unknown }): Promise<NextResponse> {
  const denied = closeDenial(input.session);
  if (denied) return errorResponse(denied, 403);
  const parsed = closeInput.safeParse(input.body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [top, currency, index] = issue?.path ?? [];
    if (top === "counts" && typeof index === "number") {
      const rows = (input.body as { counts?: Record<string, Array<{ denomination?: unknown }>> } | null)?.counts?.[String(currency)];
      const key = `${currency === "ZWG" ? "zwg" : "usd"}.${String(rows?.[index]?.denomination ?? index)}`;
      return fieldErrorResponse(WHOLE_NOTES, { [key]: WHOLE_NOTES });
    }
    if (top === "floatLeft") return fieldErrorResponse("Give the float, like 100.00.", { floatLeft: "Give the float, like 100.00." });
    if (top === "note") return fieldErrorResponse("Keep it to 500 characters.", { note: "Keep it to 500 characters." });
    return errorResponse("Count the notes in the drawer.", 400);
  }
  try {
    return successResponse({ data: await closeShift({ session: input.session, shiftId: input.shiftId, body: parsed.data }) });
  } catch (error) {
    return closeRefusal(error);
  }
}

/** A `CloseRefused` (or no ZiG rate) as the routes answer it; anything else is thrown on. */
export function closeRefusal(error: unknown): NextResponse {
  if (error instanceof CloseRefused) {
    if (error.difference !== undefined) {
      markActivityFailed();
      return NextResponse.json({ error: error.message, difference: error.difference, fieldErrors: error.fieldErrors }, { status: error.status });
    }
    return error.fieldErrors ? fieldErrorResponse(error.message, error.fieldErrors, error.status) : errorResponse(error.message, error.status);
  }
  if (error instanceof NoZigRate) return errorResponse(error.message, 409);
  throw error;
}

/** Close without counting (W-39, a lost handheld): cash control only; it closes "Not counted" for a manager to sign off. */
export async function closeUncounted(input: { session: ShiftSession; shiftId: string; reason: string; now?: Date }): Promise<{ shiftNo: string; closedAt: string }> {
  const { session } = input;
  if (!canRetailSessionDo(session, "retail.cash-control", "close-shift")) {
    throw new CloseRefused(403, retailPermissionDenial(session, "retail.cash-control", "close-shift")!);
  }
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 300) throw new CloseRefused(400, "Say why it was not counted.", { why: "Say why it was not counted." });
  const shift = await prisma.retailShift.findFirst({ where: { id: input.shiftId, companyId: session.user.companyId } });
  if (!shift) throw new CloseRefused(404, "Shift not found");
  if (shift.status !== "OPEN") throw new CloseRefused(409, `${shift.shiftNo} is closed already.`);
  const actor = auditActorOf(session);
  const closedAt = input.now ?? new Date();
  const done = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "RetailShift" WHERE "id" = ${shift.id} FOR UPDATE`;
    return closeShiftUncounted(tx, { actor, shiftId: shift.id, reason, now: closedAt });
  });
  if (!done) throw new CloseRefused(409, `${shift.shiftNo} is closed already.`);
  await tellManagers(session.user.companyId, session.user.id, shift, `${shift.shiftNo} closed without a count`);
  await closeFiscalDayIfLastShift(actor, closedAt);
  return { shiftNo: shift.shiftNo, closedAt: closedAt.toISOString() };
}

/** The close page's data (`GET /api/v2/retail/shifts/[id]/close`). Money as two-decimal text in US$. */
export type CountForm = {
  shiftId: string;
  shiftNo: string;
  /** "Front till · Chipo Dube · open 6h 12m". */
  sub: string;
  /** The cashier counting their own drawer: what should be there stays hidden until the server answers. */
  blind: boolean;
  denominations: { USD: string[]; ZWG: string[] | null };
  /** ZiG per US$1, "26.80"; null when the shop takes no ZiG cash or has no rate. */
  rate: string | null;
  parts: { openingFloat: string; cashSales: string; moves: { label: "Dropped to the safe" | "Cash in and out"; amount: string } | null } | null;
  expected: string | null;
  checked: Array<{ label: string; amount: string; ok: boolean; note: string }>;
  floatLeft: string;
  closed: {
    at: string;
    /** What was counted in US$, as the close wrote it; null when it was not counted. */
    counted: string | null;
    difference: string | null;
    state: "Not counted" | "Short" | "Over" | "Balanced";
    note: string | null;
    lines: { USD: CountRow[]; ZWG: CountRow[] } | null;
  } | null;
};

/** Who may read the close page: whoever may close the drawer, and cash control reading a closed one. */
async function shiftToRead(session: ShiftSession, shiftId: string): Promise<ClosingShift> {
  const shift = await prisma.retailShift.findFirst({ where: { id: shiftId, companyId: session.user.companyId } });
  if (!shift) throw new CloseRefused(404, "Shift not found");
  if (mayClose(session, shift)) return shift;
  if (shift.status === "CLOSED" && canRetailSessionDo(session, "retail.cash-control", "view")) return shift;
  const denied = closeDenial(session);
  throw new CloseRefused(403, denied ?? `Only ${shift.shiftNo}’s cashier or a manager can close it.`);
}

const text2 = (value: Prisma.Decimal.Value | null | undefined) => money(value ?? 0).toFixed(2);

/** The float a close leaves by default, on the close page and at the till: what the till's last close left, else this shift's opening float. */
export async function floatToLeave(shift: { id: string; companyId: string; registerId: string; openingFloat: Prisma.Decimal }): Promise<string> {
  const last = await prisma.retailShift.findFirst({
    where: { companyId: shift.companyId, registerId: shift.registerId, status: "CLOSED", floatLeft: { not: null }, id: { not: shift.id } },
    orderBy: { closedAt: "desc" },
    select: { floatLeft: true },
  });
  return text2(last?.floatLeft ?? shift.openingFloat);
}

function linesOf(value: Prisma.JsonValue | null): { USD: CountRow[]; ZWG: CountRow[] } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const read = (rows: unknown): CountRow[] =>
    Array.isArray(rows)
      ? rows.flatMap((row) =>
          row && typeof row === "object" && "denomination" in row && "count" in row
            ? [{ denomination: String((row as CountRow).denomination), count: Number((row as CountRow).count) || 0 }]
            : [],
        )
      : [];
  return { USD: read((value as Record<string, unknown>).USD), ZWG: read((value as Record<string, unknown>).ZWG) };
}

export async function closeForm(session: ShiftSession, shiftId: string, now: Date = new Date()): Promise<CountForm> {
  const companyId = session.user.companyId;
  const shift = await shiftToRead(session, shiftId);
  const open = shift.status === "OPEN";
  const [settings, zig, sales, movements, floatLeft] = await Promise.all([
    loadPaymentSettings(companyId),
    latestZigRate(companyId),
    prisma.retailSale.findMany({
      where: { shiftId: shift.id, companyId },
      select: { changeAmount: true, exchangeRate: true, payments: { select: { tenderType: true, baseAmount: true, reference: true } } },
    }),
    prisma.retailCashMovement.findMany({ where: { shiftId: shift.id, companyId }, select: { type: true, baseAmount: true } }),
    open ? floatToLeave(shift) : text2(shift.floatLeft ?? 0),
  ]);

  const blind = countsBlind(shift, session);

  const cashSales = sumMoney(
    sales.map((sale) =>
      getCashNetFromPayments(sale.payments, money(sale.changeAmount).div(money(sale.exchangeRate).isZero() ? 1 : money(sale.exchangeRate))),
    ),
  );
  const movesNet = sumCashMovementDeltas(movements);
  const onlyDrops = movements.length > 0 && movements.every((movement) => movement.type === "DROP_TO_SAFE");

  const tenders = new Map<string, { amount: Prisma.Decimal; missing: number }>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      if (payment.tenderType === "CASH") continue;
      const entry = tenders.get(payment.tenderType) ?? { amount: new Prisma.Decimal(0), missing: 0 };
      entry.amount = entry.amount.plus(money(payment.baseAmount));
      if (!payment.reference?.trim()) entry.missing += 1;
      tenders.set(payment.tenderType, entry);
    }
  }

  const minutes = Math.max(0, Math.floor(((shift.closedAt ?? now).getTime() - shift.openedAt.getTime()) / 60_000));
  const variance = shift.variance === null ? null : toNumberOrZero(shift.variance);
  const takesZig = settings.tenders.cashZig;

  return {
    shiftId: shift.id,
    shiftNo: shift.shiftNo,
    sub: `${shift.registerName} · ${shift.cashierName} · ${open ? `open ${formatDuration(minutes)}` : `closed ${formatTime(shift.closedAt ?? now)}`}`,
    blind,
    denominations: { USD: [...DENOMINATIONS.USD], ZWG: takesZig ? [...DENOMINATIONS.ZWG] : null },
    // An open drawer counts its ZiG at today's rate; a closed one reads back the rate its count used.
    rate: open
      ? takesZig && zig
        ? zig.rate
        : null
      : shift.countRate && !money(shift.countRate).equals(1)
        ? money(shift.countRate).toFixed(2)
        : null,
    parts: blind
      ? null
      : {
          openingFloat: text2(money(shift.openingFloat).plus(money(shift.openingFloatZigBase))),
          cashSales: cashSales.toFixed(2),
          moves: movements.length ? { label: onlyDrops ? "Dropped to the safe" : "Cash in and out", amount: movesNet.toFixed(2) } : null,
        },
    expected: blind ? null : text2(shift.expectedCash),
    checked: [...tenders.entries()]
      .sort((a, b) => b[1].amount.comparedTo(a[1].amount))
      .map(([tender, entry]) => ({
        label: tenderLabel(tender),
        amount: entry.amount.toFixed(2),
        ok: entry.missing === 0,
        note: entry.missing === 0 ? "matches" : `${entry.missing} without a reference`,
      })),
    floatLeft,
    closed: open
      ? null
      : {
          at: (shift.closedAt ?? now).toISOString(),
          counted: shift.countedCash === null ? null : text2(shift.countedCash),
          difference: variance === null || shift.countedCash === null ? null : text2(shift.variance),
          state: shiftState({ status: shift.status, countedCash: shift.countedCash, variance }) as "Not counted" | "Short" | "Over" | "Balanced",
          note: shift.closeNote,
          lines: linesOf(shift.countLines),
        },
  };
}

/** `GET …/close`: the form, or the refusal. */
export async function answerCloseForm(session: ShiftSession, shiftId: string): Promise<NextResponse> {
  try {
    return successResponse({ data: await closeForm(session, shiftId) });
  } catch (error) {
    return closeRefusal(error);
  }
}
