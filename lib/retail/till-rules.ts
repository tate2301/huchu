import { Prisma } from "@prisma/client";

import { money } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import type { RetailAuditActor } from "@/lib/retail/audit";
import {
  discountPinSentence,
  DRAWER_PIN_SENTENCE,
  MIN_REFERENCE_LENGTH,
  OFFLINE_TOO_LONG_SENTENCE,
  ONE_TENDER_SENTENCE,
  PRICE_UP_SENTENCE,
  REASON_NOT_LISTED,
  REASON_UNLISTED_REVIEW,
  REFERENCE_TENDERS,
  referenceSentence,
  refundPinSentence,
  REPLAY_MISDATED_REVIEW,
  VOID_FREE_MS,
  voidPinSentence,
  type VoidPinRule,
} from "@/lib/retail/till-rule-words";
import { currencyLabel } from "@/lib/retail/settings/company";
import { tenderLabel } from "@/lib/retail/words";

/**
 * Till rules (SET-06, W-64): when a refund, a void, a discount or the drawer
 * needs a manager's PIN, the reasons a cashier picks from, whether a sale
 * splits across tenders and card and wallet payments carry a reference, the
 * cash-drop prompt, and how long a till sells offline. One `RetailTillRules`
 * row per company; no row reads as the defaults (the board's values).
 *
 * The rules are decided here, once: `checkTillRule` for the acts that may need
 * a manager, `tenderRuleProblem` for the tenders, `offlineReview` for a sale
 * sent in late. The till reads them from `devices/me` to ask first; the
 * server asks again on every sale, refund, void and drawer opening.
 *
 * The money limits (the refund PIN limit, the cash-drop prompt) are in the
 * company's base currency, the one its prices are in (`currency`); a refund
 * of a sale in other money is compared at that sale's rate.
 */

type Db = Prisma.TransactionClient | typeof prisma;

export type TillRules = {
  refundPinOver: Prisma.Decimal;
  voidPin: VoidPinRule;
  refundReasons: string[];
  voidReasons: string[];
  splitTender: boolean;
  referenceRequired: boolean;
  maxCashierDiscountPercent: Prisma.Decimal;
  drawerOpenWithoutSale: boolean;
  cashDropPromptOver: Prisma.Decimal;
  offlineHours: number;
  /** The base currency's label ("US$", "ZiG"): what the money limits are in. */
  currency: string;
  updatedById: string | null;
  updatedAt: Date | null;
};

/** The schema's defaults: a shop that has never saved the page. */
export function defaultTillRules(): TillRules {
  return {
    refundPinOver: new Prisma.Decimal(20),
    voidPin: "ALWAYS",
    refundReasons: ["Damaged", "Wrong item", "Changed mind", "Overcharged"],
    voidReasons: ["Rang up wrong", "Customer left", "Test sale"],
    splitTender: true,
    referenceRequired: true,
    maxCashierDiscountPercent: new Prisma.Decimal(10),
    drawerOpenWithoutSale: false,
    cashDropPromptOver: new Prisma.Decimal(500),
    offlineHours: 24,
    currency: "US$",
    updatedById: null,
    updatedAt: null,
  };
}

export async function loadTillRules(companyId: string, db: Db = prisma): Promise<TillRules> {
  const [row, accounting] = await Promise.all([
    db.retailTillRules.findUnique({ where: { companyId } }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { baseCurrency: true } }),
  ]);
  const currency = currencyLabel(accounting?.baseCurrency);
  if (!row) return { ...defaultTillRules(), currency };
  return {
    refundPinOver: row.refundPinOver,
    voidPin: row.voidPin,
    refundReasons: row.refundReasons,
    voidReasons: row.voidReasons,
    splitTender: row.splitTender,
    referenceRequired: row.referenceRequired,
    maxCashierDiscountPercent: row.maxCashierDiscountPercent,
    drawerOpenWithoutSale: row.drawerOpenWithoutSale,
    cashDropPromptOver: row.cashDropPromptOver,
    offlineHours: row.offlineHours,
    currency,
    updatedById: row.updatedById,
    updatedAt: row.updatedAt,
  };
}

export type TillRulesPatch = Partial<
  Omit<TillRules, "currency" | "updatedById" | "updatedAt" | "refundPinOver" | "maxCashierDiscountPercent" | "cashDropPromptOver"> & {
    refundPinOver: string;
    maxCashierDiscountPercent: string;
    cashDropPromptOver: string;
  }
>;

/** Write the changed rules, creating the shop's row from the defaults the first time. */
export async function saveTillRules(tx: Db, actor: RetailAuditActor, patch: TillRulesPatch): Promise<void> {
  const data: Prisma.RetailTillRulesUncheckedUpdateInput = { ...patch, updatedById: actor.userId };
  await tx.retailTillRules.upsert({
    where: { companyId: actor.companyId },
    update: data,
    create: { ...(data as Prisma.RetailTillRulesUncheckedCreateInput), companyId: actor.companyId },
  });
}

/* ── The acts that may need a manager ─────────────────────────────────────── */

export type TillAct =
  /**
   * A refund worth `amount` (the goods and their deposits) in the base
   * currency, at the sale's rate. `alreadyRefunded` is what earlier refunds of
   * the same sale gave back: the limit is on the sale's refunds together, so a
   * sale cannot be handed back in pieces under it.
   */
  | { act: "refund"; amount: Prisma.Decimal.Value; alreadyRefunded?: Prisma.Decimal.Value }
  /** A void of a sale rung at `saleAt`, done at `at`. */
  | { act: "void"; saleAt: Date; at: Date }
  /** A sale's discount as a share of its shelf value; `priceUp` when a line is dearer than the shelf. */
  | { act: "discount"; percent: Prisma.Decimal.Value; priceUp?: boolean }
  /** The drawer opened without a sale. */
  | { act: "drawer" };

export type TillRuleDecision = { needsApprover: false } | { needsApprover: true; reason: string };

const FREE: TillRuleDecision = { needsApprover: false };

/**
 * Whether the rules ask a manager to approve this act. Who is asking does not
 * matter here: a person who holds the approve right is their own approval
 * (`lib/retail/manager-pin.ts#approvalFor`).
 */
export function checkTillRule(rules: TillRules, act: TillAct): TillRuleDecision {
  switch (act.act) {
    case "refund":
      return money(act.amount)
        .plus(money(act.alreadyRefunded ?? 0))
        .greaterThan(rules.refundPinOver)
        ? { needsApprover: true, reason: refundPinSentence(rules.refundPinOver.toFixed(2), rules.currency) }
        : FREE;
    case "void": {
      if (rules.voidPin === "NEVER") return FREE;
      if (rules.voidPin === "AFTER_5_MINUTES" && act.at.getTime() - act.saleAt.getTime() <= VOID_FREE_MS) return FREE;
      return { needsApprover: true, reason: voidPinSentence(rules.voidPin) };
    }
    case "discount":
      if (act.priceUp) return { needsApprover: true, reason: PRICE_UP_SENTENCE };
      return new Prisma.Decimal(act.percent).greaterThan(rules.maxCashierDiscountPercent)
        ? { needsApprover: true, reason: discountPinSentence(rules.maxCashierDiscountPercent.toFixed(2)) }
        : FREE;
    case "drawer":
      return rules.drawerOpenWithoutSale ? FREE : { needsApprover: true, reason: DRAWER_PIN_SENTENCE };
  }
}

/** A sale's discount as a percentage of what it would have cost at the shelf: 0 when nothing was on the shelf. */
export function discountPercent(discount: Prisma.Decimal.Value, shelfValue: Prisma.Decimal.Value): Prisma.Decimal {
  const shelf = new Prisma.Decimal(shelfValue);
  if (shelf.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
  return new Prisma.Decimal(discount).div(shelf).times(100);
}

/** One line of a sale as the discount rule reads it: what was charged against the shelf. */
export type DiscountedLine = {
  quantity: number;
  unitPrice: number;
  shelfUnitPrice: number;
  /** The line's own discount, keyed by the cashier. */
  lineDiscount: number;
};

/**
 * The discount rule for a sale, decided once for the counter and for a sale
 * the offline queue replays (both `pos/sales`). W-64: "any line or sale discount
 * above the cashier's largest → manager PIN". So each line is judged on its
 * own — its discount plus any price cut below the shelf, as a share of that
 * line at the shelf — and so is the sale as a whole: the order's discount
 * (less points redeemed) with every line's, as a share of the basket at the
 * shelf. A big basket cannot hide one item given away. A price above the
 * shelf always asks. A replay whose prices the replay review has explained
 * (`pricesExplained`) is judged on its discounts alone.
 */
export function saleDiscountRule(
  rules: TillRules,
  input: { lines: DiscountedLine[]; orderDiscount: number; pricesExplained: boolean },
): TillRuleDecision {
  if (!input.pricesExplained && input.lines.some((line) => line.unitPrice - line.shelfUnitPrice > 0.009)) {
    return checkTillRule(rules, { act: "discount", percent: 0, priceUp: true });
  }
  let shelfValue = new Prisma.Decimal(0);
  let given = new Prisma.Decimal(Math.max(input.orderDiscount, 0));
  for (const line of input.lines) {
    const lineShelf = new Prisma.Decimal(line.shelfUnitPrice).times(line.quantity);
    let lineGiven = new Prisma.Decimal(Math.max(line.lineDiscount, 0));
    if (!input.pricesExplained) {
      lineGiven = lineGiven.plus(new Prisma.Decimal(Math.max(line.shelfUnitPrice - line.unitPrice, 0)).times(line.quantity));
    }
    const lineRule = checkTillRule(rules, {
      act: "discount",
      percent: discountPercent(lineGiven.toDecimalPlaces(2), lineShelf.toDecimalPlaces(2)),
    });
    if (lineRule.needsApprover) return lineRule;
    shelfValue = shelfValue.plus(lineShelf);
    given = given.plus(lineGiven);
  }
  return checkTillRule(rules, {
    act: "discount",
    percent: discountPercent(given.toDecimalPlaces(2), shelfValue.toDecimalPlaces(2)),
  });
}

/* ── Reasons ──────────────────────────────────────────────────────────────── */

/** A refund or void reason the till rules refuse, under its field. */
export class TillRuleRefused extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "TillRuleRefused";
  }
}

/** Throws unless `reason` is one of the shop's refund (or void) reasons, case-blind; returns the listed spelling. */
export function listedReason(rules: TillRules, kind: "refund" | "void", reason: string): string {
  const list = kind === "refund" ? rules.refundReasons : rules.voidReasons;
  const listed = list.find((entry) => entry.toLowerCase() === reason.trim().toLowerCase());
  if (!listed) throw new TillRuleRefused(REASON_NOT_LISTED, "reason");
  return listed;
}

/**
 * The reason a refund or void keeps. At the counter it must be listed
 * (`listedReason`). Sent in late from an offline till (`replay`), the act has
 * happened, so a reason taken off the list since goes in as typed, with a
 * review line for a manager.
 */
export function reversalReason(
  rules: TillRules,
  kind: "refund" | "void",
  reason: string,
  replay: boolean,
): { reason: string; review: string | null } {
  if (!replay) return { reason: listedReason(rules, kind, reason), review: null };
  try {
    return { reason: listedReason(rules, kind, reason), review: null };
  } catch (error) {
    if (!(error instanceof TillRuleRefused)) throw error;
    return { reason: reason.trim() || "No reason given", review: REASON_UNLISTED_REVIEW };
  }
}

/* ── Tenders ──────────────────────────────────────────────────────────────── */

/**
 * What the rules say about a sale's tenders: one tender while split payments
 * are off; a reference of four characters or more on card, EcoCash and
 * InnBucks while references are on. Null when they pass.
 */
export function tenderRuleProblem(
  rules: Pick<TillRules, "splitTender" | "referenceRequired">,
  payments: Array<{ tenderType: string; reference?: string | null }>,
): string | null {
  if (!rules.splitTender && payments.length > 1) return ONE_TENDER_SENTENCE;
  if (rules.referenceRequired) {
    const missing = payments.find(
      (payment) =>
        (REFERENCE_TENDERS as readonly string[]).includes(payment.tenderType) &&
        (payment.reference?.trim().length ?? 0) < MIN_REFERENCE_LENGTH,
    );
    if (missing) return referenceSentence(tenderLabel(missing.tenderType));
  }
  return null;
}

/**
 * How old a refund or void sent through the offline queue must be to count as
 * done offline. One from a till that was online when it was done is younger:
 * it gets the counter's rules.
 */
export const OFFLINE_ACT_MIN_AGE_MS = 60 * 1000;

/**
 * Whether a refund or void sent from the offline queue (`refundedAt`/`voidedAt`) was
 * really done offline, and so may go in for review where the counter would
 * refuse it (an unlisted reason, no reference, no manager PIN). It must say
 * when it was done, that moment must not be in the future, and it must be at
 * least a minute old on arrival. Anything else is treated as done at the
 * counter, so the queue is no way round the till rules.
 */
export function doneOffline(at: Date | null | undefined, now: Date): boolean {
  if (!at || Number.isNaN(at.getTime())) return false;
  const age = now.getTime() - at.getTime();
  return age >= OFFLINE_ACT_MIN_AGE_MS;
}

/**
 * When a refund or void sent in late from an offline till goes in. The till's
 * clock is its own word, so it is taken only when it could be true: not before
 * the sale it reverses and not before the shift it lands on opened. Anything
 * earlier goes in at the time it arrived, with a review line.
 *
 * The till's date never decides a rule: `voidRetailSaleTransaction` judges
 * "Voids need a manager PIN" at arrival, so a void dated back inside the five
 * free minutes is no way round the PIN.
 */
export function replayedAt(
  claimed: Date,
  bounds: { saleAt: Date; shiftOpenedAt: Date },
  arrived: Date,
): { at: Date; review: string | null } {
  if (claimed.getTime() < bounds.saleAt.getTime() || claimed.getTime() < bounds.shiftOpenedAt.getTime()) {
    return { at: arrived, review: REPLAY_MISDATED_REVIEW };
  }
  return { at: claimed, review: null };
}

/** The review line for a sale the till kept offline longer than the rules allow; null when it is within them. */
export function offlineReview(rules: Pick<TillRules, "offlineHours">, soldAt: Date, now: Date): string | null {
  return now.getTime() - soldAt.getTime() > rules.offlineHours * 60 * 60 * 1000
    ? OFFLINE_TOO_LONG_SENTENCE
    : null;
}

/* ── What the till is told (`devices/me`) ─────────────────────────────────── */

export type TillRulesForTill = {
  /** The base currency's label: what the money limits are in. */
  currency: string;
  refundPinOver: string;
  voidPin: VoidPinRule;
  refundReasons: string[];
  voidReasons: string[];
  splitTender: boolean;
  /** The tenders that need a reference (none while references are off). */
  requiredReferenceTenders: Array<(typeof REFERENCE_TENDERS)[number]>;
  minReferenceLength: number;
  maxCashierDiscountPercent: string;
  drawerOpenWithoutSale: boolean;
  cashDropPromptOver: string;
  offlineHours: number;
};

export function tillRulesForTill(rules: TillRules): TillRulesForTill {
  return {
    currency: rules.currency,
    refundPinOver: rules.refundPinOver.toFixed(2),
    voidPin: rules.voidPin,
    refundReasons: rules.refundReasons,
    voidReasons: rules.voidReasons,
    splitTender: rules.splitTender,
    requiredReferenceTenders: rules.referenceRequired ? [...REFERENCE_TENDERS] : [],
    minReferenceLength: MIN_REFERENCE_LENGTH,
    maxCashierDiscountPercent: rules.maxCashierDiscountPercent.toFixed(2),
    drawerOpenWithoutSale: rules.drawerOpenWithoutSale,
    cashDropPromptOver: rules.cashDropPromptOver.toFixed(2),
    offlineHours: rules.offlineHours,
  };
}
