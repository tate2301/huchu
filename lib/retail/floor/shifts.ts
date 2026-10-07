import { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";

import { errorResponse, fieldErrorResponse } from "@/lib/api-response";
import { reserveIdentifier } from "@/lib/id-generator";
import { exceeds, money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { auditShiftOpened } from "@/lib/retail/audit";
import { shiftOpenPosting } from "@/lib/retail/cash-up";
import { openFiscalDayIfNone } from "@/lib/retail/fiscal-settings";
import { canRetailRoleDo, canRetailSessionDo, retailPermissionDenial, type SessionLike } from "@/lib/retail/permission-matrix";
import { latestZigRate, loadPaymentSettings, NoZigRate } from "@/lib/retail/payment-settings";
import { FLOAT_MESSAGE, FLOAT_PATTERN, tillWords } from "@/lib/retail/shift-open-rules";
import { postRetailJournal, type RetailAccountingResult } from "@/app/api/v2/retail/_helpers";

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
