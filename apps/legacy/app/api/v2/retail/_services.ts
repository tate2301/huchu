import {
  Prisma,
  type RetailCashMovementReason,
  type RetailCashMovementType,
  type RetailTenderType,
} from "@corelithzw/db";
import { normalizeProvidedId, reserveIdentifier } from "@corelithzw/platform/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import {
  ZERO,
  exceeds,
  money,
  multiplyMoney,
  rate,
  sumMoney,
  toBaseAmount,
  toNumberOrZero,
  type MoneyLike,
} from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import type { CashDenominationLine } from "@/lib/retail/cash-movements";
import {
  buildCashMovementAmounts,
  cashMovementDelta,
  getCashNetFromPayments,
  totalFromDenominations,
} from "@/lib/retail/cash-up";
import { reversalSubtotal } from "@/lib/retail/sale-totals";
import { getRetailTenderPolicy, validateTenderReferences } from "@/lib/retail/tender-policy";
import {
  buildRetailZReportFigures,
  parseTradingDay,
  tradingDayAsDate,
  tradingDayWindow,
} from "@/lib/retail/z-report";
import { createApprovalAction } from "@/lib/workflow/approvals";
import {
  auditCashMoved,
  auditSalePosted,
  auditSaleReversed,
  auditShiftClosed,
  auditShiftOpened,
} from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permissions";
import {
  ensureRetailRegisterAccess,
  ensureSiteAccess,
  postRetailJournal,
  type RetailAccountingResult,
  upsertRetailRegister,
} from "./_helpers";

export type RetailActorContext = {
  companyId: string;
  userId: string;
  userRole?: string | null;
  userName?: string | null;
  userEmail?: string | null;
};

export type RetailPaymentInput = {
  tenderType: RetailTenderType;
  amount: number;
  reference?: string | null;
  /** The tender's own currency, when it differs from the sale's. */
  currency?: string | null;
  /**
   * Quote units per one base unit for this tender — 27.5 means 27.5 ZWG buys one
   * USD. Only meaningful alongside `currency`; ignored when the tender is in the
   * sale's own currency.
   */
  exchangeRate?: number | null;
};

export type RetailSaleLineInput = {
  inventoryItemId: string;
  inventoryUnit: string;
  /**
   * S-4b — what was sold, in the one item master. Was `catalogItemId`; that
   * column is frozen and nothing writes it now.
   */
  productId?: string | null;
  sourceLineId?: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  taxAmount: number;
  lineTotal: number;
  costUnit: number;
  costTotal: number;
};

function round(value: number) {
  return Number(value.toFixed(2));
}

/**
 * The currency a tenant keeps its books in.
 *
 * `AccountingSettings.baseCurrency` is the same column the ledger and the school
 * fee surface read, so retail agreeing with it is what lets a sale, its journal
 * and a VAT return talk about the same money. USD when a tenant has not been set
 * up for accounting yet — which is what `lib/accounting/bootstrap.ts` writes on
 * provisioning anyway.
 */
async function getCompanyBaseCurrency(companyId: string) {
  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
    select: { baseCurrency: true },
  });
  return settings?.baseCurrency?.trim().toUpperCase() || "USD";
}

function resolveCashierName(actor: RetailActorContext) {
  return actor.userName || actor.userEmail || "Cashier";
}

function getRetailSourceType(saleType: string) {
  if (saleType === "REFUND") return "RETAIL_REFUND" as const;
  if (saleType === "VOID") return "RETAIL_VOID" as const;
  return "RETAIL_SALE" as const;
}

function getRetailSaleDescription(saleType: string, saleNo: string) {
  if (saleType === "REFUND") return `Retail refund ${saleNo}`;
  if (saleType === "VOID") return `Retail sale void ${saleNo}`;
  return `Retail sale ${saleNo}`;
}

async function ensureRetailSaleAccountingPosted(input: {
  actor: RetailActorContext;
    sale: {
      id: string;
      saleNo: string;
      saleType: string;
    siteId: string;
    postedAt: Date | null;
    createdAt: Date;
    // `MoneyLike` rather than `number`: these come straight off a `RetailSale`
    // row, and retail money is `Decimal` since R-1.1.
    subtotal: MoneyLike;
    discountAmount: MoneyLike;
    taxAmount: MoneyLike;
    totalAmount: MoneyLike;
    changeAmount: MoneyLike;
    lines: Array<{
      inventoryItemId: string;
      itemName: string;
      quantity: MoneyLike;
      costUnit: MoneyLike;
      costTotal: MoneyLike;
    }>;
    payments: Array<{
      tenderType: RetailTenderType;
      amount: MoneyLike;
      reference: string | null;
      currency?: string | null;
    }>;
  };
  registerCode?: string | null;
  periodOverrideReason?: string | null;
}) {
  const inventoryItems = input.sale.lines.length
    ? await prisma.inventoryItem.findMany({
        where: {
          id: { in: [...new Set(input.sale.lines.map((line) => line.inventoryItemId))] },
        },
        select: { id: true, unitCost: true },
      })
    : [];
  const fallbackCostByItemId = new Map(
    inventoryItems.map((item) => [item.id, item.unitCost ?? 0]),
  );

  // Derived once. The lines and the `totalCost` beneath them used to be two
  // independent walks over `input.sale.lines`, each re-deriving unit cost from the
  // fallback map — two chances for a total to stop matching the lines it totals.
  const postingLines = input.sale.lines.map((line) => {
    const fallbackUnitCost = fallbackCostByItemId.get(line.inventoryItemId) ?? 0;
    const lineCostUnit = money(line.costUnit);
    const unitCost = lineCostUnit.isZero() ? money(fallbackUnitCost).abs() : lineCostUnit.abs();
    const lineCostTotal = money(line.costTotal);
    const totalCost = lineCostTotal.isZero()
      ? multiplyMoney(money(line.quantity).abs(), unitCost)
      : lineCostTotal.abs();
    return {
      inventoryItemId: line.inventoryItemId,
      itemName: line.itemName,
      quantity: toNumberOrZero(money(line.quantity).abs()),
      unitCost: toNumberOrZero(unitCost),
      totalCost: toNumberOrZero(totalCost),
    };
  });

  return postRetailJournal({
    companyId: input.actor.companyId,
    sourceType: getRetailSourceType(input.sale.saleType),
    sourceId: input.sale.id,
    sourceSubtype: input.sale.saleType,
    siteId: input.sale.siteId,
    registerCode: input.registerCode ?? null,
    entryDate: input.sale.postedAt ?? input.sale.createdAt,
    description: getRetailSaleDescription(input.sale.saleType, input.sale.saleNo),
    createdById: input.actor.userId,
    actorRole: input.actor.userRole ?? undefined,
    periodOverrideReason: input.periodOverrideReason ?? undefined,
    amount: toNumberOrZero(money(input.sale.totalAmount).abs()),
    netAmount: toNumberOrZero(money(input.sale.subtotal).minus(money(input.sale.discountAmount)).abs()),
    taxAmount: toNumberOrZero(money(input.sale.taxAmount).abs()),
    grossAmount: toNumberOrZero(money(input.sale.totalAmount).abs()),
    invertDirection: input.sale.saleType === "REFUND" || input.sale.saleType === "VOID",
    payments: input.sale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: toNumberOrZero(money(payment.amount).abs()),
      reference: payment.reference,
      currency: payment.currency ?? null,
    })),
    inventory: {
      lines: postingLines,
      totalCost: postingLines.reduce((total, line) => total + line.totalCost, 0),
    },
  });
}

export async function openRetailShiftTransaction(input: {
  actor: RetailActorContext;
  siteId: string;
  registerId?: string | null;
  registerName?: string | null;
  registerCode?: string | null;
  shiftNo?: string | null;
  openingFloat?: number;
  notes?: string | null;
  periodOverrideReason?: string | null;
  openedAt?: Date;
}) {
  const site = await ensureSiteAccess(input.actor.companyId, input.siteId);
  if (!site) {
    throw new Error("Invalid site");
  }

  const existing = await prisma.retailShift.findFirst({
    where: {
      companyId: input.actor.companyId,
      cashierId: input.actor.userId,
      status: "OPEN",
    },
  });
  if (existing) {
    throw new Error("Close the current shift before opening a new one");
  }

  const register = input.registerId
    ? await ensureRetailRegisterAccess({
        companyId: input.actor.companyId,
        siteId: site.id,
        registerId: input.registerId,
      })
    : await upsertRetailRegister({
        companyId: input.actor.companyId,
        siteId: site.id,
        registerName: input.registerName?.trim() || "POS Register",
        registerCode: input.registerCode ?? undefined,
      });
  if (!register) {
    throw new Error("Invalid register");
  }

  const providedCode = input.shiftNo
    ? normalizeProvidedId(input.shiftNo, "RETAIL_SHIFT")
    : null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shiftNo =
      providedCode ??
      (await reserveIdentifier(prisma, {
        companyId: input.actor.companyId,
        entity: "RETAIL_SHIFT",
        siteId: site.id,
      }));

    try {
      /*
        R-3.3. The create and its audit row go in one transaction. `create`
        alone was a bare write; wrapping it changes nothing about the shift and
        means a drawer cannot be opened without the chain recording it.
      */
      const shift = await prisma.$transaction(async (tx) => {
        const created = await tx.retailShift.create({
        data: {
          companyId: input.actor.companyId,
          shiftNo,
          registerCode: register.code,
          registerName: register.name,
          siteId: site.id,
          cashierId: input.actor.userId,
          cashierName: resolveCashierName(input.actor),
          openingFloat: input.openingFloat ?? 0,
          notes: input.notes?.trim() || null,
          status: "OPEN",
          expectedCash: input.openingFloat ?? 0,
          ...(input.openedAt ? { openedAt: input.openedAt } : {}),
        },
        });

        await auditShiftOpened(tx, {
          actor: input.actor,
          shiftId: created.id,
          shiftNo: created.shiftNo,
          siteId: created.siteId,
          registerCode: created.registerCode,
          cashierId: created.cashierId,
          openingFloat: created.openingFloat,
        });

        return created;
      });

      const openingFloat = money(shift.openingFloat);
      const accounting =
        exceeds(openingFloat, 0)
          ? await postRetailJournal({
              companyId: input.actor.companyId,
              sourceType: "RETAIL_SHIFT_OPEN",
              sourceId: shift.id,
              siteId: shift.siteId,
              registerCode: shift.registerCode,
              entryDate: shift.openedAt,
              description: `Retail shift open ${shift.shiftNo}`,
              createdById: input.actor.userId,
              actorRole: input.actor.userRole ?? undefined,
              periodOverrideReason: input.periodOverrideReason ?? undefined,
              amount: toNumberOrZero(openingFloat.abs()),
              netAmount: toNumberOrZero(openingFloat.abs()),
              taxAmount: 0,
              grossAmount: toNumberOrZero(openingFloat.abs()),
            })
          : ({
              accountingStatus: "POSTED",
              accountingError: null,
              accountingCode: null,
              journalEntryId: null,
            } satisfies RetailAccountingResult);

      return { shift, accounting };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        if (providedCode) {
          throw new Error("Shift number already exists");
        }
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate shift number");
}

export async function closeRetailShiftTransaction(input: {
  actor: RetailActorContext;
  shiftId: string;
  countedCash: number;
  notes?: string | null;
  periodOverrideReason?: string | null;
  closedAt?: Date;
  allowManagerClose?: boolean;
}) {
  const existing = await prisma.retailShift.findFirst({
    where: { id: input.shiftId, companyId: input.actor.companyId },
  });
  if (!existing) {
    throw new Error("Shift not found");
  }
  if (existing.status !== "OPEN") {
    throw new Error("Only open shifts can be closed");
  }

  const allowManagerClose = input.allowManagerClose ?? true;
  if (existing.cashierId !== input.actor.userId) {
    if (
      !allowManagerClose ||
      // R-2.4. Somebody else's drawer is `retail.cash-control`, which is the
      // resource the matrix defines as "the back-office half of a shift".
      !canRetailRoleDo(input.actor.userRole, "retail.cash-control", "close-shift")
    ) {
      throw new Error("Only the shift owner or a manager can close this shift");
    }
  }

  // In `Decimal`, not `round(a - b)`: a cash-up variance is the number a manager is
  // asked to explain, and the float subtraction it replaces could put a cent on it
  // that nobody counted.
  const variance = money(input.countedCash).minus(money(existing.expectedCash));
  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.retailShift.update({
      where: { id: existing.id },
      data: {
        status: "CLOSED",
        countedCash: input.countedCash,
        variance,
        notes: input.notes?.trim() || existing.notes,
        closedAt: input.closedAt ?? new Date(),
      },
    });

    /*
      R-3.3. The cash-up is the retail equivalent of a payroll run being
      approved: a figure somebody counted, checked against a figure the system
      derived, and signed off. `closedByOwner` on the event is the fact worth
      keeping — a manager closing a cashier's drawer is routine, and is also
      the shape of a drawer closed before its cashier could count it.
    */
    await auditShiftClosed(tx, {
      actor: input.actor,
      shiftId: closed.id,
      shiftNo: closed.shiftNo,
      cashierId: closed.cashierId,
      expectedCash: existing.expectedCash,
      countedCash: closed.countedCash ?? 0,
      variance,
      notes: input.notes,
    });

    /*
      And the same sign-off in the approvals table, where every other module's
      goes.

      Two records of one act, deliberately, because they answer different
      questions. The chained event above answers "can I trust this is what the
      system said on Friday". This answers "what has this person signed off",
      across payroll, disbursements and now the till, in one query — which is
      the question an owner asks about a manager, and it should not need three.

      No notification comes of it: `emitWorkflowNotificationFromApprovalAction`
      returns null for an entity type it has no copy for, which is right here.
      A cash-up is not waiting on anybody; it is already done.
    */
    await createApprovalAction(tx, {
      companyId: input.actor.companyId,
      entityType: "RETAIL_SHIFT",
      entityId: closed.id,
      action: "APPROVE",
      actedById: input.actor.userId,
      fromStatus: "OPEN",
      toStatus: "CLOSED",
      note: `Counted ${money(input.countedCash).toFixed(2)} against ${money(
        existing.expectedCash,
      ).toFixed(2)} expected; variance ${variance.toFixed(2)}`,
    });

    return closed;
  });

  const accounting =
    !variance.isZero()
      ? await postRetailJournal({
          companyId: input.actor.companyId,
          sourceType: "RETAIL_SHIFT_VARIANCE",
          sourceId: updated.id,
          sourceSubtype: variance.isNegative() ? "SHORT" : "OVER",
          siteId: updated.siteId,
          registerCode: updated.registerCode,
          entryDate: updated.closedAt ?? new Date(),
          description: `Retail shift variance ${updated.shiftNo}`,
          createdById: input.actor.userId,
          actorRole: input.actor.userRole ?? undefined,
          periodOverrideReason: input.periodOverrideReason ?? undefined,
          amount: toNumberOrZero(variance.abs()),
          netAmount: toNumberOrZero(variance.abs()),
          taxAmount: 0,
          grossAmount: toNumberOrZero(variance.abs()),
          invertDirection: variance.isNegative(),
        })
      : ({
          accountingStatus: "POSTED",
          accountingError: null,
          accountingCode: null,
          journalEntryId: null,
        } satisfies RetailAccountingResult);

  return { shift: updated, accounting };
}

/**
 * Records cash leaving or entering the drawer mid-shift, and moves `expectedCash`
 * with it.
 *
 * S-7.1. This is the fix. Without it a Friday drop to the safe left `expectedCash`
 * counting money that was no longer in the drawer, and the cashier read as short by
 * exactly what had been banked.
 *
 * The row and the increment go in one `$transaction`, guarded on the shift still
 * being `OPEN`, exactly as `createRetailSaleTransaction` does for a sale's net
 * cash. A movement written against a shift that closed underneath it would be a
 * movement nothing ever counts.
 *
 * `baseAmount` is what moves the column, not `amount`: `expectedCash` is
 * denominated in the company's base currency because `openingFloat` is, and a
 * bundle of ZWG notes taken to the safe at 27.5 is not 200 dollars off the drawer.
 */
export async function recordRetailCashMovementTransaction(input: {
  actor: RetailActorContext;
  shiftId: string;
  type: RetailCashMovementType;
  amount: number;
  currency?: string | null;
  exchangeRate?: number | null;
  reasonCode: RetailCashMovementReason;
  reason?: string | null;
  /**
   * The bundle as it was counted, when the till could offer a denomination set for
   * the currency. Optional: a currency with no configured denominations is keyed as
   * a total, which is what the till did before this ticket.
   */
  denominations?: CashDenominationLine[] | null;
  /**
   * A cashier moves their own drawer; moving somebody else's is a supervisory act.
   * The route decides that against `lib/retail/permissions.ts` and says so here, in
   * the same shape as `allowManagerClose` above.
   */
  allowOtherCashiers?: boolean;
}) {
  const shift = await prisma.retailShift.findFirst({
    where: { id: input.shiftId, companyId: input.actor.companyId },
  });
  if (!shift) {
    throw new Error("Shift not found");
  }
  if (shift.status !== "OPEN") {
    throw new Error("Cash can only be moved on an open shift");
  }
  if (shift.cashierId !== input.actor.userId && !(input.allowOtherCashiers ?? false)) {
    throw new Error("Only the shift owner can move cash on this drawer");
  }

  const reason = input.reason?.trim() || null;
  // The named reasons stand on their own; `OTHER` is the escape hatch, and an
  // escape hatch that lets a movement be recorded with no explanation at all is the
  // unexplained variance this ticket exists to prevent, moved one row over.
  if (input.reasonCode === "OTHER" && !reason) {
    throw new Error("Say why the cash moved");
  }

  const baseCurrency = await getCompanyBaseCurrency(input.actor.companyId);
  const currency = input.currency?.trim().toUpperCase() || baseCurrency;
  const amounts = buildCashMovementAmounts({
    amount: input.amount,
    // A movement in the company's own currency converts to itself, so a
    // single-currency shop never has to supply a rate.
    exchangeRate: currency === baseCurrency ? 1 : (input.exchangeRate ?? 1),
  });
  if (amounts.amount.isZero()) {
    throw new Error("A cash movement needs an amount");
  }

  // A breakdown that does not add up to the amount is worse than none: the safe log
  // and the drawer would disagree and the row could not say which was right. The
  // total is recomputed here rather than trusted, in `Decimal`, and a mismatch is
  // refused.
  const countedLines = (input.denominations ?? []).filter((line) => line.count > 0);
  if (countedLines.length > 0) {
    const counted = totalFromDenominations(countedLines);
    if (!counted.equals(amounts.amount)) {
      throw new Error(
        `The notes counted come to ${counted.toFixed(2)}, not ${amounts.amount.toFixed(2)}`,
      );
    }
  }

  const delta = cashMovementDelta({ type: input.type, baseAmount: amounts.baseAmount });

  return prisma.$transaction(async (tx) => {
    const movement = await tx.retailCashMovement.create({
      data: {
        companyId: input.actor.companyId,
        shiftId: shift.id,
        type: input.type,
        amount: amounts.amount,
        currency,
        exchangeRate: amounts.exchangeRate,
        baseAmount: amounts.baseAmount,
        reasonCode: input.reasonCode,
        reason,
        // Keyed to this row's own currency, never assumed to be the base one.
        denominations:
          countedLines.length > 0 ? { currency, lines: countedLines } : Prisma.DbNull,
        recordedById: input.actor.userId,
        recordedByName: resolveCashierName(input.actor),
      },
    });

    const updated = await tx.retailShift.updateMany({
      where: { id: shift.id, companyId: input.actor.companyId, status: "OPEN" },
      data: { expectedCash: { increment: delta } },
    });
    if (updated.count !== 1) {
      throw new Error("Shift is no longer open.");
    }

    const refreshed = await tx.retailShift.findFirstOrThrow({
      where: { id: shift.id, companyId: input.actor.companyId },
      select: { id: true, shiftNo: true, openingFloat: true, expectedCash: true },
    });

    // R-3.3. Cash leaving a drawer for the safe is the plainest case for a chain
    // nobody can edit: the row itself is the only evidence the money moved.
    await auditCashMoved(tx, {
      actor: input.actor,
      movementId: movement.id,
      shiftId: shift.id,
      type: movement.type,
      reasonCode: movement.reasonCode,
      amount: movement.amount,
      currency: movement.currency,
      baseAmount: movement.baseAmount,
      note: movement.reason,
    });

    return { movement, shift: refreshed };
  });
}

export async function createRetailSaleTransaction(input: {
  actor: RetailActorContext;
  shiftId: string;
  siteId: string;
  saleNo?: string | null;
  /**
   * S-7.7 — the caller's key for this one checkout attempt.
   *
   * Supply this instead of `saleNo` and the sale gets a readable number off
   * `reserveIdentifier` while retries stay safe: a replay of the same attempt
   * collides on `@@unique([companyId, clientRef])` and returns the sale that
   * already exists rather than charging the customer a second time.
   */
  clientRef?: string | null;
  customerName?: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  payments: RetailPaymentInput[];
  lines: RetailSaleLineInput[];
  promotionCode?: string | null;
  overrideReason?: string | null;
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
}) {
  const site = await ensureSiteAccess(input.actor.companyId, input.siteId);
  if (!site) {
    throw new Error("Invalid site");
  }

  const shift = await prisma.retailShift.findFirst({
    where: {
      id: input.shiftId,
      companyId: input.actor.companyId,
      status: "OPEN",
      cashierId: input.actor.userId,
    },
  });
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (shift.siteId !== site.id) {
    throw new Error("Shift site does not match the selected site");
  }

  const normalizedPayments = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(payment.amount),
    reference: payment.reference?.trim() || null,
    currency: payment.currency ?? null,
    exchangeRate: payment.exchangeRate ?? null,
  }));
  const tenderPolicy = await getRetailTenderPolicy(input.actor.companyId);
  const paymentReferenceError = validateTenderReferences(tenderPolicy, normalizedPayments);
  if (paymentReferenceError) {
    throw new Error(paymentReferenceError);
  }

  const tenderedAmount = round(
    normalizedPayments.reduce((total, payment) => total + payment.amount, 0),
  );
  const nonCashTotal = round(
    normalizedPayments
      .filter((payment) => payment.tenderType !== "CASH")
      .reduce((total, payment) => total + payment.amount, 0),
  );
  const cashTotal = round(
    normalizedPayments
      .filter((payment) => payment.tenderType === "CASH")
      .reduce((total, payment) => total + payment.amount, 0),
  );

  if (nonCashTotal > input.totalAmount) {
    throw new Error("Non-cash tenders cannot exceed the sale total");
  }
  if (tenderedAmount < input.totalAmount) {
    throw new Error("Tendered amount is below the sale total");
  }

  const cashDue = round(Math.max(input.totalAmount - nonCashTotal, 0));
  const changeAmount = round(Math.max(cashTotal - cashDue, 0));
  const providedCode = input.saleNo
    ? normalizeProvidedId(input.saleNo, "RETAIL_SALE")
    : null;
  const clientRef = input.clientRef?.trim() || null;

  /**
   * The same attempt, arriving twice.
   *
   * Checked before doing any work rather than only in the `P2002` handler
   * below. The exception path is the backstop for a genuine race; this is the
   * ordinary case — the till posted, the response was lost, the sale was queued
   * and `pos/sync` is now replaying it minutes later. Letting that reach the
   * insert would allocate a second receipt number and post a second set of
   * journal lines before the constraint threw them away.
   */
  if (clientRef) {
    const alreadyPosted = await prisma.retailSale.findFirst({
      where: { companyId: input.actor.companyId, clientRef },
      include: { lines: true, payments: true },
    });
    if (alreadyPosted) {
      const accounting = await ensureRetailSaleAccountingPosted({
        actor: input.actor,
        sale: alreadyPosted,
        registerCode: shift.registerCode,
        periodOverrideReason: input.periodOverrideReason ?? null,
      });
      return { sale: alreadyPosted, accounting };
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const saleNo =
      providedCode ??
      (await reserveIdentifier(prisma, {
        companyId: input.actor.companyId,
        entity: "RETAIL_SALE",
        siteId: site.id,
      }));

    /**
     * The sale is priced in the company's base currency at rate 1.
     *
     * That is what every retail sale has been implicitly since the module was
     * written, and writing it down is the point: the columns exist now, so the
     * value has to be *stated* rather than defaulted, or `baseAmount` lands at
     * zero and a day's takings read as nothing.
     *
     * Quoting a basket in a second currency is a separate change — it needs a
     * price list per currency and a rate the till can show the customer before
     * they agree to it. What R-1.5 buys today is that a **payment** may be in
     * ZWG against a USD-priced sale, which is the case a Harare bottle store
     * actually has all day, and that is carried on the payment rows below.
     */
    const saleCurrency = await getCompanyBaseCurrency(input.actor.companyId);
    const saleExchangeRate = rate(1);

    // Cash into the drawer, in base currency on both sides. Declared here and
    // not with the other totals above because it needs the sale's currency,
    // which is only known once the tenant's base currency has been read.
    //
    // A basket settled part in USD notes and part in ZWG is the ordinary case
    // in Harare, so each tender converts at its own rate; the change is handed
    // back in the currency the sale was priced in, so it converts at the sale's.
    const netCash = getCashNetFromPayments(
      normalizedPayments.map((payment) => {
        const paymentCurrency = payment.currency?.trim().toUpperCase() || saleCurrency;
        const paymentRate =
          paymentCurrency === saleCurrency ? saleExchangeRate : rate(payment.exchangeRate ?? 1);
        return {
          tenderType: payment.tenderType,
          baseAmount: toBaseAmount(payment.amount, paymentRate),
        };
      }),
      toBaseAmount(changeAmount, saleExchangeRate),
    );

    try {
      const sale = await prisma.$transaction(async (tx) => {
        const created = await tx.retailSale.create({
          data: {
            companyId: input.actor.companyId,
            saleNo,
            clientRef,
            shiftId: shift.id,
            siteId: site.id,
            cashierId: input.actor.userId,
            cashierName: resolveCashierName(input.actor),
            customerName: input.customerName ?? null,
            subtotal: input.subtotal,
            discountAmount: input.discountAmount,
            taxAmount: input.taxAmount,
            totalAmount: input.totalAmount,
            tenderedAmount,
            changeAmount,
            // R-1.5. Defaulting these at the column would put `baseAmount` at zero
            // on every sale the till takes, and a day's takings would read as
            // nothing. A sale priced in the base currency is rate 1 and its own
            // base amount, which is what every sale is until multi-currency
            // pricing is switched on for a tenant.
            currency: saleCurrency,
            exchangeRate: saleExchangeRate,
            baseAmount: toBaseAmount(input.totalAmount, saleExchangeRate),
            promotionCode: input.promotionCode ?? null,
            overrideReason: input.overrideReason ?? null,
            status: "POSTED",
            notes: input.notes?.trim() || null,
            postedAt: input.postedAt ?? new Date(),
            tenderSummary: normalizedPayments,
            lines: {
              create: input.lines.map((line) => ({
                companyId: input.actor.companyId,
                inventoryItemId: line.inventoryItemId,
                productId: line.productId ?? null,
                itemName: line.itemName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                costUnit: line.costUnit,
                costTotal: line.costTotal,
              })),
            },
            payments: {
              // The tender's own currency, which need not be the sale's. A
              // USD-priced basket settled in ZWG notes is the ordinary case in
              // Harare, and `normalizeRetailPostingPayments` has been carrying
              // this field the whole time with nowhere to put it.
              create: normalizedPayments.map((payment) => {
                const paymentCurrency =
                  payment.currency?.trim().toUpperCase() || saleCurrency;
                const paymentRate =
                  paymentCurrency === saleCurrency ? saleExchangeRate : rate(payment.exchangeRate ?? 1);
                return {
                  companyId: input.actor.companyId,
                  tenderType: payment.tenderType,
                  amount: payment.amount,
                  currency: paymentCurrency,
                  exchangeRate: paymentRate,
                  baseAmount: toBaseAmount(payment.amount, paymentRate),
                  reference: payment.reference,
                };
              }),
            },
          },
          include: { lines: true, payments: true },
        });

        for (const line of input.lines) {
          await recordStockMovement({
            companyId: input.actor.companyId,
            userId: input.actor.userId,
            itemId: line.inventoryItemId,
            movementType: "ISSUE",
            quantity: line.quantity,
            unit: line.inventoryUnit,
            unitCost: line.costUnit,
            notes: `Retail sale ${created.saleNo}`,
            sourceType: "RETAIL_SALE",
            sourceId: `${created.id}:${line.inventoryItemId}`,
            entryDate: created.postedAt ?? new Date(),
            tx,
          });
        }

        if (!netCash.isZero()) {
          const updatedShift = await tx.retailShift.updateMany({
            where: {
              id: shift.id,
              companyId: input.actor.companyId,
              status: "OPEN",
            },
            data: {
              expectedCash: {
                increment: netCash,
              },
            },
          });
          if (updatedShift.count !== 1) {
            throw new Error("Shift is no longer open.");
          }
        }

        await auditSalePosted(tx, {
          actor: input.actor,
          saleId: created.id,
          saleNo: created.saleNo,
          shiftId: created.shiftId,
          siteId: created.siteId,
          totalAmount: created.totalAmount,
          currency: created.currency,
          baseAmount: created.baseAmount,
          lineCount: input.lines.length,
          overrideReason: created.overrideReason,
        });

        return created;
      });

      const accounting = await ensureRetailSaleAccountingPosted({
        actor: input.actor,
        sale,
        registerCode: shift.registerCode,
        periodOverrideReason: input.periodOverrideReason ?? null,
      });

      return { sale, accounting };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (providedCode || clientRef)
      ) {
        /*
          Two attempts raced and the constraint caught the loser. Whichever key
          the caller supplied is the one to look the winner up by — `clientRef`
          first, because a caller that sends both means the attempt, not the
          number.
        */
        const existing = await prisma.retailSale.findFirst({
          where: {
            companyId: input.actor.companyId,
            ...(clientRef ? { clientRef } : { saleNo: providedCode as string }),
          },
          include: { lines: true, payments: true },
        });
        if (existing) {
          const accounting = await ensureRetailSaleAccountingPosted({
            actor: input.actor,
            sale: existing,
            registerCode: shift.registerCode,
            periodOverrideReason: input.periodOverrideReason ?? null,
          });
          return { sale: existing, accounting };
        }
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("Unable to generate sale number");
}

export async function refundRetailSaleTransaction(input: {
  actor: RetailActorContext;
  saleId: string;
  shiftId: string;
  reason: string;
  lines: Array<{ saleLineId: string; quantity: number }>;
  payments: RetailPaymentInput[];
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
  /**
   * S-7.7 — a manager who approved this at the counter, already verified.
   *
   * The actor stays the cashier: they rang it, the drawer is theirs, and the
   * shift it lands against is theirs. This says somebody with the authority
   * stood there and said yes. Only `lib/retail/manager-override.ts` produces
   * one, and only after checking the approver's role against the matrix and
   * their password with bcrypt.
   */
  approvedBy?: { id: string; name: string } | null;
}) {
  /*
    Defence in depth, and it has to know about the approval or it is simply a
    fourth opinion. This guard fired on the first refund driven end to end: the
    route had verified a manager, and the service refused anyway because the
    actor was still the cashier — a 400 reading "Only retail managers can
    process refunds" on a refund a manager had just authorised.
  */
  if (!canRetailRoleDo(input.actor.userRole, "retail.sell", "refund") && !input.approvedBy) {
    throw new Error("Only retail managers can process refunds");
  }

  const [sourceSale, shift] = await Promise.all([
    prisma.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true },
    }),
    prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: input.actor.companyId,
        status: "OPEN",
        cashierId: input.actor.userId,
      },
    }),
  ]);

  if (!sourceSale) {
    throw new Error("Sale not found");
  }
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (sourceSale.saleType !== "SALE" || sourceSale.status !== "POSTED") {
    throw new Error("Only posted sales can be refunded");
  }
  if (shift.siteId !== sourceSale.siteId) {
    throw new Error("Refund shift site does not match sale site");
  }

  const refundNo = await reserveIdentifier(prisma, {
    companyId: input.actor.companyId,
    entity: "RETAIL_SALE",
    siteId: sourceSale.siteId,
  });
  const requestedByLine = input.lines.reduce<Map<string, number>>((accumulator, line) => {
    accumulator.set(line.saleLineId, round((accumulator.get(line.saleLineId) ?? 0) + line.quantity));
    return accumulator;
  }, new Map());
  const normalizedLineRequests = [...requestedByLine.entries()].map(([saleLineId, quantity]) => ({
    saleLineId,
    quantity,
  }));

  const refundPayments = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(payment.amount),
    reference: payment.reference?.trim() || null,
    currency: payment.currency ?? null,
  }));
  const tenderPolicy = await getRetailTenderPolicy(input.actor.companyId);
  const paymentReferenceError = validateTenderReferences(tenderPolicy, refundPayments);
  if (paymentReferenceError) {
    throw new Error(paymentReferenceError);
  }
  const negativePayments = refundPayments.map((payment) => ({
    ...payment,
    amount: -payment.amount,
  }));

  const refund = await prisma.$transaction(async (tx) => {
    const currentSourceSale = await tx.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true },
    });
    if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
      throw new Error("Only posted sales can be refunded");
    }

    const priorRefunds = await tx.retailSale.findMany({
      where: {
        companyId: input.actor.companyId,
        sourceSaleId: currentSourceSale.id,
        saleType: { in: ["REFUND", "VOID"] },
      },
      include: { lines: true },
    });

    // Quantities are `Decimal(12,4)` and money `Decimal(14,2)`, so the whole
    // apportionment below runs in `Decimal` and rounds once per amount. The ratio
    // itself is deliberately left unrounded: rounding it before multiplying is how
    // a refund of every line stops adding up to the sale it reverses.
    const refundedByLine = priorRefunds
      .flatMap((sale) => sale.lines)
      .reduce<Map<string, Prisma.Decimal>>((accumulator, line) => {
        if (!line.sourceLineId) return accumulator;
        accumulator.set(
          line.sourceLineId,
          (accumulator.get(line.sourceLineId) ?? ZERO).plus(rate(line.quantity).abs()),
        );
        return accumulator;
      }, new Map());

    const requestedLines = normalizedLineRequests.map((line) => {
      const sourceLine = currentSourceSale.lines.find((entry) => entry.id === line.saleLineId);
      if (!sourceLine) {
        throw new Error("One or more refund lines are invalid.");
      }
      const sourceQuantity = rate(sourceLine.quantity);
      const requestedQuantity = rate(line.quantity);
      const alreadyRefunded = refundedByLine.get(sourceLine.id) ?? ZERO;
      const remaining = sourceQuantity.minus(alreadyRefunded);
      const refundableQty = remaining.isNegative() ? ZERO : remaining;
      if (requestedQuantity.greaterThan(refundableQty)) {
        throw new Error(`Refund quantity exceeds remaining quantity for ${sourceLine.itemName}.`);
      }

      const ratio = sourceQuantity.isZero() ? ZERO : requestedQuantity.div(sourceQuantity);
      const sourceCostUnit = money(sourceLine.costUnit).abs();
      const sourceCostTotal = money(sourceLine.costTotal);
      const wholeLineCost = sourceCostTotal.isZero()
        ? multiplyMoney(sourceQuantity, sourceCostUnit)
        : sourceCostTotal.abs();

      return {
        sourceLine,
        quantity: requestedQuantity,
        discountAmount: multiplyMoney(money(sourceLine.discountAmount).abs(), ratio).negated(),
        taxAmount: multiplyMoney(money(sourceLine.taxAmount).abs(), ratio).negated(),
        lineTotal: multiplyMoney(money(sourceLine.lineTotal).abs(), ratio).negated(),
        costUnit: sourceCostUnit,
        costTotal: multiplyMoney(wholeLineCost, ratio),
      };
    });

    // Ex-VAT, in the same basis a sale writes into this column. See
    // `reversalSubtotal` for what it was and why that reached the ledger.
    const subtotal = reversalSubtotal(requestedLines);
    const discountAmount = sumMoney(requestedLines.map((line) => line.discountAmount));
    const taxAmount = sumMoney(requestedLines.map((line) => line.taxAmount));
    const totalAmount = sumMoney(requestedLines.map((line) => line.lineTotal));
    const refundValue = totalAmount.abs();
    const paymentTotal = sumMoney(refundPayments.map((payment) => payment.amount));
    // Exactly equal, not within a cent. The `Math.abs(a - b) > 0.01` this replaces
    // is the epsilon fudge `lib/money.ts` exists to retire — it let a refund be a
    // cent off the money actually handed back, every time, and called it balanced.
    if (!paymentTotal.equals(refundValue)) {
      throw new Error("Refund payments must match the refund value");
    }

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: [...new Set(requestedLines.map((line) => line.sourceLine.inventoryItemId))] },
      },
      select: { id: true, unit: true, unitCost: true },
    });
    const inventoryItemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    const created = await tx.retailSale.create({
      data: {
        companyId: input.actor.companyId,
        saleNo: refundNo,
        shiftId: shift.id,
        sourceSaleId: currentSourceSale.id,
        siteId: currentSourceSale.siteId,
        cashierId: input.actor.userId,
        cashierName: resolveCashierName(input.actor),
        customerName: currentSourceSale.customerName,
        saleType: "REFUND",
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        tenderedAmount: -paymentTotal,
        changeAmount: 0,
        // R-1.5 — a refund is denominated by the sale it reverses, not by
        // today's rate. Leaving these to the column defaults recorded every
        // refund as USD at 1 with a `baseAmount` of zero, so a ZWG sale handed
        // back across the counter both changed currency and vanished from the
        // day's base-currency takings.
        currency: currentSourceSale.currency,
        exchangeRate: currentSourceSale.exchangeRate,
        baseAmount: toBaseAmount(totalAmount, currentSourceSale.exchangeRate),
        overrideReason: input.reason.trim(),
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: input.postedAt ?? new Date(),
        tenderSummary: negativePayments,
        lines: {
          create: requestedLines.map((line) => ({
            companyId: input.actor.companyId,
            sourceLineId: line.sourceLine.id,
            inventoryItemId: line.sourceLine.inventoryItemId,
            productId: line.sourceLine.productId,
            itemName: line.sourceLine.itemName,
            quantity: line.quantity,
            unitPrice: line.sourceLine.unitPrice,
            discountAmount: line.discountAmount,
            taxAmount: line.taxAmount,
            lineTotal: line.lineTotal,
            costUnit: line.costUnit,
            costTotal: line.costTotal,
          })),
        },
        payments: {
          // R-1.5 — the reversal is settled in the currency the sale was taken
          // in. Without these three the tender defaulted to USD at 1 with a zero
          // base amount, which is how a refund could balance against the sale on
          // the receipt and still not net off in the ledger.
          create: negativePayments.map((payment) => ({
            companyId: input.actor.companyId,
            tenderType: payment.tenderType,
            amount: payment.amount,
            currency: currentSourceSale.currency,
            exchangeRate: currentSourceSale.exchangeRate,
            baseAmount: toBaseAmount(payment.amount, currentSourceSale.exchangeRate),
            reference: payment.reference,
          })),
        },
      },
      include: { lines: true, payments: true },
    });

    for (const line of requestedLines) {
      const item = inventoryItemMap.get(line.sourceLine.inventoryItemId);
      if (!item) {
        throw new Error(`Inventory item missing for ${line.sourceLine.itemName}.`);
      }
      await recordStockMovement({
        companyId: input.actor.companyId,
        userId: input.actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        // S-1. `StockMovement.quantity` is `Decimal(12,4)` now, so the quantity
        // that was carefully kept exact through the refund arrives exact.
        quantity: line.quantity,
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail refund ${created.saleNo}`,
        sourceType: "RETAIL_REFUND",
        sourceId: `${created.id}:${item.id}`,
        entryDate: created.postedAt ?? new Date(),
        tx,
      });
    }

    const netCash = getCashNetFromPayments(
      // A reversal is denominated by the sale it reverses, so the money leaving
      // the drawer converts at that sale's rate rather than today's.
      negativePayments.map((payment) => ({
        tenderType: payment.tenderType,
        baseAmount: toBaseAmount(payment.amount, currentSourceSale.exchangeRate),
      })),
    );
    if (!netCash.isZero()) {
      const updatedShift = await tx.retailShift.updateMany({
        where: {
          id: shift.id,
          companyId: input.actor.companyId,
          status: "OPEN",
        },
        data: {
          expectedCash: {
            increment: netCash,
          },
        },
      });
      if (updatedShift.count !== 1) {
        throw new Error("Shift is no longer open.");
      }
    }

    /*
      R-3.3, and the single most important audit row in the module.

      A reversal is how a till is stolen from — ring the sale, take the cash,
      refund it — and the question afterwards is always who allowed it.
      `RUN_A_TILL` withholds `refund`, so a cashier reaches this only with a
      manager's password verified at the counter, and `approvedBy` is that
      manager. It already goes into `overrideReason` as free text on the sale
      row; that row is mutable, and free text is not evidence.
    */
    await auditSaleReversed(tx, {
      actor: input.actor,
      kind: "refund",
      saleId: created.id,
      saleNo: created.saleNo,
      sourceSaleId: currentSourceSale.id,
      sourceSaleNo: currentSourceSale.saleNo,
      shiftId: created.shiftId,
      totalAmount: created.totalAmount,
      currency: created.currency,
      reason: input.reason,
      approvedBy: input.approvedBy ?? null,
    });

    return created;
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: refund,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: refund, accounting };
}

export async function voidRetailSaleTransaction(input: {
  actor: RetailActorContext;
  saleId: string;
  shiftId: string;
  reason: string;
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
  /** A manager who approved this at the counter. See the refund above. */
  approvedBy?: { id: string; name: string } | null;
}) {
  if (!canRetailRoleDo(input.actor.userRole, "retail.sell", "void") && !input.approvedBy) {
    throw new Error("Only retail managers can void sales");
  }

  const [sourceSale, shift] = await Promise.all([
    prisma.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true, payments: true },
    }),
    prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: input.actor.companyId,
        status: "OPEN",
        cashierId: input.actor.userId,
      },
    }),
  ]);

  if (!sourceSale) {
    throw new Error("Sale not found");
  }
  if (!shift) {
    throw new Error("Open shift not found for this cashier");
  }
  if (sourceSale.saleType !== "SALE" || sourceSale.status !== "POSTED") {
    throw new Error("Only posted sales can be voided");
  }
  if (shift.siteId !== sourceSale.siteId) {
    throw new Error("Void shift site does not match sale site");
  }

  const voidNo = await reserveIdentifier(prisma, {
    companyId: input.actor.companyId,
    entity: "RETAIL_SALE",
    siteId: sourceSale.siteId,
  });

  const reversal = await prisma.$transaction(async (tx) => {
    const currentSourceSale = await tx.retailSale.findFirst({
      where: { id: input.saleId, companyId: input.actor.companyId },
      include: { lines: true, payments: true },
    });
    if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
      throw new Error("Only posted sales can be voided");
    }

    const existingReversals = await tx.retailSale.findMany({
      where: {
        companyId: input.actor.companyId,
        sourceSaleId: input.saleId,
        saleType: { in: ["REFUND", "VOID"] },
      },
      select: { id: true },
    });
    if (existingReversals.length > 0) {
      throw new Error("Sales with refunds or existing reversals cannot be voided");
    }

    const negativePayments = currentSourceSale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: toNumberOrZero(money(payment.amount).abs().negated()),
      reference: payment.reference?.trim() || null,
      currency: null,
    }));

    const inventoryItems = await tx.inventoryItem.findMany({
      where: {
        id: { in: [...new Set(currentSourceSale.lines.map((line) => line.inventoryItemId))] },
      },
      select: { id: true, unit: true, unitCost: true },
    });
    const inventoryItemMap = new Map(inventoryItems.map((item) => [item.id, item]));

    const created = await tx.retailSale.create({
      data: {
        companyId: input.actor.companyId,
        saleNo: voidNo,
        shiftId: shift.id,
        sourceSaleId: currentSourceSale.id,
        siteId: currentSourceSale.siteId,
        cashierId: input.actor.userId,
        cashierName: resolveCashierName(input.actor),
        customerName: currentSourceSale.customerName,
        saleType: "VOID",
        subtotal: money(currentSourceSale.subtotal).abs().negated(),
        discountAmount: money(currentSourceSale.discountAmount).abs().negated(),
        taxAmount: money(currentSourceSale.taxAmount).abs().negated(),
        totalAmount: money(currentSourceSale.totalAmount).abs().negated(),
        tenderedAmount: money(
          currentSourceSale.tenderedAmount ?? currentSourceSale.totalAmount,
        )
          .abs()
          .negated(),
        changeAmount: 0,
        // R-1.5 — same reasoning as the refund above: a void is denominated by
        // the sale it cancels. Defaulting these made a void of a ZWG sale post
        // as USD with a zero base amount, so the two never cancelled out.
        currency: currentSourceSale.currency,
        exchangeRate: currentSourceSale.exchangeRate,
        baseAmount: toBaseAmount(
          money(currentSourceSale.totalAmount).abs().negated(),
          currentSourceSale.exchangeRate,
        ),
        promotionCode: currentSourceSale.promotionCode,
        overrideReason: input.reason.trim(),
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: input.postedAt ?? new Date(),
        tenderSummary: negativePayments,
        lines: {
          create: currentSourceSale.lines.map((line) => ({
            companyId: input.actor.companyId,
            sourceLineId: line.id,
            inventoryItemId: line.inventoryItemId,
            productId: line.productId,
            itemName: line.itemName,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountAmount: money(line.discountAmount).abs().negated(),
            taxAmount: money(line.taxAmount).abs().negated(),
            lineTotal: money(line.lineTotal).abs().negated(),
            costUnit: money(line.costUnit),
            // `costTotal` is non-nullable and defaults to 0, so `??` never fired —
            // a line whose cost was genuinely zero kept zero, and one that was not
            // was already stored. Falling back on the product only when it is zero
            // is what the `??` was reaching for.
            costTotal: money(line.costTotal).isZero()
              ? multiplyMoney(money(line.quantity).abs(), money(line.costUnit))
              : money(line.costTotal),
          })),
        },
        payments: {
          // R-1.5 — the reversal is settled in the currency the sale was taken
          // in. Without these three the tender defaulted to USD at 1 with a zero
          // base amount, which is how a refund could balance against the sale on
          // the receipt and still not net off in the ledger.
          create: negativePayments.map((payment) => ({
            companyId: input.actor.companyId,
            tenderType: payment.tenderType,
            amount: payment.amount,
            currency: currentSourceSale.currency,
            exchangeRate: currentSourceSale.exchangeRate,
            baseAmount: toBaseAmount(payment.amount, currentSourceSale.exchangeRate),
            reference: payment.reference,
          })),
        },
      },
      include: { lines: true, payments: true },
    });

    for (const line of currentSourceSale.lines) {
      const item = inventoryItemMap.get(line.inventoryItemId);
      if (!item) {
        throw new Error(`Inventory item missing for ${line.itemName}.`);
      }
      await recordStockMovement({
        companyId: input.actor.companyId,
        userId: input.actor.userId,
        itemId: item.id,
        movementType: "RECEIPT",
        quantity: line.quantity,
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail sale void ${created.saleNo}`,
        sourceType: "RETAIL_VOID",
        sourceId: `${created.id}:${item.id}`,
        entryDate: created.postedAt ?? new Date(),
        tx,
      });
    }

    const netCash = getCashNetFromPayments(
      // A reversal is denominated by the sale it reverses, so the money leaving
      // the drawer converts at that sale's rate rather than today's.
      negativePayments.map((payment) => ({
        tenderType: payment.tenderType,
        baseAmount: toBaseAmount(payment.amount, currentSourceSale.exchangeRate),
      })),
    );
    if (!netCash.isZero()) {
      const updatedShift = await tx.retailShift.updateMany({
        where: {
          id: shift.id,
          companyId: input.actor.companyId,
          status: "OPEN",
        },
        data: {
          expectedCash: {
            increment: netCash,
          },
        },
      });
      if (updatedShift.count !== 1) {
        throw new Error("Shift is no longer open.");
      }
    }

    await tx.retailSale.update({
      where: { id: currentSourceSale.id },
      data: {
        status: "VOIDED",
        voidReason: input.reason.trim(),
      },
    });

    // R-3.3. Same reasoning as the refund above; a void is the other half of it.
    await auditSaleReversed(tx, {
      actor: input.actor,
      kind: "void",
      saleId: created.id,
      saleNo: created.saleNo,
      sourceSaleId: currentSourceSale.id,
      sourceSaleNo: currentSourceSale.saleNo,
      shiftId: created.shiftId,
      totalAmount: created.totalAmount,
      currency: created.currency,
      reason: input.reason,
      approvedBy: input.approvedBy ?? null,
    });

    return created;
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: reversal,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: reversal, accounting };
}

/**
 * Closes one register's trading day and writes the Z-report down.
 *
 * S-7.2. The whole point of this function is that it happens **once**. A
 * Z-report is the fiscal close of a register-day: the takings are banked against
 * it, and it must read the same on a reprint a month later even though a sale has
 * since been voided, a shelf price has moved and the till has been renamed. So the
 * figures are computed here, from the rows as they stand right now, and persisted.
 * Nothing recomputes them afterwards.
 *
 * ── The re-run rule ────────────────────────────────────────────────────────
 *
 * Asking twice returns the same document. That is enforced in three places and the
 * database is the one that counts:
 *
 *  1. A lookup on `(companyId, registerCode, businessDate)` short-circuits before
 *     any work is done — the ordinary case, a manager reopening the screen.
 *  2. `RetailZReport_companyId_registerCode_businessDate_key` refuses the insert
 *     regardless. Two managers pressing the button in the same second cannot both
 *     win a read-then-write race, because the race is not what decides.
 *  3. The `P2002` that (2) raises is caught and turned into a read of the row that
 *     won, not into an error. The loser of the race gets the same document as the
 *     winner, which is the only correct answer.
 *
 * `created` says which happened, so the caller can answer 200 or 201 honestly.
 *
 * ── An open drawer is an X-report, and this is not that ────────────────────
 *
 * A register with a shift still open has not finished its day, and a "final"
 * document over an unfinished one is a lie that cannot be withdrawn. So this
 * refuses, and names the shift. Reading a day mid-trade is what the reports screen
 * and the cash-up screen are for — they recompute every time and promise nothing,
 * which is exactly what an X-report is.
 */
export async function generateRetailZReportTransaction(input: {
  actor: RetailActorContext;
  registerCode: string;
  businessDate: string;
}) {
  const businessDate = parseTradingDay(input.businessDate);
  const registerCode = input.registerCode.trim();
  if (!registerCode) {
    throw new Error("A Z-report is taken for one register");
  }

  const existing = await prisma.retailZReport.findUnique({
    where: {
      companyId_registerCode_businessDate: {
        companyId: input.actor.companyId,
        registerCode,
        businessDate: tradingDayAsDate(businessDate),
      },
    },
    include: { site: { select: { name: true } } },
  });
  if (existing) {
    return { report: existing, created: false };
  }

  const { start, end } = tradingDayWindow(businessDate);
  // The drawer is the unit, so the drawer's opening decides the day — see
  // `lib/retail/z-report.ts`. Filtering sales on `postedAt` instead would move a
  // basket rung at 00:15 onto tomorrow's report while its cash sat in tonight's
  // till.
  const shifts = await prisma.retailShift.findMany({
    where: {
      companyId: input.actor.companyId,
      registerCode,
      openedAt: { gte: start, lt: end },
    },
    orderBy: { openedAt: "asc" },
  });

  if (shifts.length === 0) {
    throw new Error(`No till was opened on ${registerCode} on ${businessDate}`);
  }
  const stillOpen = shifts.find((shift) => shift.status === "OPEN");
  if (stillOpen) {
    throw new Error(
      `Cash up and close ${stillOpen.shiftNo} before taking the end-of-day report`,
    );
  }

  const shiftIds = shifts.map((shift) => shift.id);
  const [movements, sales, baseCurrency] = await Promise.all([
    prisma.retailCashMovement.findMany({
      where: { companyId: input.actor.companyId, shiftId: { in: shiftIds } },
      orderBy: { createdAt: "asc" },
    }),
    // No `status` filter, deliberately. A sale later voided keeps `status: VOIDED`
    // and its cancelling `VOID` row carries the negated amounts, so summing both
    // nets to zero. Dropping the voided original and keeping the reversal would
    // drive the day negative by the value of every cancelled basket.
    prisma.retailSale.findMany({
      where: { companyId: input.actor.companyId, shiftId: { in: shiftIds } },
      include: {
        payments: { select: { tenderType: true, baseAmount: true } },
        lines: {
          select: {
            inventoryItemId: true,
            productId: true,
            itemName: true,
            quantity: true,
            lineTotal: true,
            product: { select: { code: true } },
          },
        },
      },
    }),
    getCompanyBaseCurrency(input.actor.companyId),
  ]);

  const movementsByShift = new Map<string, typeof movements>();
  for (const movement of movements) {
    const list = movementsByShift.get(movement.shiftId) ?? [];
    list.push(movement);
    movementsByShift.set(movement.shiftId, list);
  }
  const salesByShift = new Map<string, typeof sales>();
  for (const sale of sales) {
    if (!sale.shiftId) continue;
    const list = salesByShift.get(sale.shiftId) ?? [];
    list.push(sale);
    salesByShift.set(sale.shiftId, list);
  }

  const figures = buildRetailZReportFigures({
    businessDate,
    registerCode,
    // The last shift's naming wins, and it is snapshotted here rather than joined
    // later: a till renamed in March must not restate a report locked in February.
    registerName: shifts[shifts.length - 1].registerName,
    siteId: shifts[shifts.length - 1].siteId,
    currency: baseCurrency,
    shifts: shifts.map((shift) => ({
      id: shift.id,
      shiftNo: shift.shiftNo,
      cashierName: shift.cashierName,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      openingFloat: shift.openingFloat,
      countedCash: shift.countedCash,
      movements: (movementsByShift.get(shift.id) ?? []).map((movement) => ({
        type: movement.type,
        reasonCode: movement.reasonCode,
        baseAmount: movement.baseAmount,
      })),
      sales: (salesByShift.get(shift.id) ?? []).map((sale) => ({
        saleType: sale.saleType,
        discountAmount: sale.discountAmount,
        taxAmount: sale.taxAmount,
        totalAmount: sale.totalAmount,
        changeAmount: sale.changeAmount ?? 0,
        exchangeRate: sale.exchangeRate,
        payments: sale.payments,
        lines: sale.lines.map((line) => ({
          // The product is the identity a shop thinks in; the stock row is the
          // fallback for a line rung against an item with no product behind it.
          itemKey: line.productId ?? line.inventoryItemId,
          itemName: line.itemName,
          sku: line.product?.code ?? null,
          quantity: line.quantity,
          lineTotal: line.lineTotal,
        })),
      })),
    })),
  });

  const data = {
    companyId: input.actor.companyId,
    reportNo: figures.reportNo,
    businessDate: tradingDayAsDate(figures.businessDate),
    registerCode: figures.registerCode,
    registerName: figures.registerName,
    siteId: figures.siteId,
    currency: figures.currency,
    generatedById: input.actor.userId,
    generatedByName: resolveCashierName(input.actor),
    shiftCount: figures.shiftCount,
    saleCount: figures.saleCount,
    refundCount: figures.refundCount,
    voidCount: figures.voidCount,
    itemCount: figures.itemCount,
    grossSales: figures.grossSales,
    discountTotal: figures.discountTotal,
    netSales: figures.netSales,
    taxTotal: figures.taxTotal,
    taxRatePercent: figures.taxRatePercent,
    grossTakings: figures.grossTakings,
    refundTotal: figures.refundTotal,
    voidTotal: figures.voidTotal,
    openingFloat: figures.openingFloat,
    cashTakings: figures.cashTakings,
    cashDropTotal: figures.cashDropTotal,
    cashTopUpTotal: figures.cashTopUpTotal,
    cashPayoutTotal: figures.cashPayoutTotal,
    cashMovementNet: figures.cashMovementNet,
    expectedCash: figures.expectedCash,
    countedCash: figures.countedCash,
    cashVariance: figures.cashVariance,
    tenderBreakdown: figures.tenderBreakdown,
    topItems: figures.topItems,
    cashMovements: figures.cashMovements,
    shifts: figures.shifts,
  };

  try {
    const report = await prisma.retailZReport.create({
      data,
      include: { site: { select: { name: true } } },
    });
    return { report, created: true };
  } catch (error) {
    // The other manager got there first. Their document is the document.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await prisma.retailZReport.findUniqueOrThrow({
        where: {
          companyId_registerCode_businessDate: {
            companyId: input.actor.companyId,
            registerCode,
            businessDate: tradingDayAsDate(businessDate),
          },
        },
        include: { site: { select: { name: true } } },
      });
      return { report: winner, created: false };
    }
    throw error;
  }
}

/**
 * The registers that have a closed trading day the caller could take a report on.
 *
 * The till needs this to offer anything at all: a manager arriving at the
 * end-of-day screen has a date and no idea which of the shop's registers traded.
 * Returns one row per register-day, with the report's id when it has already been
 * taken and null when it has not — which is the whole state the screen renders.
 */
export async function listRetailZReportCandidates(input: {
  companyId: string;
  businessDate: string;
}) {
  const businessDate = parseTradingDay(input.businessDate);
  const { start, end } = tradingDayWindow(businessDate);

  const [shifts, reports] = await Promise.all([
    prisma.retailShift.findMany({
      where: { companyId: input.companyId, openedAt: { gte: start, lt: end } },
      orderBy: { openedAt: "asc" },
      select: {
        registerCode: true,
        registerName: true,
        shiftNo: true,
        status: true,
        cashierName: true,
      },
    }),
    prisma.retailZReport.findMany({
      where: { companyId: input.companyId, businessDate: tradingDayAsDate(businessDate) },
      select: { id: true, reportNo: true, registerCode: true },
    }),
  ]);

  const reportByRegister = new Map(reports.map((report) => [report.registerCode, report]));
  const byRegister = new Map<
    string,
    {
      registerCode: string;
      registerName: string;
      shiftCount: number;
      openShiftNo: string | null;
      cashiers: string[];
      reportId: string | null;
      reportNo: string | null;
    }
  >();

  for (const shift of shifts) {
    const entry = byRegister.get(shift.registerCode) ?? {
      registerCode: shift.registerCode,
      registerName: shift.registerName,
      shiftCount: 0,
      openShiftNo: null,
      cashiers: [],
      reportId: reportByRegister.get(shift.registerCode)?.id ?? null,
      reportNo: reportByRegister.get(shift.registerCode)?.reportNo ?? null,
    };
    entry.registerName = shift.registerName;
    entry.shiftCount += 1;
    if (shift.status === "OPEN") entry.openShiftNo = shift.shiftNo;
    if (!entry.cashiers.includes(shift.cashierName)) entry.cashiers.push(shift.cashierName);
    byRegister.set(shift.registerCode, entry);
  }

  return [...byRegister.values()].sort((a, b) =>
    a.registerCode.localeCompare(b.registerCode),
  );
}
