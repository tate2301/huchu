export type PosSalePaymentInput = {
  tenderType: "CASH" | "CARD" | "MOBILE_MONEY" | "TRANSFER" | "VOUCHER";
  amount: number;
  reference?: string;
};

export type PosSaleQueuePayload = {
  saleNo: string;
  shiftId: string;
  siteId: string;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
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
  payload: PosSaleQueuePayload;
};

const POS_QUEUE_KEY = "retail_pos_offline_sales_queue_v1";

function generateQueueId() {
  return `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitize(input: PosQueuedSale[]) {
  return input
    .filter((entry) => Boolean(entry?.id) && Boolean(entry?.payload?.saleNo))
    .map((entry) => ({
      ...entry,
      retryCount: Number.isFinite(entry.retryCount) ? Math.max(0, entry.retryCount) : 0,
    }));
}

export function loadQueuedPosSales(): PosQueuedSale[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(POS_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PosQueuedSale[];
    return sanitize(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
}

function persistQueuedPosSales(queue: PosQueuedSale[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(POS_QUEUE_KEY, JSON.stringify(queue));
}

export function queuePosSale(payload: PosSaleQueuePayload): PosQueuedSale {
  const queue = loadQueuedPosSales();
  const existing = queue.find((entry) => entry.payload.saleNo === payload.saleNo);
  if (existing) return existing;

  const next: PosQueuedSale = {
    id: generateQueueId(),
    queuedAt: new Date().toISOString(),
    retryCount: 0,
    payload,
  };
  persistQueuedPosSales([...queue, next]);
  return next;
}

export function removeQueuedPosSale(id: string) {
  const queue = loadQueuedPosSales();
  persistQueuedPosSales(queue.filter((entry) => entry.id !== id));
}

export function bumpQueuedPosSaleRetry(id: string) {
  const queue = loadQueuedPosSales();
  persistQueuedPosSales(
    queue.map((entry) =>
      entry.id === id ? { ...entry, retryCount: entry.retryCount + 1 } : entry,
    ),
  );
}
