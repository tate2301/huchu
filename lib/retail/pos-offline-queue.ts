import type { RetailTenderType } from "@prisma/client";

export type PosSalePaymentInput = {
  tenderType: RetailTenderType;
  /** In the tender's own currency. */
  amount: number;
  /** ZiG cash; left out, the sale's currency. The server stamps the rate. */
  currency?: "USD" | "ZWG";
  reference?: string;
  /** A VOUCHER payment (PRD-10): never queued, a voucher needs the till online. */
  voucherCode?: string;
  voucherSecret?: string;
};

export type PosSaleQueuePayload = {
  /**
   * S-7.7 — the till's key for this checkout attempt, and this queue's identity
   * for the entry.
   *
   * It used to be `saleNo`, which meant the till also *named the receipt*: a
   * customer was handed `RSL-1787005857220984` where the server would have
   * allocated `S-005080`. The key stays — it is what stops a replay charging
   * twice — but it no longer doubles as the receipt number, and the server
   * numbers the sale when it lands.
   */
  clientRef: string;
  shiftId: string;
  customerId?: string;
  /** CUS-01: refused on a replay ("Spending points needs the internet."); the till spends none offline. */
  pointsToSpend?: number;
  discountAmount?: number;
  overrideReason?: string;
  /** The cashier confirmed the customer's ID for an age-restricted line. */
  idChecked?: boolean;
  /**
   * `productId`, matching what `pos/sales` requires.
   *
   * S-4b moved the item master to `Product` and the sale endpoints moved with it;
   * this payload did not. A queued sale replayed then came back
   * "One or more catalog items invalid" — so the offline till took money all
   * day and then could not put a single sale up when the line returned, which
   * is the worst shape this bug could have taken.
   */
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
    emptiesBack?: number;
    /** A fixed set rung as one (PRD-08): the bundle and the till's key its component lines share. */
    bundleId?: string;
    bundleRef?: string;
  }>;
  payments: PosSalePaymentInput[];
  /** What the till showed and charged (PRD-09): `pos/sales` refuses a sale rung now that it prices differently. */
  total?: number;
  /** PRD-10, online only: gift vouchers bought in the sale and a discount voucher. */
  vouchersSold?: Array<{ value: string; customerId?: string }>;
  discountVoucher?: { code: string; secret: string };
};

/**
 * What to call a sale that has not reached the server yet.
 *
 * S-7.7. It has no receipt number — the server allocates that when the sale
 * lands, which is the whole point of the change — so the queue cannot show one
 * without inventing it. It shows a short tag off the attempt key instead,
 * enough for a cashier to match a row against the note they wrote when the line
 * went down, and the screen says plainly that the number comes later.
 */
export function queuedSaleLabel(payload: PosSaleQueuePayload): string {
  const ref = payload.clientRef ?? "";
  const tag = ref.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return tag ? `Unsent · ${tag}` : "Unsent sale";
}

/* ── Refunds and voids done offline (FLR-09, SET-06's replay rule) ─────── */

/**
 * A refund or void the till did while the line was down. The money has
 * already moved, so the server never refuses it for want of a manager: sent
 * without an approval the rules wanted, it goes in flagged for review
 * (`replayApproval`). The queue says "Needs a manager" on it so the cashier
 * can have it approved before it goes (sent again with `approver` once the
 * line is back). The manager's PIN itself is never queued.
 */
export type PosReversalQueuePayload = {
  kind: "refund" | "void";
  saleId: string;
  saleNo: string;
  /** What it hands back, in the sale's money. */
  amount: number;
  /** What earlier refunds of the sale handed back: the refund PIN limit is on them together. */
  already: number;
  /** When the sale was rung, for "Voids after 5 minutes". */
  saleAt: string;
  /** When the till did it: `refundedAt` / `voidedAt` on the replay. */
  at: string;
  /** The till's request as it would have gone: refund `{ lines, reason, to, restock, customerId? }`, void `{ reason }`. */
  body: Record<string, unknown>;
};

export const NEEDS_A_MANAGER = "Needs a manager";

/** The till rules a queued reversal is judged by, as `devices/me` carries them. */
export type ReversalRules = { refundPinOver: string | number; voidPin: "ALWAYS" | "AFTER_5_MINUTES" | "NEVER" };

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Whether the rules want a manager for a queued refund or void that the
 * person who did it could not approve themselves: a refund whose sale's
 * refunds together go over the refund PIN limit, a void the void rule locks.
 */
export function reversalNeedsManager(payload: PosReversalQueuePayload, rules: ReversalRules, canApprove = false): boolean {
  if (canApprove) return false;
  if (payload.kind === "refund") return payload.amount + payload.already > Number(rules.refundPinOver) + 0.004;
  if (rules.voidPin === "NEVER") return false;
  if (rules.voidPin === "ALWAYS") return true;
  return new Date(payload.at).getTime() - new Date(payload.saleAt).getTime() > FIVE_MINUTES_MS;
}

/** "Refund of SALE-31866", "Void of SALE-31866". */
export function queuedReversalLabel(payload: PosReversalQueuePayload): string {
  return `${payload.kind === "refund" ? "Refund" : "Void"} of ${payload.saleNo}`;
}

/** The till route and body a queued reversal goes up with: the request as it was, when it was done, and an approver if one was found since. */
export function reversalRequest(payload: PosReversalQueuePayload, approver?: { userId: string; pin: string } | null): { url: string; body: Record<string, unknown> } {
  const stamp = payload.kind === "refund" ? { refundedAt: payload.at } : { voidedAt: payload.at };
  return {
    url: `/api/v2/retail/pos/sales/${encodeURIComponent(payload.saleId)}/${payload.kind}`,
    body: { ...payload.body, ...stamp, ...(approver ? { approver } : {}) },
  };
}
