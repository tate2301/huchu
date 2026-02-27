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

type ApiResponse<T> = {
  success: true;
  data: T;
};

export type AutosSummaryData = {
  resource: "autos";
  companyId: string;
  summary: {
    leads: number;
    qualifiedLeads: number;
    vehiclesInStock: number;
    vehiclesReserved: number;
    activeDeals: number;
    contractedDeals: number;
    paymentsPosted: number;
    pipelineNetAmount: number;
  };
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasMore: boolean;
  };
};

export type AutosLead = {
  id: string;
  leadNo: string;
  customerName: string;
  phone: string;
  email: string | null;
  source: string;
  vehicleInterest: string | null;
  budgetMin: number | null;
  budgetMax: number | null;
  status: "NEW" | "QUALIFIED" | "NEGOTIATION" | "WON" | "LOST" | "CANCELED";
  assignedTo: { id: string; name: string; email: string } | null;
  _count: { deals: number };
  updatedAt: string;
};

export type AutosVehicle = {
  id: string;
  stockNo: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  listingPrice: number;
  minApprovalPrice: number;
  status: "IN_STOCK" | "RESERVED" | "SOLD" | "DELIVERED";
  _count: { deals: number };
  updatedAt: string;
};

export type AutosDeal = {
  id: string;
  dealNo: string;
  customerName: string;
  customerPhone: string;
  status:
    | "DRAFT"
    | "QUOTED"
    | "RESERVED"
    | "CONTRACTED"
    | "DELIVERY_READY"
    | "DELIVERED"
    | "CANCELED"
    | "VOIDED";
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  reservedUntil: string | null;
  contractedAt: string | null;
  vehicle: {
    id: string;
    stockNo: string;
    vin: string;
    make: string;
    model: string;
    year: number;
    status: string;
  };
  salesperson: { id: string; name: string; email: string };
  _count: { payments: number };
  updatedAt: string;
};

export type AutosPayment = {
  id: string;
  paymentNo: string;
  paymentDate: string;
  paymentMethod: "CASH" | "BANK_TRANSFER" | "CARD" | "MOBILE_MONEY";
  status: "POSTED" | "VOIDED" | "REFUNDED";
  amount: number;
  reference: string | null;
  deal: {
    id: string;
    dealNo: string;
    customerName: string;
    status: string;
    netAmount: number;
    paidAmount: number;
    balanceAmount: number;
  };
  receivedBy: { id: string; name: string; email: string } | null;
};

export async function fetchAutosSummary() {
  const response = await fetchJson<ApiResponse<AutosSummaryData>>("/api/v2/autos");
  return response.data;
}

export async function fetchAutosLeads(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  assignedToId?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<PaginatedResponse<AutosLead>>>(
    `/api/v2/autos/leads${query}`,
  );
  return response.data;
}

export async function fetchAutosInventory(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<PaginatedResponse<AutosVehicle>>>(
    `/api/v2/autos/inventory${query}`,
  );
  return response.data;
}

export async function fetchAutosDeals(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  salespersonId?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<PaginatedResponse<AutosDeal>>>(
    `/api/v2/autos/deals${query}`,
  );
  return response.data;
}

export async function fetchAutosPayments(params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  dealId?: string;
} = {}) {
  const query = buildQuery(params);
  const response = await fetchJson<ApiResponse<PaginatedResponse<AutosPayment>>>(
    `/api/v2/autos/financing${query}`,
  );
  return response.data;
}
