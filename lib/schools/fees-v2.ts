import { fetchJson } from "@/lib/api-client";

type QueryValue = string | number | boolean | null | undefined;

function buildQuery(params: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasMore: boolean;
};

type PaginationResponse<T> = {
  data: T[];
  pagination: PaginationMeta;
};

type ApiResponse<T> = {
  success?: true;
  data: T;
};

export type SchoolsFeesSummary = {
  resource: "schools-fees";
  companyId: string;
  summary: {
    structures: number;
    activeStructures: number;
    invoices: number;
    issuedInvoices: number;
    overdueInvoices: number;
    receiptsPosted: number;
    /** The currency the money figures below are stated in (S-2.2). */
    currency: string;
    waivedAmount: number;
    outstandingBalance: number;
    /** S-2.5. Overpayments and over-settled invoices, net of refunds held. */
    creditOnAccount: number;
  };
};

export type SchoolFeeStructureRecord = {
  id: string;
  name: string;
  currency: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  term: { id: string; code: string; name: string };
  class: { id: string; code: string; name: string };
  _count: { lines: number; invoices: number };
  totals?: { amount: number; mandatoryAmount: number };
  lines?: Array<{
    id: string;
    feeCode: string;
    description: string;
    amount: number;
    isMandatory: boolean;
    sortOrder: number;
  }>;
};

export type SchoolFeeInvoiceRecord = {
  id: string;
  invoiceNo: string;
  status: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "VOIDED" | "WRITEOFF";
  issueDate: string;
  dueDate: string;
  currency: string;
  exchangeRate: number;
  baseAmount: number;
  totalAmount: number;
  paidAmount: number;
  waivedAmount: number;
  writeOffAmount: number;
  balanceAmount: number;
  /** S-2.5. Settled beyond the total — the mirror of `balanceAmount`. */
  creditAmount: number;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
    status: string;
  };
  term: { id: string; code: string; name: string };
  _count: { lines: number; receiptAllocations: number; waivers: number };
};

export type SchoolFeeReceiptRecord = {
  id: string;
  receiptNo: string;
  receiptDate: string;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY";
  reference: string | null;
  currency: string;
  exchangeRate: number;
  baseAmount: number;
  amountReceived: number;
  amountAllocated: number;
  amountUnallocated: number;
  /** S-2.6. The part of the surplus a refund is already holding. */
  refundedAmount: number;
  status: "DRAFT" | "POSTED" | "VOIDED";
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
  /**
   * S-2.7. Null on a school without the ZIMRA add-on, and null on a receipt
   * that has not reached the revenue authority yet — which is the case the
   * ledger has to be able to show, because a bursar cannot re-send what they
   * cannot see has failed.
   */
  fiscalReceipt: {
    id: string;
    status: string;
    fiscalNumber: string | null;
  } | null;
  _count: { allocations: number };
};

export type SchoolFeeWaiverRecord = {
  id: string;
  waiverType: "SCHOLARSHIP" | "DISCOUNT" | "HARDSHIP" | "OTHER";
  currency: string;
  exchangeRate: number;
  baseAmount: number;
  amount: number;
  status: "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED" | "REVERSED";
  reason: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
  term: { id: string; code: string; name: string };
  invoice: {
    id: string;
    invoiceNo: string;
    status: string;
    balanceAmount: number;
  } | null;
  createdAt: string;
};

export async function fetchSchoolsFeesSummary() {
  const response = await fetchJson<ApiResponse<SchoolsFeesSummary>>("/api/v2/schools/fees");
  return response.data;
}

export async function fetchSchoolFeeStructures(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
  termId?: string;
  classId?: string;
  includeLines?: boolean;
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeStructureRecord>>(
    `/api/v2/schools/fees/structures${query}`,
  );
}

export async function fetchSchoolFeeInvoices(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  /** Filtered through the student's current class — see the route's note. */
  classId?: string;
  streamId?: string;
  termId?: string;
  status?: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "VOIDED" | "WRITEOFF";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeInvoiceRecord>>(
    `/api/v2/schools/fees/invoices${query}`,
  );
}

export async function bulkGenerateInvoices(params: {
  termId: string;
  classId?: string;
  streamId?: string;
  feeStructureId: string;
  issueDate: string;
  dueDate: string;
  issueNow?: boolean;
  notes?: string;
  /** S-2.4. Defaults to true server-side; pass false to be told about clashes. */
  skipExisting?: boolean;
}) {
  return fetchJson<{
    success: boolean;
    data: {
      success: true;
      message: string;
      created: number;
      skipped: number;
      errors: Array<{ studentId: string; studentNo: string; error: string }>;
      summary: {
        totalEligible: number;
        feeStructure: {
          id: string;
          name: string;
          class: string;
          term: string;
        };
      };
    };
  }>("/api/v2/schools/fees/invoices/bulk-generate", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function fetchSchoolFeeReceipts(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  /** Filtered through the pupil's current class — see the route's note. */
  classId?: string;
  /** Inclusive receipt-date window, both `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  status?: "DRAFT" | "POSTED" | "VOIDED";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeReceiptRecord>>(
    `/api/v2/schools/fees/receipts${query}`,
  );
}

export async function fetchSchoolFeeWaivers(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  /** Filtered through the pupil's current class. */
  classId?: string;
  termId?: string;
  status?: "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED" | "REVERSED";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeWaiverRecord>>(
    `/api/v2/schools/fees/waivers${query}`,
  );
}

/**
 * S-2.5 — a credit the school is holding for a family.
 *
 * Two kinds, and the distinction matters when you go to spend it: a `RECEIPT`
 * credit is a payment larger than what it settled, an `INVOICE` credit is a
 * bill settled beyond its total.
 */
export type SchoolFeeCreditRecord = {
  kind: "RECEIPT" | "INVOICE";
  sourceId: string;
  reference: string;
  date: string;
  currency: string;
  credit: number;
  heldForRefund: number;
  available: number;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
};

export type SchoolFeeRefundRecord = {
  id: string;
  refundNo: string;
  refundDate: string;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY";
  reference: string | null;
  reason: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  baseAmount: number;
  status: "REQUESTED" | "PAID" | "CANCELLED";
  paidAt: string | null;
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
  receipt: { id: string; receiptNo: string } | null;
  invoice: { id: string; invoiceNo: string } | null;
};

export async function fetchSchoolFeeCredits(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  /** Filtered through the pupil's current class. */
  classId?: string;
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeCreditRecord>>(
    `/api/v2/schools/fees/credits${query}`,
  );
}

export async function fetchSchoolFeeRefunds(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
  /** Filtered through the pupil's current class. */
  classId?: string;
  status?: "REQUESTED" | "PAID" | "CANCELLED";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeRefundRecord>>(
    `/api/v2/schools/finance/refunds${query}`,
  );
}

/**
 * Spend a receipt's credit on invoices.
 *
 * Omit `allocatedAmount` on every line to let the credit settle them oldest
 * first until it runs out; give it on every line to split deliberately. Mixing
 * the two is refused.
 */
export async function allocateReceiptCredit(
  receiptId: string,
  allocations: Array<{ invoiceId: string; allocatedAmount?: number }>,
) {
  return fetchJson<SchoolFeeReceiptRecord>(
    `/api/v2/schools/fees/receipts/${receiptId}/allocate`,
    { method: "POST", body: JSON.stringify({ allocations }) },
  );
}

export async function requestSchoolFeeRefund(params: {
  receiptId?: string;
  invoiceId?: string;
  amount: number;
  method: "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY";
  reason: string;
  reference?: string;
  refundDate?: string;
}) {
  return fetchJson<SchoolFeeRefundRecord>("/api/v2/schools/finance/refunds", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function paySchoolFeeRefund(
  refundId: string,
  params: { reference?: string } = {},
) {
  return fetchJson<SchoolFeeRefundRecord>(
    `/api/v2/schools/finance/refunds/${refundId}/pay`,
    { method: "POST", body: JSON.stringify(params) },
  );
}

export async function cancelSchoolFeeRefund(refundId: string, reason: string) {
  return fetchJson<SchoolFeeRefundRecord>(
    `/api/v2/schools/finance/refunds/${refundId}/cancel`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

/* ── the verbs ───────────────────────────────────────────────────────────
 *
 * Every endpoint below existed before any of these functions did. The ledger
 * could raise an invoice and take a receipt; it could not issue, write off,
 * void, fiscalise, approve, reject, reverse, edit or discard anything, so nine
 * routes and four of the five waiver states were unreachable from the product.
 * These are the client halves.
 */

/** A bill for one pupil. Lands as a draft unless `issueNow`. */
export async function createSchoolFeeInvoice(params: {
  studentId: string;
  termId: string;
  description?: string;
  amount: number;
  issueDate?: string;
  dueDate?: string;
  notes?: string;
  issueNow?: boolean;
}) {
  return fetchJson<ApiResponse<SchoolFeeInvoiceRecord>>("/api/v2/schools/fees/invoices", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function updateSchoolFeeInvoice(
  invoiceId: string,
  params: {
    issueDate?: string;
    dueDate?: string;
    description?: string;
    amount?: number;
    notes?: string | null;
  },
) {
  return fetchJson<ApiResponse<SchoolFeeInvoiceRecord>>(
    `/api/v2/schools/fees/invoices/${invoiceId}`,
    { method: "PATCH", body: JSON.stringify(params) },
  );
}

/** Drafts only. An issued bill is withdrawn with a write-off, never deleted. */
export async function discardSchoolFeeInvoice(invoiceId: string) {
  return fetchJson<ApiResponse<{ id: string; deleted: true }>>(
    `/api/v2/schools/fees/invoices/${invoiceId}`,
    { method: "DELETE" },
  );
}

/** Draft → issued: the moment the bill becomes a demand on a family. */
export async function issueSchoolFeeInvoice(invoiceId: string, issueDate?: string) {
  return fetchJson<ApiResponse<SchoolFeeInvoiceRecord>>(
    `/api/v2/schools/fees/invoices/${invoiceId}/issue`,
    { method: "POST", body: JSON.stringify(issueDate ? { issueDate } : {}) },
  );
}

/** Giving up on the money. The reason is required and reaches the audit trail. */
export async function writeOffSchoolFeeInvoice(invoiceId: string, reason: string) {
  return fetchJson<ApiResponse<SchoolFeeInvoiceRecord>>(
    `/api/v2/schools/fees/invoices/${invoiceId}/write-off`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export async function createSchoolFeeReceipt(params: {
  invoiceId?: string;
  studentId?: string;
  amount: number;
  method: string;
  reference?: string;
  receiptDate?: string;
}) {
  return fetchJson<ApiResponse<SchoolFeeReceiptRecord>>("/api/v2/schools/fees/receipts", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/** Unwinds the payment and every allocation it made. Irreversible. */
export async function voidSchoolFeeReceipt(receiptId: string, reason: string) {
  return fetchJson<ApiResponse<SchoolFeeReceiptRecord>>(
    `/api/v2/schools/fees/receipts/${receiptId}/void`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export type SchoolFiscalisationStatus = {
  receiptId: string;
  receiptNo: string;
  receiptStatus: string;
  /** False on a school without the ZIMRA add-on. */
  enabled: boolean;
  ready: boolean;
  blockedBy: string | null;
  missing: string[];
  fiscalReceipt: {
    id: string;
    status: string;
    fiscalNumber: string | null;
    providerReference: string | null;
    lastError: string | null;
    attemptCount: number;
  } | null;
};

/** Why a receipt has not reached ZIMRA, without sending anything. */
export async function fetchSchoolFeeReceiptFiscalisation(receiptId: string) {
  const response = await fetchJson<ApiResponse<SchoolFiscalisationStatus>>(
    `/api/v2/schools/fees/receipts/${receiptId}/fiscalise`,
  );
  return response.data;
}

/** Send it. The fiscal number comes back on the response when it lands. */
export async function fiscaliseSchoolFeeReceipt(receiptId: string) {
  return fetchJson<
    ApiResponse<{
      fiscalStatus: string;
      fiscalNumber: string | null;
      providerReference: string | null;
    }>
  >(`/api/v2/schools/fees/receipts/${receiptId}/fiscalise`, { method: "POST" });
}

export type FeeStructureLineInput = {
  feeCode: string;
  description: string;
  amount: number;
  isMandatory?: boolean;
  sortOrder?: number;
};

export async function createSchoolFeeStructure(params: {
  name: string;
  termId: string;
  classId: string;
  currency?: string;
  status?: "DRAFT" | "ACTIVE";
  notes?: string | null;
  lines: FeeStructureLineInput[];
}) {
  return fetchJson<ApiResponse<SchoolFeeStructureRecord>>(
    "/api/v2/schools/fees/structures",
    { method: "POST", body: JSON.stringify(params) },
  );
}

/**
 * Rename, reprice, activate a draft, or archive.
 *
 * `lines` replaces the sheet wholesale — a caller that sends five where there
 * were six is saying the sixth is gone.
 */
export async function updateSchoolFeeStructure(
  structureId: string,
  params: {
    name?: string;
    currency?: string;
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
    notes?: string | null;
    lines?: FeeStructureLineInput[];
  },
) {
  return fetchJson<ApiResponse<SchoolFeeStructureRecord>>(
    `/api/v2/schools/fees/structures/${structureId}`,
    { method: "PATCH", body: JSON.stringify(params) },
  );
}

/** Refused once invoices quote the sheet; archive it instead. */
export async function deleteSchoolFeeStructure(structureId: string) {
  return fetchJson<ApiResponse<{ id: string; deleted: true }>>(
    `/api/v2/schools/fees/structures/${structureId}`,
    { method: "DELETE" },
  );
}

export async function createSchoolFeeWaiver(params: {
  studentId: string;
  termId: string;
  invoiceId?: string | null;
  waiverType: SchoolFeeWaiverRecord["waiverType"];
  amount: number;
  reason?: string | null;
  status?: "DRAFT" | "APPROVED";
}) {
  return fetchJson<ApiResponse<SchoolFeeWaiverRecord>>("/api/v2/schools/fees/waivers", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

/**
 * Re-type a draft, or move a waiver along: APPROVED, REJECTED, REVERSED.
 *
 * APPLIED is not here on purpose — that is `applySchoolFeeWaiver`, which has
 * to pick the invoice and refresh the bill.
 */
export async function updateSchoolFeeWaiver(
  waiverId: string,
  params: {
    waiverType?: SchoolFeeWaiverRecord["waiverType"];
    amount?: number;
    invoiceId?: string | null;
    reason?: string | null;
    status?: "APPROVED" | "REJECTED" | "REVERSED";
  },
) {
  return fetchJson<ApiResponse<SchoolFeeWaiverRecord>>(
    `/api/v2/schools/fees/waivers/${waiverId}`,
    { method: "PATCH", body: JSON.stringify(params) },
  );
}

/** Drafts only. A decided waiver is rejected or reversed, so it stays on file. */
export async function discardSchoolFeeWaiver(waiverId: string) {
  return fetchJson<ApiResponse<{ id: string; deleted: true }>>(
    `/api/v2/schools/fees/waivers/${waiverId}`,
    { method: "DELETE" },
  );
}

/** Takes the discount off a bill. Picks the oldest unpaid one when none is named. */
export async function applySchoolFeeWaiver(
  waiverId: string,
  params: { invoiceId?: string; reason?: string } = {},
) {
  return fetchJson<ApiResponse<SchoolFeeWaiverRecord>>(
    `/api/v2/schools/fees/waivers/${waiverId}/apply`,
    { method: "POST", body: JSON.stringify(params) },
  );
}
