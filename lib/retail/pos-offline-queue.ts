export type PosSalePaymentInput = {
  tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";
  amount: number;
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
  siteId: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  loyaltyRedemptionPoints?: number;
  discountAmount?: number;
  overrideReason?: string;
  promotionId?: string;
  /** When the cashier checked the customer's ID, for a sale with an 18+ product. */
  ageCheckedAt?: string;
  /** Empties brought back, grouped by the deposit each carries. */
  emptiesBack?: Array<{ depositAmount: number; quantity: number }>;
  /** `productId`, as `pos/sales` requires. */
  items: Array<{
    productId: string;
    /** The item's name when it was rung, for the Waiting screen. The server ignores it. */
    name?: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
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
 *
 * Legacy entries queued before the split carry `saleNo`; those had a real (if
 * ugly) number and it is shown as it stands.
 */
export function queuedSaleLabel(payload: PosSaleQueuePayload): string {
  const legacy = (payload as unknown as { saleNo?: string }).saleNo;
  if (legacy) return legacy;
  const ref = payload.clientRef ?? "";
  const tag = ref.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase();
  return tag ? `Unsent ${tag}` : "Unsent sale";
}
