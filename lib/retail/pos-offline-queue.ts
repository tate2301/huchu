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

export type PosQueuedSale = {
  id: string;
  queuedAt: string;
  retryCount: number;
  status: "QUEUED" | "RETRYING" | "FAILED";
  lastAttemptAt?: string;
  lastError?: string;
  payload: PosSaleQueuePayload;
};

const POS_QUEUE_KEY = "retail_pos_offline_sales_queue_v2";

function isBrowser() {
  return typeof window !== "undefined";
}

function makeQueueId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parse(raw: string | null): PosQueuedSale[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PosQueuedSale[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => Boolean(entry?.id) && Boolean(entry?.payload?.saleNo))
      .map((entry) => ({
        ...entry,
        retryCount: Number.isFinite(entry.retryCount) ? Math.max(0, entry.retryCount) : 0,
        status:
          entry.status === "FAILED" || entry.status === "RETRYING" || entry.status === "QUEUED"
            ? entry.status
            : "QUEUED",
      }));
  } catch {
    return [];
  }
}

function readQueue() {
  if (!isBrowser()) return [];
  return parse(window.localStorage.getItem(POS_QUEUE_KEY));
}

function writeQueue(queue: PosQueuedSale[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(POS_QUEUE_KEY, JSON.stringify(queue));
}

export function loadQueuedPosSales(): PosQueuedSale[] {
  return readQueue();
}

export function queuePosSale(payload: PosSaleQueuePayload): PosQueuedSale {
  const queue = readQueue();
  const existing = queue.find((entry) => entry.payload.saleNo === payload.saleNo);
  if (existing) return existing;
  const next: PosQueuedSale = {
    id: makeQueueId(),
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    status: "QUEUED",
    payload,
  };
  writeQueue([...queue, next]);
  return next;
}

export function removeQueuedPosSale(id: string) {
  const queue = readQueue();
  writeQueue(queue.filter((entry) => entry.id !== id));
}

export function bumpQueuedPosSaleRetry(id: string) {
  const queue = readQueue();
  writeQueue(
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            retryCount: entry.retryCount + 1,
            status: "RETRYING",
            lastAttemptAt: new Date().toISOString(),
          }
        : entry,
    ),
  );
}

export function failQueuedPosSale(id: string, message: string) {
  const queue = readQueue();
  writeQueue(
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "FAILED",
            lastAttemptAt: new Date().toISOString(),
            lastError: message.slice(0, 220),
          }
        : entry,
    ),
  );
}

export function markQueuedPosSaleQueued(id: string) {
  const queue = readQueue();
  writeQueue(
    queue.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            status: "QUEUED",
            lastError: undefined,
          }
        : entry,
    ),
  );
}
