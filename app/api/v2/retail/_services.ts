import { randomUUID } from "node:crypto";

import { assignRetailSaleFiscalDay } from "@/lib/retail/fiscalisation";
import { Prisma, type RetailTenderType } from "@prisma/client";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { recordStockMovement } from "@/lib/inventory/stock-movements";
import {
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
import { postedChange } from "@/lib/retail/sale-totals";
import { loadTillRules, offlineReview, tenderRuleProblem } from "@/lib/retail/till-rules";
import type { Approval } from "@/lib/retail/manager-pin";
import { refuseWhileCounted } from "@/lib/retail/stock/counts";
import { breakCasesForSale, type TillCase } from "@/lib/retail/stock/cases";
import { recordSaleEmpties } from "@/lib/retail/stock/empties";
import {
  checkSaleTenders,
  loadPaymentSettings,
  NoZigRate,
  paymentRate,
  type PaymentSettings,
} from "@/lib/retail/payment-settings";
import { splitChange } from "@/lib/retail/payment-words";
import { queueSaleReceipt, type ReceiptRecipient } from "@/lib/retail/receipt-settings";
import { sellGiftVouchers } from "@/lib/retail/vouchers/issue";
import { redeemInSale } from "@/lib/retail/vouchers/redeem";
import { earnPoints } from "@/lib/retail/loyalty/earn";
import { balance as pointsBalance, spendPoints } from "@/lib/retail/loyalty/ledger";
import type { LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { auditSalePosted } from "@/lib/retail/audit";
import {
  ensureSiteAccess,
  normalizeRetailPostingPayments,
  postRetailJournal,
} from "./_helpers";
import { shiftElsewhereSentence } from "@/lib/retail/device-words";
import { buildRetailZReportFigures, parseTradingDay, tradingDayAsDate, tradingDayWindow } from "@/lib/retail/z-report";

/** 409: this person's shift is open on another till ("People are not devices", 10-setup W-04 step 8). */
/** What a sale did to its customer's points (CUS-01): the `loyalty` of the `pos/sales` response. */
export type SaleLoyalty = { earned: number; spent: number; balance: number; tier: string | null };

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
  /** PRD-10: tender VOUCHER, the voucher checked for it (`checkVoucher`); its money comes off in the sale. */
  voucherId?: string | null;
};

export type RetailSaleLineInput = {
  inventoryItemId: string;
  inventoryUnit: string;
  /**
   * S-4b — what was sold, in the one item master. Was `catalogItemId`; that
   * column is frozen and nothing writes it now.
   */
  productId?: string | null;
  /** PRD-05 — the price list the engine priced it from. */
  priceListId?: string | null;
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
  /** PRD-08 — the bundle or buy-more deal it sold under, and that bundle's number in the sale (`bundleRef` "<saleId>:<n>"). */
  bundleId?: string | null;
  bundleGroup?: number | null;
  /**
   * The empties that counted against this line (`emptiesCounted`, on a
   * returnable product at a shop that takes deposits): written to the
   * Empties ledger with the sale (STK-09).
   */
  emptiesBack?: number;
  /** PRD-09 — the promotion that discounted it, and what that took off (shelf money, inside `discountAmount`). */
  promotionId?: string | null;
  promotionDiscount?: number;
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

export async function ensureRetailSaleAccountingPosted(input: {
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
    vouchersSoldAmount: MoneyLike;
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
      // PRD-10: gift vouchers bought in the sale, owed to their holders (Cr Vouchers owed).
      vouchersSoldAmount: toNumberOrZero(money(input.sale.vouchersSoldAmount).abs()),
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
      voucherId: payment.voucherId ?? null,
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
  /** FLR-01/CUS-01: who the sale was rung for; their points are earned (and spent) in its transaction. */
  customerId?: string | null;
  /**
   * CUS-01 (W-46): the loyalty scheme in force, and the points spent on the
   * sale (already taken off its lines): written as SPENT under the
   * customer's lock, then what the sale earns.
   */
  loyalty?: {
    settings: LoyaltySettings;
    spend: { customer: { id: string; name: string }; points: number; value: number; payable: number } | null;
  } | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  payments: RetailPaymentInput[];
  lines: RetailSaleLineInput[];
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
  /**
   * PRD-08 (W-12) — singles the sale needs more of than the site has, and
   * the case the till opens for them: broken inside the sale's transaction,
   * before its stock comes off.
   */
  caseBreaks?: Array<{ singleItemId: string; quantity: number; tillCase: TillCase }>;
  /**
   * PRD-10 (W-18) — gift vouchers bought in this sale, in cents: issued in
   * its transaction, paid for on top of `totalAmount` (not revenue, not VAT,
   * not fiscalised as goods), owed to their holders until spent.
   */
  vouchersSold?: Array<{ valueCents: number; customerId?: string | null }>;
  /** PRD-10 — the discount voucher the engine took off the sale (`priceSale`'s `voucherSaving`): one use comes off it. */
  discountVoucher?: { voucherId: string; discount: number } | null;
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
  // Gift vouchers bought with it: paid for on top of the goods, as deposits are.
  const vouchersSoldCents = (input.vouchersSold ?? []).reduce((sum, voucher) => sum + voucher.valueCents, 0);
  const vouchersSoldAmount = money(vouchersSoldCents).dividedBy(100);
  const amountDue = round(input.totalAmount + toNumberOrZero(depositAmount) + vouchersSoldCents / 100);
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
      return { sale: alreadyPosted, accounting, fiscal: null, vouchersSold: [] };
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
      const { fiscal, vouchersSold, loyalty, ...sale } = await prisma.$transaction(async (tx) => {
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
        if (input.caseBreaks?.length) {
          await breakCasesForSale(tx, {
            actor: { companyId: input.actor.companyId, userId: input.actor.userId, userName: input.actor.userName ?? null, userRole: input.actor.userRole ?? null },
            siteId: site.id,
            needs: input.caseBreaks,
          });
        }
        const saleId = randomUUID();
        const created = await tx.retailSale.create({
          data: {
            id: saleId,
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
            customerId: input.customerId ?? null,
            idCheckedAt: input.idCheckedAt ?? null,
            depositAmount,
            vouchersSoldAmount,
            discountVoucherId: input.discountVoucher?.voucherId ?? null,
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
            overrideReason: input.overrideReason ?? null,
            approvedById: input.approvedBy?.id ?? null,
            approvedByName: input.approvedBy?.name ?? null,
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
                priceListId: line.priceListId ?? null,
                itemName: line.itemName,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
                costUnit: line.costUnit,
                costTotal: line.costTotal,
                depositAmount: money(line.depositAmount ?? 0),
                bundleId: line.bundleId ?? null,
                bundleRef: line.bundleId && line.bundleGroup ? `${saleId}:${line.bundleGroup}` : null,
                promotionId: line.promotionId ?? null,
                promotionDiscount: money(line.promotionDiscount ?? 0),
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
                voucherId: payment.voucherId,
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

        // PRD-10: the vouchers it was paid with and the discount voucher, each a guarded
        // decrement (a voucher spent elsewhere meanwhile refuses the whole sale, 409);
        // then the gift vouchers it bought.
        const voucherActor = { companyId: input.actor.companyId, userId: input.actor.userId, userName: input.actor.userName ?? null, userRole: input.actor.userRole ?? null };
        await redeemInSale(tx, {
          actor: voucherActor,
          sale: { id: created.id, saleNo: created.saleNo, siteId: created.siteId, at: created.postedAt ?? new Date() },
          tenders: normalizedPayments
            .filter((payment) => payment.tenderType === "VOUCHER" && payment.voucherId)
            .map((payment) => ({ voucherId: payment.voucherId!, amount: payment.amount })),
          discount: input.discountVoucher ?? null,
        });
        const vouchersSold = input.vouchersSold?.length
          ? await sellGiftVouchers(tx, { actor: voucherActor, saleId: created.id, vouchers: input.vouchersSold, now: created.postedAt ?? new Date() })
          : [];

        // CUS-01: the points spent (the customer's row locked, the balance checked again), then what it earns.
        let loyalty: SaleLoyalty | null = null;
        if (input.loyalty && created.customerId) {
          const postedAt = created.postedAt ?? new Date();
          if (input.loyalty.spend) {
            await spendPoints(tx, {
              companyId: input.actor.companyId,
              customer: input.loyalty.spend.customer,
              points: input.loyalty.spend.points,
              value: input.loyalty.spend.value,
              payable: input.loyalty.spend.payable,
              saleId: created.id,
              actor: { id: input.actor.userId, name: resolveCashierName(input.actor) },
              settings: input.loyalty.settings,
              at: postedAt,
            });
          }
          const earned = await earnPoints(
            tx,
            {
              id: created.id,
              companyId: input.actor.companyId,
              customerId: created.customerId,
              postedAt,
              cashierName: created.cashierName,
              lines: created.lines,
            },
            input.loyalty.settings,
          );
          loyalty = {
            earned: earned.points,
            spent: input.loyalty.spend?.points ?? 0,
            balance: await pointsBalance(tx, created.customerId),
            tier: earned.tier,
          };
        }

        // STK-09: the deposit charged and the empties swapped back, on the Empties ledger.
        await recordSaleEmpties(tx, {
          companyId: input.actor.companyId,
          siteId: created.siteId,
          saleId: created.id,
          saleNo: created.saleNo,
          customerId: created.customerId,
          createdById: input.actor.userId,
          depositAmount: created.depositAmount,
          lines: input.lines,
        });

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
        return { ...created, fiscal, vouchersSold, loyalty };
      });

      const accounting = await ensureRetailSaleAccountingPosted({
        actor: input.actor,
        sale,
        registerCode: shift.registerCode,
        periodOverrideReason: input.periodOverrideReason ?? null,
      });

      return { sale, accounting, fiscal, vouchersSold, loyalty };
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
          return { sale: existing, accounting, fiscal: null, vouchersSold: [], loyalty: null };
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
        status: sale.status,
        approvedById: sale.approvedById,
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
      openingFloatZigBase: shift.openingFloatZigBase,
      variance: shift.variance
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
    approvedDiscountCount: figures.approvedDiscountCount,
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
