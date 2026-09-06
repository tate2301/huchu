import {
  bumpOfflineRetry,
  enqueueOfflineItem,
  failOfflineItem,
  loadOfflineQueue,
  markOfflineItemQueued,
  removeOfflineItem,
  type OfflineQueueEntry,
} from "@corelithzw/module-offline/client-storage";

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
  /**
   * `productId`, matching what `pos/sales` and `pos/sync` both require.
   *
   * S-4b moved the item master to `Product` and both endpoints moved with it;
   * this payload did not. A queued sale replayed through `pos/sync` came back
   * "One or more catalog items invalid" — so the offline till took money all
   * day and then could not put a single sale up when the line returned, which
   * is the worst shape this bug could have taken.
   *
   * See the comment on `buildSalePayload` in `pos-portal-state.tsx` for how the
   * online half of the same mistake went unnoticed.
   */
  items: Array<{
    productId: string;
    quantity: number;
    unitPrice?: number;
    discountAmount?: number;
  }>;
  payments: PosSalePaymentInput[];
};

export type PosQueuedSale = OfflineQueueEntry<PosSaleQueuePayload> & {
  status: "QUEUED" | "RETRYING" | "FAILED";
};

const POS_QUEUE_KEY = "retail_pos_offline_sales_queue_v2";

/**
 * A legacy entry is still a sale, and still somebody's money.
 *
 * S-7.7 renamed this payload's key from `saleNo` to `clientRef`. A cashier who
 * upgrades mid-shift with sales still queued would have had them silently
 * dropped by a validity check that only knew the new name — the one failure
 * this queue exists to prevent. Both shapes are accepted, and `pos/sync` falls
 * back to `saleNo` for the key when `clientRef` is absent, so an old entry
 * replays with exactly the idempotency it was written with.
 */
function isValidPayload(payload: PosSaleQueuePayload) {
  const legacy = payload as unknown as { saleNo?: string };
  return Boolean(payload?.clientRef || legacy?.saleNo);
}

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
  return tag ? `Unsent · ${tag}` : "Unsent sale";
}

export function loadQueuedPosSales(): PosQueuedSale[] {
  return loadOfflineQueue<PosSaleQueuePayload>({
    key: POS_QUEUE_KEY,
    isValid: isValidPayload,
  }).map((entry) => ({
    ...entry,
    status: entry.status ?? "QUEUED",
  }));
}

export function queuePosSale(payload: PosSaleQueuePayload): PosQueuedSale {
  const queued = enqueueOfflineItem<PosSaleQueuePayload>(POS_QUEUE_KEY, payload, {
    dedupe: (existing, incoming) => existing.payload.clientRef === incoming.clientRef,
  });
  return {
    ...queued,
    status: queued.status ?? "QUEUED",
  };
}

export function removeQueuedPosSale(id: string) {
  removeOfflineItem<PosSaleQueuePayload>(POS_QUEUE_KEY, id);
}

export function bumpQueuedPosSaleRetry(id: string) {
  bumpOfflineRetry<PosSaleQueuePayload>(POS_QUEUE_KEY, id);
}

export function failQueuedPosSale(id: string, message: string) {
  failOfflineItem<PosSaleQueuePayload>(POS_QUEUE_KEY, id, message);
}

export function markQueuedPosSaleQueued(id: string) {
  markOfflineItemQueued<PosSaleQueuePayload>(POS_QUEUE_KEY, id);
}
