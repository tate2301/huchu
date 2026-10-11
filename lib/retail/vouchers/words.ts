import type { RetailVoucherFunding, RetailVoucherKind, RetailVoucherSendBy } from "@prisma/client";

import { formatCount, formatDay, formatMoney } from "@/lib/workspace/format";

/**
 * Vouchers in words (W-18, PRD-10, 20-products §3.2): what each kind is
 * called, how its value and what is left read, who holds it and its state.
 * Browser-safe: the list, the record, the sheets and the server share it.
 */

/** "Gift voucher", "Credit note", "Discount voucher" (the list, the record's title). */
export const KIND_WORDS: Record<RetailVoucherKind, string> = {
  GIFT: "Gift voucher",
  CREDIT_NOTE: "Credit note",
  DISCOUNT: "Discount voucher",
};

/** The Issue vouchers sheet's Kind segment: a discount voucher is a "Promotion" there. */
export const FORM_KINDS: ReadonlyArray<{ kind: RetailVoucherKind; label: string }> = [
  { kind: "GIFT", label: "Gift voucher" },
  { kind: "CREDIT_NOTE", label: "Credit note" },
  { kind: "DISCOUNT", label: "Promotion" },
];

export const SEND_BY_WORDS: Record<RetailVoucherSendBy, string> = { PRINT: "Print", WHATSAPP: "WhatsApp", BOTH: "Both" };

export const FUNDING_WORDS: Record<RetailVoucherFunding, string> = { SOLD: "Sold", GIVEN: "Given", REFUND: "Refund of" };

/** Each kind's line of numbers. */
export const KIND_ENTITY = {
  GIFT: "RETAIL_GIFT_VOUCHER",
  CREDIT_NOTE: "RETAIL_CREDIT_NOTE",
  DISCOUNT: "RETAIL_DISCOUNT_VOUCHER",
} as const satisfies Record<RetailVoucherKind, string>;

/** Who holds one nobody was named for. */
export const ANYONE = "Anyone holding it";

/** The secret's letters: A–Z without O and I, and 2–9, so nothing reads as another. */
export const SECRET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const SECRET_LENGTH = 6;

export const isMoneyKind = (kind: RetailVoucherKind) => kind !== "DISCOUNT";

/** "2027-09-28" off a `@db.Date` column. */
export const dateKeyOf = (value: Date) => value.toISOString().slice(0, 10);

export type VoucherFacts = {
  kind: RetailVoucherKind;
  value: number | null;
  balance: number;
  percentOff: number | null;
  amountOff: number | null;
  copies: number;
  usesLeft: number | null;
  expiresOn: string;
  voidedAt: Date | string | null;
  expiredAt: Date | string | null;
};

/** "US$50.00", "10% off", "US$5.00 off". */
export function valueWords(facts: Pick<VoucherFacts, "kind" | "value" | "percentOff" | "amountOff">): string {
  if (isMoneyKind(facts.kind)) return formatMoney(facts.value ?? 0);
  if (facts.percentOff !== null) return `${Number(facts.percentOff.toFixed(2))}% off`;
  return `${formatMoney(facts.amountOff ?? 0)} off`;
}

/** "US$7.40", "12 left". */
export function leftWords(facts: Pick<VoucherFacts, "kind" | "balance" | "usesLeft">): string {
  if (isMoneyKind(facts.kind)) return formatMoney(facts.balance);
  return `${formatCount(facts.usesLeft ?? 0)} left`;
}

/** "Tapiwa Marange", "Anyone holding it", "Delta reps, 20 printed". */
export function holderWords(holder: string | null, facts: Pick<VoucherFacts, "kind" | "copies">): string {
  const who = holder?.trim() || ANYONE;
  return facts.kind === "DISCOUNT" ? `${who}, ${formatCount(facts.copies)} printed` : who;
}

export type VoucherState = "LIVE" | "IN_USE" | "USED_UP" | "EXPIRED" | "VOID";

/**
 * 20-products §3.2: voided → Void; nothing left → Used up; past its expiry
 * (or expired by the worker) → Expired; else Live, In use once it was spent.
 */
export function voucherState(facts: VoucherFacts, today: string, uses = 0): VoucherState {
  if (facts.voidedAt) return "VOID";
  const nothingLeft = isMoneyKind(facts.kind) ? facts.balance <= 0 : (facts.usesLeft ?? 0) <= 0;
  if (nothingLeft) return "USED_UP";
  if (facts.expiredAt || facts.expiresOn < today) return "EXPIRED";
  return uses > 0 ? "IN_USE" : "LIVE";
}

export const STATE_WORDS: Record<VoucherState, string> = {
  LIVE: "Live",
  IN_USE: "In use",
  USED_UP: "Used up",
  EXPIRED: "Expired",
  VOID: "Void",
};

/** "28 September 2027". */
export const expiryWords = (expiresOn: string) => formatDay(expiresOn);

/**
 * The message a voucher goes out in (W-18, Defined here): "Hurudza Creative: a
 * US$50.00 gift voucher for you, GV-0022, code 7K4P2Q. Use it at Harare
 * Bottle Store until 3 October 2027."
 */
export function voucherMessage(input: {
  company: string;
  shop: string;
  kind: RetailVoucherKind;
  value: string;
  code: string;
  secret: string;
  expiresOn: string;
}): string {
  const what =
    input.kind === "GIFT"
      ? `a ${input.value} gift voucher`
      : input.kind === "CREDIT_NOTE"
        ? `a ${input.value} credit note`
        : `a voucher for ${input.value}`;
  return `${input.company}: ${what} for you, ${input.code}, code ${input.secret}. Use it at ${input.shop} until ${formatDay(input.expiresOn)}.`;
}

/** "US$7.40 left on it can no longer be spent. …" (the `voidvoucher` ask). */
export function voidAskWords(left: string | null): string {
  const lead = left ? `${left} left on it can no longer be spent.` : "It can no longer be used.";
  return `${lead} The books write it off, and it shows in Activity with your reason.`;
}
