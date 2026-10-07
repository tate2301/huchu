import { closeFiscalDayIfLastShift } from "@/lib/retail/fiscal-settings";
import { assignRetailSaleFiscalDay } from "@/lib/retail/fiscalisation";
import { Prisma, type RetailTenderType } from "@prisma/client";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import {
  ZERO,
  money,
  multiplyMoney,
  rate,
  sumMoney,
  toBaseAmount,
  toNumberOrZero,
  type MoneyLike,
} from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getCashNetFromPayments } from "@/lib/retail/cash-up";
import { postedChange, reversalSubtotal } from "@/lib/retail/sale-totals";
import { depositBack } from "@/lib/retail/deposits";
import {
  checkTillRule,
  loadTillRules,
  offlineReview,
  replayedAt,
  reversalReason,
  tenderRuleProblem,
  type TillRuleDecision,
} from "@/lib/retail/till-rules";
import { OFFLINE_REFUND_NO_REFERENCE_REVIEW, offlineReversalReview } from "@/lib/retail/till-rule-words";
import { approvalFor, replayApproval, type Approval, type ApproverInput } from "@/lib/retail/manager-pin";
import { refuseWhileCounted } from "@/lib/retail/stock/counts";
import {
  checkSaleTenders,
  loadPaymentSettings,
  NoZigRate,
  paymentRate,
  type PaymentSettings,
} from "@/lib/retail/payment-settings";
import { splitChange } from "@/lib/retail/payment-words";
import { queueSaleReceipt, type ReceiptRecipient } from "@/lib/retail/receipt-settings";
import {
  buildRetailZReportFigures,
  parseTradingDay,
  tradingDayAsDate,
  tradingDayWindow,
} from "@/lib/retail/z-report";
import { createApprovalAction } from "@/lib/workflow/approvals";
import {
  auditSalePosted,
  auditSaleReversed,
  auditShiftClosed,
} from "@/lib/retail/audit";
import { canRetailRoleDo } from "@/lib/retail/permissions";
import {
  ensureSiteAccess,
  normalizeRetailPostingPayments,
  postRetailJournal,
  type RetailAccountingResult,
} from "./_helpers";
import { shiftElsewhereSentence } from "@/lib/retail/device-words";

/** 409: this person's shift is open on another till ("People are not devices", 10-setup W-04 step 8). */
export class ShiftElsewhere extends Error {
  readonly status = 409;
  constructor(readonly tillName: string) {
    super(shiftElsewhereSentence(tillName));
    this.name = "ShiftElsewhere";
  }
}

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
  /**
   * The tender's own currency, when it differs from the sale's (ZiG cash). It
   * carries no rate: `stampSalePayments` stamps the shop's own (SET-05).
   */
  currency?: string | null;
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
  /** The deposit on this line's returnable bottles, net of empties back. */
  depositAmount?: number;
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
    tenderedAmount: MoneyLike | null;
    changeAmount: MoneyLike;
    changeZig: MoneyLike;
    depositAmount: MoneyLike;
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
      /** `amount` in the base currency at the rate stamped on it (SET-05). */
      baseAmount: MoneyLike;
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

  const change = postedChange(input.sale);
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
    // Read by the deposits-held line of the retail sale rule. Always a number,
    // so a rule line keyed on it never falls back to the whole amount.
    // The change rounding lines too, always numbers for the same reason.
    payload: {
      depositAmount: toNumberOrZero(money(input.sale.depositAmount).abs()),
      changeRoundingKept: change.kept,
      changeRoundingGiven: change.given,
    },
    invertDirection: input.sale.saleType === "REFUND" || input.sale.saleType === "VOID",
    // The books are kept in the base currency: each tender at its base amount
    // (ZiG notes at the rate stamped on them), and the change handed back taken
    // off the cash in the notes it was given in, so what is debited is what
    // each drawer kept.
    payments: normalizeRetailPostingPayments({
      payments: input.sale.payments.map((payment) => ({
        tenderType: payment.tenderType,
        amount: toNumberOrZero(money(payment.baseAmount).abs()),
        reference: payment.reference,
        currency: payment.currency ?? null,
      })),
      change: { usd: change.usd, zig: change.zig },
    }),
    inventory: {
      lines: postingLines,
      totalCost: postingLines.reduce((total, line) => total + line.totalCost, 0),
    },
  });
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

  // "Close the fiscal day · With the last shift" (SET-08): the shop's last open shift closing closes its day.
  const fiscalDay = await closeFiscalDayIfLastShift({
    companyId: input.actor.companyId,
    userId: input.actor.userId,
    userName: input.actor.userName ?? null,
    userRole: input.actor.userRole ?? null,
  });

  /** `fiscalDayClosed`: the fiscal day's number when this shift closing closed it, so the till can say so. */
  return { shift: updated, accounting, fiscalDayClosed: fiscalDay.closed };
}

/**
 * SET-05, W-05. The tenders of a sale, each at the rate the server stamps — the
 * shop's own for the moment of the sale (`paymentRate`), whatever rate a till
 * believes — checked against what the shop takes and in the sale's money, so
 * ZiG notes and dollars add up; and the change, split by the shop's ZiG rule
 * (`splitChange`, as the till splits it). The one path for a sale rung now
 * (`pos/sales`) and one sent in from the offline queue (`replay`, either route).
 * Throws `NoZigRate` while the shop has never set a rate for a tender's currency.
 */
export async function stampSalePayments(input: {
  companyId: string;
  payments: RetailPaymentInput[];
  amountDue: number;
  on: Date;
  /** Rung offline and sent in now: a tender turned off since is let in for a manager to look at. */
  replay: boolean;
  /** When it reached the server, for how long it was kept offline. */
  now?: Date;
}) {
  const [saleCurrency, settings] = await Promise.all([
    getCompanyBaseCurrency(input.companyId),
    loadPaymentSettings(input.companyId),
  ]);
  const tenders = checkSaleTenders(
    settings,
    input.payments.map((payment) => ({
      tenderType: payment.tenderType,
      currency: payment.currency?.trim().toUpperCase() || saleCurrency,
    })),
    input.replay,
  );
  if (tenders.refusal) {
    throw new Error(tenders.refusal);
  }
  const rates = new Map<string, Prisma.Decimal>();
  for (const payment of input.payments) {
    const currency = payment.currency?.trim().toUpperCase() || saleCurrency;
    if (!rates.has(currency)) {
      rates.set(currency, rate(await paymentRate(input.companyId, saleCurrency, currency, input.on)));
    }
  }
  const payments = input.payments.map((payment) => {
    const currency = payment.currency?.trim().toUpperCase() || saleCurrency;
    const exchangeRate = rates.get(currency)!;
    const amount = round(payment.amount);
    return {
      tenderType: payment.tenderType,
      amount,
      reference: payment.reference?.trim() || null,
      currency,
      exchangeRate,
      baseAmount: toNumberOrZero(toBaseAmount(amount, exchangeRate)),
    };
  });
  /*
    SET-06. The till rules on the tenders: one tender while split payments
    are off, a reference on card and wallet payments while references are on.
    A sale rung now is refused; one sent in from the offline queue has
    already taken the money, so it is let in for a manager to look at, and so
    is one the till kept offline longer than the rules allow.
  */
  const tillRules = await loadTillRules(input.companyId);
  const tenderRule = tenderRuleProblem(tillRules, payments);
  if (tenderRule && !input.replay) {
    throw new Error(tenderRule);
  }
  const ruleReviews = input.replay
    ? [tenderRule, offlineReview(tillRules, input.on, input.now ?? new Date())].filter(Boolean)
    : [];
  const totalOf = (rows: typeof payments) => round(rows.reduce((total, payment) => total + payment.baseAmount, 0));
  const tenderedAmount = totalOf(payments);
  const nonCashTotal = totalOf(payments.filter((payment) => payment.tenderType !== "CASH"));
  const cashTotal = totalOf(payments.filter((payment) => payment.tenderType === "CASH"));
  if (nonCashTotal > input.amountDue) {
    throw new Error("Non-cash tenders cannot exceed the sale total");
  }
  if (tenderedAmount < input.amountDue) {
    throw new Error("Tendered amount is below the sale total");
  }
  const owed = round(Math.max(cashTotal - Math.max(input.amountDue - nonCashTotal, 0), 0));
  const change = splitChange(owed, await zigChangeRule(input.companyId, saleCurrency, settings, input.on));
  const reviewReason = [tenders.reviewReason, ...ruleReviews].filter(Boolean).join(" ") || null;
  return { saleCurrency, payments, tenderedAmount, change, reviewReason };
}

/**
 * The ZiG rule change follows: only on a US dollar shop that takes ZiG cash
 * and has a rate for the moment of the sale; otherwise change is all dollars.
 */
async function zigChangeRule(companyId: string, saleCurrency: string, settings: PaymentSettings, on: Date) {
  if (saleCurrency !== "USD" || !settings.tenders.cashZig) return null;
  try {
    return { rate: (await paymentRate(companyId, saleCurrency, "ZWG", on)).toNumber(), rounding: settings.zigChangeRounding };
  } catch (error) {
    if (error instanceof NoZigRate) return null;
    throw error;
  }
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
  /**
   * The manager whose PIN let a discount or a price over the shelf through
   * (SET-06). It goes into the sale's audit event, not into `overrideReason`.
   */
  approvedBy?: Approval | null;
  notes?: string | null;
  periodOverrideReason?: string | null;
  postedAt?: Date;
  /** When the cashier confirmed the customer's ID, for a sale with an age-restricted line. */
  idCheckedAt?: Date | null;
  /** The device it was rung on (SET-04); the till is the shift's. */
  device?: { id: string; registerId: string } | null;
  /** Why a manager should look at it (an offline sale from a device unpaired since, W-76). */
  reviewReason?: string | null;
  /**
   * When the till rang it, for a sale replayed after the fact: the ZiG rate is
   * the one in force then. Defaults to `postedAt`, then now.
   */
  soldAt?: Date;
  /** Rung offline and sent in now (`pos/sales` with `offlineCreatedAt`). */
  replay?: boolean;
  /**
   * The customer's phone and email, for the copy of the receipt the shop also
   * sends by WhatsApp or email (SET-07): queued in the outbox with the sale.
   */
  receiptTo?: ReceiptRecipient | null;
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
  if (input.device && input.device.registerId !== shift.registerId) {
    throw new ShiftElsewhere(shift.registerName);
  }

  /**
   * The sale is priced in the company's base currency at rate 1; a tender in
   * another currency (ZiG cash on a US dollar shop) carries the rate the
   * caller stamped from the shop's own rates (SET-05), never the till's.
   */
  // What the customer pays: the goods, and the deposit on their bottles.
  // Deposits on returnable bottles, net of empties back: the sum of the lines'
  // own, so a refund can pay back exactly the share of the lines it returns.
  // Paid on top of `totalAmount` and posted to deposits held, never revenue.
  const depositAmount = sumMoney(input.lines.map((line) => money(line.depositAmount ?? 0)));
  const amountDue = round(input.totalAmount + toNumberOrZero(depositAmount));
  const {
    saleCurrency,
    payments: normalizedPayments,
    tenderedAmount,
    change,
    reviewReason: tenderReview,
  } = await stampSalePayments({
    companyId: input.actor.companyId,
    payments: input.payments,
    amountDue,
    on: input.soldAt ?? input.postedAt ?? new Date(),
    replay: input.replay ?? false,
  });
  const saleExchangeRate = rate(1);
  // What left the drawer as change: whole dollars and the ZiG notes, by the
  // shop's rule. Rounding the ZiG leaves it a little off what was owed; the
  // sale's journal posts that to cash over short.
  const changeAmount = change.value;
  const reviewReason = [input.reviewReason, tenderReview].filter(Boolean).join(" ") || null;
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
   * and the offline queue is now replaying it minutes later. Letting that reach the
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
      return { sale: alreadyPosted, accounting, fiscal: null };
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const saleNo =
      providedCode ??
      (await reserveIdentifier(prisma, {
        companyId: input.actor.companyId,
        entity: "RETAIL_SALE",
      }));

    // Cash into the drawer, in base currency on both sides. Declared here and
    // not with the other totals above because it needs the sale's currency,
    // which is only known once the tenant's base currency has been read.
    //
    // A basket settled part in USD notes and part in ZWG is the ordinary case
    // in Harare, so each tender converts at its own rate; the change is handed
    // back in the currency the sale was priced in, so it converts at the sale's.
    const netCash = getCashNetFromPayments(
      normalizedPayments.map((payment) => ({
        tenderType: payment.tenderType,
        baseAmount: toBaseAmount(payment.amount, payment.exchangeRate),
      })),
      toBaseAmount(changeAmount, saleExchangeRate),
    );

    try {
      const { fiscal, ...sale } = await prisma.$transaction(async (tx) => {
        // A count that does not keep selling holds its products back until it
        // is sent (W-22), checked in this transaction so a count starting now
        // and this sale take turns. A replay is not asked: the money was already taken.
        if (!input.replay) {
          await refuseWhileCounted(
            tx,
            input.actor.companyId,
            input.lines.map((line) => line.inventoryItemId),
          );
        }
        const created = await tx.retailSale.create({
          data: {
            companyId: input.actor.companyId,
            saleNo,
            clientRef,
            shiftId: shift.id,
            siteId: site.id,
            registerId: shift.registerId,
            deviceId: input.device?.id ?? null,
            reviewReason,
            cashierId: input.actor.userId,
            cashierName: resolveCashierName(input.actor),
            customerName: input.customerName ?? null,
            idCheckedAt: input.idCheckedAt ?? null,
            depositAmount,
            subtotal: input.subtotal,
            discountAmount: input.discountAmount,
            taxAmount: input.taxAmount,
            totalAmount: input.totalAmount,
            tenderedAmount,
            changeAmount,
            changeZig: change.zig,
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
            tenderSummary: normalizedPayments.map((payment) => ({
              ...payment,
              exchangeRate: payment.exchangeRate.toString(),
            })),
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
                depositAmount: money(line.depositAmount ?? 0),
              })),
            },
            payments: {
              // The tender's own currency, which need not be the sale's. A
              // USD-priced basket settled in ZWG notes is the ordinary case in
              // Harare, and `normalizeRetailPostingPayments` has been carrying
              // this field the whole time with nowhere to put it.
              create: normalizedPayments.map((payment) => ({
                companyId: input.actor.companyId,
                tenderType: payment.tenderType,
                amount: payment.amount,
                currency: payment.currency,
                exchangeRate: payment.exchangeRate,
                baseAmount: toBaseAmount(payment.amount, payment.exchangeRate),
                reference: payment.reference,
              })),
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
            reason: "SALE",
            reference: created.saleNo,
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
          approvedBy: input.approvedBy ?? null,
        });

        // The customer's copy, in the outbox with the sale: never sent for a sale that did not commit.
        await queueSaleReceipt(tx, {
          companyId: input.actor.companyId,
          saleId: created.id,
          to: input.receiptTo ?? null,
          createdById: input.actor.userId,
        });

        // Last: the sale's fiscal day, settled in this commit (SET-08). Its receipt is dated here; the sale keeps its time.
        const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: input.actor.companyId, saleId: created.id });
        return { ...created, fiscal };
      });

      const accounting = await ensureRetailSaleAccountingPosted({
        actor: input.actor,
        sale,
        registerCode: shift.registerCode,
        periodOverrideReason: input.periodOverrideReason ?? null,
      });

      return { sale, accounting, fiscal };
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
          return { sale: existing, accounting, fiscal: null };
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


/**
 * Holds the sale a refund or void reverses for the rest of the transaction
 * (`SELECT ... FOR UPDATE`). Two reversals of one sale at the same moment then
 * run one after the other: the second reads what the first wrote, so a sale
 * cannot be handed back twice, or in pieces under the refund PIN limit.
 */
async function lockSourceSale(tx: Prisma.TransactionClient, saleId: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "RetailSale" WHERE "id" = ${saleId} FOR UPDATE`;
}

/** The sentence a till shows when its refund or void lost a race with another change to the same rows. */
const REVERSAL_TRY_AGAIN = "Someone else was changing this sale at the same moment. Try again.";

/**
 * A refund's or void's transaction. A deadlock or a serialization failure
 * (Postgres 40P01, 40001; Prisma P2034) changed nothing, so the till is told
 * to try again in plain words instead of being shown the database's message.
 */
async function reversalTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  try {
    return await prisma.$transaction(work);
  } catch (error) {
    if (lostRace(error)) throw new Error(REVERSAL_TRY_AGAIN);
    throw error;
  }
}

function lostRace(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") return true;
  const message = error instanceof Error ? error.message : "";
  return /deadlock detected|could not serialize access|40P01|40001/.test(message);
}

/**
 * The manager a refund or void needs (SET-06): at the counter, the approval or
 * a 409; sent in late from an offline till, the approval if it carries one
 * that checks out, else the act goes in with a review line.
 */
async function reversalApproval(
  input: { actor: RetailActorContext; approver?: ApproverInput | null; offlineAt?: Date | null; deviceId?: string | null },
  rule: { decision: TillRuleDecision; kind: "refund" | "void" },
): Promise<{ approvedBy: Approval | null; review: string | null }> {
  const asked = {
    companyId: input.actor.companyId,
    actorRole: input.actor.userRole,
    decision: rule.decision,
    approver: input.approver,
    // The till the approver typed their PIN at, for a lock's words.
    place: { deviceId: input.deviceId ?? null },
  };
  if (input.offlineAt) {
    return replayApproval({ ...asked, review: (reason) => offlineReversalReview(rule.kind, reason) });
  }
  return { approvedBy: await approvalFor(asked), review: null };
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
  /** The device it is done on (SET-04); the till is the shift's. */
  deviceId?: string | null;
  /**
   * A manager approving this with their till PIN, when the till rules ask for
   * one (SET-06). The actor stays the cashier: they rang it, the drawer is
   * theirs, and the shift it lands against is theirs; the approver's name
   * goes on the refund and into the audit chain.
   */
  approver?: ApproverInput | null;
  /**
   * Done offline and sent in late (`refundedAt` on the refund route): when the till says it was
   * done. The money has left the drawer, so a missing approval, an unlisted
   * reason or a missing reference marks it for review instead of refusing it.
   * The date is the till's word: it is kept only when it falls after the sale
   * and the shift's opening (`replayedAt`).
   */
  offlineAt?: Date | null;
}) {
  /*
    SET-06. The reason is one of the shop's refund reasons; the refund's value
    over "Manager PIN for refunds over" needs a manager's approval (checked
    below, once the value is known). Someone who holds the approve right is
    their own approval.
  */
  const tillRules = await loadTillRules(input.actor.companyId);
  const replay = Boolean(input.offlineAt);
  const { reason, review: reasonReview } = reversalReason(tillRules, "refund", input.reason, replay);

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
    entity: "RETAIL_REFUND",
  });
  const requestedByLine = input.lines.reduce<Map<string, number>>((accumulator, line) => {
    accumulator.set(line.saleLineId, round((accumulator.get(line.saleLineId) ?? 0) + line.quantity));
    return accumulator;
  }, new Map());
  const normalizedLineRequests = [...requestedByLine.entries()].map(([saleLineId, quantity]) => ({
    saleLineId,
    quantity,
  }));

  // Paid back in the sale's own currency, at its rate, so the money out of the
  // drawer is what the refund is worth; a tender in other money is refused
  // rather than written down as that many of the sale's.
  if (input.payments.some((payment) => payment.currency && payment.currency.trim().toUpperCase() !== sourceSale.currency)) {
    throw new Error("A refund is paid back in the sale's currency.");
  }
  const refundPayments = input.payments.map((payment) => ({
    tenderType: payment.tenderType,
    amount: round(payment.amount),
    reference: payment.reference?.trim() || null,
    currency: sourceSale.currency,
  }));
  const referenceProblem = tenderRuleProblem(
    { splitTender: true, referenceRequired: tillRules.referenceRequired },
    refundPayments,
  );
  // Sent in late, the money has already gone back on the card or wallet: it
  // goes in for a manager to look at rather than being refused for good.
  if (referenceProblem && !replay) {
    throw new Error(referenceProblem);
  }
  const referenceReview = referenceProblem ? OFFLINE_REFUND_NO_REFERENCE_REVIEW : null;
  const arrived = new Date();
  const when = input.offlineAt
    ? replayedAt(input.offlineAt, { saleAt: sourceSale.postedAt ?? sourceSale.createdAt, shiftOpenedAt: shift.openedAt }, arrived)
    : { at: arrived, review: null };
  const negativePayments = refundPayments.map((payment) => ({
    ...payment,
    amount: -payment.amount,
  }));

  const { fiscal, ...refund } = await reversalTransaction(async (tx) => {
    // One reversal of a sale at a time: the earlier refunds below are read
    // after any running one has committed, so they are judged together.
    await lockSourceSale(tx, input.saleId);
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
    // The deposit each line has already paid back, so the last refund of a
    // line returns exactly what is left of it rather than a rounded share.
    const depositBackByLine = priorRefunds
      .flatMap((sale) => sale.lines)
      .reduce<Map<string, Prisma.Decimal>>((accumulator, line) => {
        if (!line.sourceLineId) return accumulator;
        accumulator.set(
          line.sourceLineId,
          (accumulator.get(line.sourceLineId) ?? ZERO).plus(money(line.depositAmount).abs()),
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

      // Bottles back with the goods: the line's deposit comes back with them.
      const deposit = depositBack(
        {
          quantity: toNumberOrZero(sourceQuantity),
          depositAmount: toNumberOrZero(sourceLine.depositAmount),
          depositRefunded: toNumberOrZero(depositBackByLine.get(sourceLine.id) ?? ZERO),
        },
        toNumberOrZero(requestedQuantity),
        toNumberOrZero(refundableQty),
      );

      return {
        sourceLine,
        quantity: requestedQuantity,
        discountAmount: multiplyMoney(money(sourceLine.discountAmount).abs(), ratio).negated(),
        taxAmount: multiplyMoney(money(sourceLine.taxAmount).abs(), ratio).negated(),
        lineTotal: multiplyMoney(money(sourceLine.lineTotal).abs(), ratio).negated(),
        costUnit: sourceCostUnit,
        costTotal: multiplyMoney(wholeLineCost, ratio),
        depositAmount: money(deposit).negated(),
      };
    });

    // Ex-VAT, in the same basis a sale writes into this column. See
    // `reversalSubtotal` for what it was and why that reached the ledger.
    const subtotal = reversalSubtotal(requestedLines);
    const discountAmount = sumMoney(requestedLines.map((line) => line.discountAmount));
    const taxAmount = sumMoney(requestedLines.map((line) => line.taxAmount));
    const totalAmount = sumMoney(requestedLines.map((line) => line.lineTotal));
    const depositAmount = sumMoney(requestedLines.map((line) => line.depositAmount));
    // The goods and their bottles' deposits: what the customer gets back.
    const refundValue = totalAmount.abs().plus(depositAmount.abs());
    const paymentTotal = sumMoney(refundPayments.map((payment) => payment.amount));
    // Exactly equal, not within a cent. The `Math.abs(a - b) > 0.01` this replaces
    // is the epsilon fudge `lib/money.ts` exists to retire — it let a refund be a
    // cent off the money actually handed back, every time, and called it balanced.
    if (!paymentTotal.equals(refundValue)) {
      throw new Error("Refund payments must match the refund value");
    }

    // The approval the refund's value needs. A wrong PIN still counts against
    // the approver: the attempt is written outside this transaction.
    // The limit is on the sale's refunds together — what earlier refunds gave
    // back plus this one — so a sale cannot be handed back in pieces under it.
    // It is in the base currency: the refunds are compared at their sale's rate.
    const alreadyRefunded = sumMoney(
      priorRefunds
        .filter((sale) => sale.saleType === "REFUND")
        .map((sale) => money(sale.totalAmount).abs().plus(money(sale.depositAmount).abs())),
    );
    const { approvedBy, review: approvalReview } = await reversalApproval(input, {
      decision: checkTillRule(tillRules, {
        act: "refund",
        amount: toBaseAmount(refundValue, currentSourceSale.exchangeRate),
        alreadyRefunded: toBaseAmount(alreadyRefunded, currentSourceSale.exchangeRate),
      }),
      kind: "refund",
    });

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
        registerId: shift.registerId,
        deviceId: input.deviceId ?? null,
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
        // Paid back on top of the goods, out of deposits held.
        depositAmount,
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
        overrideReason: reason,
        approvedById: approvedBy?.id ?? null,
        approvedByName: approvedBy?.name ?? null,
        reviewReason: [approvalReview, reasonReview, referenceReview, when.review].filter(Boolean).join(" ") || null,
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: when.at,
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
            depositAmount: line.depositAmount,
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
        reason: "REFUND",
        reference: created.saleNo,
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
      Over the till rules' limit a cashier reaches this only with a manager's
      PIN verified at the counter, and `approvedBy` is that manager. The
      approver lives here, in the audit chain, and not in `overrideReason`:
      that column keeps the listed reason alone, so Insights groups refunds by
      why, and a mutable row's free text is not evidence anyway.
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
      reason,
      approvedBy,
    });

    // Last: its fiscal day, settled in this commit (SET-08). Its receipt is dated here; the reversal keeps its time.
    const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: input.actor.companyId, saleId: created.id });
    return { ...created, fiscal };
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: refund,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: refund, accounting, fiscal };
}

export async function voidRetailSaleTransaction(input: {
  actor: RetailActorContext;
  saleId: string;
  shiftId: string;
  reason: string;
  notes?: string | null;
  periodOverrideReason?: string | null;
  /** The device it is done on (SET-04). */
  deviceId?: string | null;
  /** A manager approving this with their till PIN, when the till rules ask for one. See the refund above. */
  approver?: ApproverInput | null;
  /** Done offline and sent in late: when the till says it was done. See the refund above. */
  offlineAt?: Date | null;
}) {
  const tillRules = await loadTillRules(input.actor.companyId);
  const { reason, review: reasonReview } = reversalReason(tillRules, "void", input.reason, Boolean(input.offlineAt));

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

  // "Voids need a manager PIN": always, after 5 minutes from the sale, or
  // never. Judged at the moment the void reaches the server, a replayed one
  // too: the till's own date for it is its word, not the server's clock, so
  // a void dated back into the five free minutes is no way round the PIN.
  // One the rule asks about at arrival, sent without a PIN, goes in for review.
  const saleAt = sourceSale.postedAt ?? sourceSale.createdAt;
  const arrived = new Date();
  const { approvedBy, review: approvalReview } = await reversalApproval(input, {
    decision: checkTillRule(tillRules, { act: "void", saleAt, at: arrived }),
    kind: "void",
  });
  const when = input.offlineAt
    ? replayedAt(input.offlineAt, { saleAt, shiftOpenedAt: shift.openedAt }, arrived)
    : { at: arrived, review: null };

  const voidNo = await reserveIdentifier(prisma, {
    companyId: input.actor.companyId,
    entity: "RETAIL_VOID",
  });

  const { fiscal, ...reversal } = await reversalTransaction(async (tx) => {
    // One reversal of a sale at a time, so a void and a refund of the same
    // sale cannot both read "nothing reversed yet".
    await lockSourceSale(tx, input.saleId);
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

    // A void undoes its sale exactly (SET-05, W-05): each tender goes back in
    // its own currency at the rate stamped on it — ZiG notes as ZiG, never as
    // that many dollars — and the change the drawer gave goes back into it.
    const reversedPayments = currentSourceSale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: money(payment.amount).negated(),
      currency: payment.currency,
      exchangeRate: payment.exchangeRate,
      baseAmount: money(payment.baseAmount).negated(),
      reference: payment.reference?.trim() || null,
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
        registerId: shift.registerId,
        deviceId: input.deviceId ?? null,
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
        // The deposit goes back with the bottles' sale, or the ledger keeps a
        // liability for empties nobody owes.
        depositAmount: money(currentSourceSale.depositAmount).negated(),
        // What was tendered and the change handed back, negated: the drawer
        // and the journal take off exactly what the sale put on.
        tenderedAmount:
          currentSourceSale.tenderedAmount == null ? null : money(currentSourceSale.tenderedAmount).negated(),
        changeAmount:
          currentSourceSale.changeAmount == null ? null : money(currentSourceSale.changeAmount).negated(),
        changeZig: money(currentSourceSale.changeZig).negated(),
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
        overrideReason: reason,
        approvedById: approvedBy?.id ?? null,
        approvedByName: approvedBy?.name ?? null,
        reviewReason: [approvalReview, reasonReview, when.review].filter(Boolean).join(" ") || null,
        status: "POSTED",
        notes: input.notes?.trim() || null,
        postedAt: when.at,
        tenderSummary: reversedPayments.map((payment) => ({
          ...payment,
          amount: toNumberOrZero(payment.amount),
          exchangeRate: payment.exchangeRate.toString(),
          baseAmount: toNumberOrZero(payment.baseAmount),
        })),
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
            depositAmount: money(line.depositAmount).negated(),
          })),
        },
        payments: {
          create: reversedPayments.map((payment) => ({
            companyId: input.actor.companyId,
            ...payment,
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
        reason: "VOID",
        reference: created.saleNo,
        sourceId: `${created.id}:${item.id}`,
        entryDate: created.postedAt ?? new Date(),
        tx,
      });
    }

    // What the sale left in the drawer, taken back out: its cash tenders at
    // their base amounts, less the change it gave, read the way cash-up reads
    // every sale.
    const netCash = getCashNetFromPayments(
      created.payments,
      toBaseAmount(created.changeAmount ?? 0, created.exchangeRate),
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
        voidReason: reason,
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
      reason,
      approvedBy,
    });

    // Last: its fiscal day, settled in this commit (SET-08). Its receipt is dated here; the reversal keeps its time.
    const fiscal = await assignRetailSaleFiscalDay(tx, { companyId: input.actor.companyId, saleId: created.id });
    return { ...created, fiscal };
  });

  const accounting = await ensureRetailSaleAccountingPosted({
    actor: input.actor,
    sale: reversal,
    registerCode: shift.registerCode,
    periodOverrideReason: input.periodOverrideReason ?? null,
  });

  return { sale: reversal, accounting, fiscal };
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
        depositAmount: sale.depositAmount,
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
    depositTotal: figures.depositTotal,
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
