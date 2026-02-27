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
    waivedAmount: number;
    outstandingBalance: number;
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
  totalAmount: number;
  paidAmount: number;
  waivedAmount: number;
  writeOffAmount: number;
  balanceAmount: number;
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
  amountReceived: number;
  amountAllocated: number;
  amountUnallocated: number;
  status: "DRAFT" | "POSTED" | "VOIDED";
  student: {
    id: string;
    studentNo: string;
    firstName: string;
    lastName: string;
  };
  _count: { allocations: number };
};

export type SchoolFeeWaiverRecord = {
  id: string;
  waiverType: "SCHOLARSHIP" | "DISCOUNT" | "HARDSHIP" | "OTHER";
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
  termId?: string;
  status?: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "VOIDED" | "WRITEOFF";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeInvoiceRecord>>(
    `/api/v2/schools/fees/invoices${query}`,
  );
}

export async function fetchSchoolFeeReceipts(params: {
  page?: number;
  limit?: number;
  search?: string;
  studentId?: string;
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
  termId?: string;
  status?: "DRAFT" | "APPROVED" | "APPLIED" | "REJECTED" | "REVERSED";
} = {}) {
  const query = buildQuery(params);
  return fetchJson<PaginationResponse<SchoolFeeWaiverRecord>>(
    `/api/v2/schools/fees/waivers${query}`,
  );
}
