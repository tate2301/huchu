import { approvalAsk } from "@/lib/retail/approver-words";
import { tenderWord } from "@/lib/retail/words";
import { formatMoney, formatTime } from "@/lib/workspace/format";

/**
 * A refund's and a void's words (50-floor, FLR-02), shared by the sheets and
 * the server. Browser-safe: no database here.
 */

export type RefundTo = "ORIGINAL" | "CASH" | "CREDIT_NOTE" | "VOUCHER";

/** The tenders a refund can go back on as they were paid: one of these, alone. */
export const ORIGINAL_TENDERS = ["CARD", "ECOCASH", "INNBUCKS", "TRANSFER", "VOUCHER"] as const;

/** "Money goes back as": the way it was paid, as the segment reads it. */
const ORIGINAL_LABEL: Record<(typeof ORIGINAL_TENDERS)[number], string> = {
  CARD: "The card",
  ECOCASH: "EcoCash",
  INNBUCKS: "InnBucks",
  TRANSFER: "The transfer",
  VOUCHER: "The voucher",
};

export function originalLabel(tender: string): string {
  return ORIGINAL_LABEL[tender as keyof typeof ORIGINAL_LABEL] ?? tender;
}

export const TO_LABELS: Record<Exclude<RefundTo, "ORIGINAL">, string> = {
  CASH: "Cash",
  CREDIT_NOTE: "Credit note",
  VOUCHER: "Voucher",
};

export const REFUND_NOTE = "A refund is a new sale with a minus, linked to this one. The fiscal device signs it.";
export const NOT_ORIGINAL = "Pay it back in cash, or as a credit note or voucher.";
export const CREDIT_NOTE_NEEDS_CUSTOMER = "A credit note needs a customer.";
export const PICK_A_DRAWER = "Pick the drawer the cash comes out of.";
export const CHOOSE_WHAT_COMES_BACK = "Choose what comes back.";
export const VOID_TODAY_ONLY = "Only today’s sales can be voided. Refund it instead.";
export const VOID_TODAY_TOOLTIP = "Only today’s sales can be voided.";

/** "Front till" → "the front till": a till's name inside a sentence. */
function tillInSentence(name: string): string {
  return /^\S+ till$/i.test(name.trim()) ? `the ${name.trim().toLowerCase()}` : name.trim();
}

/** "Johnnie Walker Black 750ml" back: "Only 1 … can still come back.", or none at all. */
export function onlyLeftSentence(name: string, left: number): string {
  if (left <= 0) return `All of the ${name} has come back already.`;
  return `Only ${Number(left.toFixed(4))} ${name} can still come back.`;
}

/** "SALE-31866 was voided." */
export const wasVoided = (saleNo: string) => `${saleNo} was voided.`;

/** "SALE-31866 has a refund against it. Refund the rest instead." */
export const hasRefund = (saleNo: string) => `${saleNo} has a refund against it. Refund the rest instead.`;

/** "Front till’s shift is closed. Refund it instead." */
export const tillShiftClosed = (till: string) => `${till}’s shift is closed. Refund it instead.`;

/** "card", "cash and EcoCash": how a sale was paid, inside a sentence. */
export function paidInSentence(payments: ReadonlyArray<{ tenderType: string; currency?: string | null }>): string {
  const ways = [...new Set(payments.map(tenderWord))].map((word) => (/^(Card|Cash|Transfer|Voucher|On account)$/.test(word) ? word.toLowerCase() : word));
  if (ways.length === 0) return "nothing taken";
  if (ways.length === 1) return ways[0]!;
  if (ways.length === 2) return `${ways[0]} and ${ways[1]}`;
  return `${ways.length} ways`;
}

/**
 * The refund's Manager PIN line: under the limit nothing is needed; over it,
 * the viewer's own approval (ok) or who to ask (warn). The limit is on the
 * sale's refunds together.
 */
export function refundPinLine(input: {
  value: number;
  already: number;
  pinOver: number;
  currency: string;
  canApprove: boolean;
  me: string;
  approvers: readonly string[];
  now?: Date;
}): { text: string; tone: "ok" | "warn" | undefined; asks: boolean } {
  const limit = formatMoney(input.pinOver, input.currency);
  if (input.value + input.already <= input.pinOver) return { text: `Not needed under ${limit}.`, tone: undefined, asks: false };
  if (input.canApprove) {
    return { text: `Needed, over ${limit}. ${input.me} approved at ${formatTime(input.now ?? new Date())}.`, tone: "ok", asks: false };
  }
  return { text: `Needed, over ${limit}. ${approvalAsk(input.approvers)}`, tone: "warn", asks: true };
}

/** The void's Manager PIN line: "Not needed.", the viewer's own approval, or who to ask. */
export function voidPinLine(input: {
  needed: boolean;
  canApprove: boolean;
  me: string;
  approvers: readonly string[];
  now?: Date;
}): { text: string; tone: "ok" | "warn" | undefined; asks: boolean } {
  if (!input.needed) return { text: "Not needed.", tone: undefined, asks: false };
  if (input.canApprove) return { text: `Needed. ${input.me}, ${formatTime(input.now ?? new Date())}.`, tone: "ok", asks: false };
  return { text: `Needed. ${approvalAsk(input.approvers)}`, tone: "warn", asks: true };
}

/**
 * The void sheet's note, by how the sale was paid: "… Stock goes back and the
 * card payment is reversed." / "… and the cash comes back out of the front till."
 */
export function voidNote(tenders: readonly string[], till: string): string {
  const parts = [...new Set(tenders)].map((tender) => {
    if (tender === "CASH") return `the cash comes back out of ${tillInSentence(till)}`;
    if (tender === "VOUCHER") return "the voucher gets its money back";
    if (tender === "ON_ACCOUNT") return "the account is credited";
    return `the ${tender === "CARD" ? "card" : tender === "TRANSFER" ? "transfer" : tenderWord({ tenderType: tender })} payment is reversed`;
  });
  const how = parts.length === 0 ? "" : ` and ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`}`;
  return `Only today’s sales can be voided; after that it is a refund. Stock goes back${how}.`;
}

export type RefundDone = {
  id: string;
  saleNo: string;
  value: string;
  currency: string;
  to: RefundTo;
  /** The tender it went back on, for ORIGINAL. */
  tender: string | null;
  /** The till whose drawer the cash came out of, for CASH. */
  till: string | null;
  voucherCode: string | null;
};

/** "RFD-0045 done. US$42.00 back on the card." */
export function refundDoneSentence(done: RefundDone): string {
  const amount = formatMoney(Number(done.value), done.currency);
  let how: string;
  if (done.to === "CASH") how = done.till ? `${amount} in cash from ${tillInSentence(done.till)}.` : `${amount} in cash.`;
  else if (done.to === "CREDIT_NOTE") how = `${amount} as credit note ${done.voucherCode ?? ""}.`.replace(" .", ".");
  else if (done.to === "VOUCHER") how = `${amount} as voucher ${done.voucherCode ?? ""}.`.replace(" .", ".");
  else how = `${amount} back on ${originalLabel(done.tender ?? "").replace(/^The /, "the ")}.`;
  return `${done.saleNo} done. ${how}`;
}
