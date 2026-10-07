import type { RetailTenderType } from "@prisma/client";

export type PosSalePaymentInput = {
  tenderType: RetailTenderType;
  /** In the tender's own currency. */
  amount: number;
  /** ZiG cash; left out, the sale's currency. The server stamps the rate. */
  currency?: "USD" | "ZWG";
  reference?: string;
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
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  loyaltyRedemptionPoints?: number;
  discountAmount?: number;
  overrideReason?: string;
  promotionId?: string;
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
  }>;
  payments: PosSalePaymentInput[];
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
