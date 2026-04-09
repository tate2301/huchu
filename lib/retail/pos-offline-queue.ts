import {
  bumpOfflineRetry,
  enqueueOfflineItem,
  failOfflineItem,
  loadOfflineQueue,
  markOfflineItemQueued,
  removeOfflineItem,
  type OfflineQueueEntry,
} from "@/lib/offline/client-storage";

export type PosSalePaymentInput = {
  tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";
  amount: number;
  reference?: string;
};

export type PosSaleQueuePayload = {
  saleNo: string;
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
  items: Array<{
    catalogItemId: string;
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

function isValidPayload(payload: PosSaleQueuePayload) {
  return Boolean(payload?.saleNo);
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
    dedupe: (existing, incoming) => existing.payload.saleNo === incoming.saleNo,
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
