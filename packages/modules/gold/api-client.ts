/** The gold screens' client: what the browser asks of `/api/gold`, `/api/settlements` and `/api/dashboard`. */
import { buildQuery, fetchJson, type Pagination } from "@corelithzw/platform/api-client";
import type { Site } from "@corelithzw/platform/client/sites";

export type GoldPour = {
  id: string;
  batchId?: string;
  batchCode?: string;
  pourBarId: string;
  pourDate: string;
  sourceType?: "PRODUCTION" | "PURCHASE_PUBLIC";
  createdAt: string;
  grossWeight: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  valueUsd?: number | null;
  estimatedPurity?: number | null;
  storageLocation: string;
  shiftLeaderName?: string | null;
  expenseWeightTotal?: number | null;
  workerSplitWeight?: number | null;
  companySplitWeight?: number | null;
  companyTotalWeight?: number | null;
  expenseBreakdown?: string | null;
  createdBy?: { id: string; name: string } | null;
  goldShiftAllocation?: {
    id: string;
    totalWeight: number;
    netWeight: number;
    workerShareWeight: number;
    companyShareWeight: number;
    expenses: Array<{ id: string; type: string; weight: number }>;
    shiftReport?: {
      id: string;
      groupLeader?: { name: string } | null;
    } | null;
  } | null;
  site: { name: string; code: string };
  witness1?: { name: string } | null;
  witness2?: { name: string } | null;
};

export type GoldDispatchBatchEntry = {
  id: string;
  goldPourId: string;
  sortOrder: number;
  batchId?: string;
  batchCode?: string;
  goldPour: {
    id: string;
    batchId?: string;
    batchCode?: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
};

export type GoldDispatch = {
  id: string;
  batchId?: string;
  batchCode?: string;
  goldPourId: string;
  dispatchDate: string;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  valueUsd?: number | null;
  courier: string;
  vehicle?: string | null;
  destination: string;
  sealNumbers: string;
  handedOverBy?: { name: string } | null;
  receivedBy?: string | null;
  notes?: string | null;
  warnings?: string[];
  goldPour: {
    id?: string;
    batchId?: string;
    batchCode?: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
  batches?: GoldDispatchBatchEntry[];
};

export type BuyerReceipt = {
  id: string;
  goldDispatchId?: string | null;
  goldPourId?: string | null;
  receiptNumber: string;
  receiptDate: string;
  assayResult?: number | null;
  paidAmount: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  goldPour: {
    id?: string;
    batchId?: string;
    batchCode?: string;
    createdAt?: string;
    pourBarId: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    pourDate: string;
    shiftLeaderName?: string | null;
    expenseWeightTotal?: number | null;
    workerSplitWeight?: number | null;
    companySplitWeight?: number | null;
    companyTotalWeight?: number | null;
    createdBy?: { id: string; name: string } | null;
    site: { name: string; code: string };
  };
  goldDispatch?: {
    id: string;
    batchId?: string;
    batchCode?: string;
    dispatchDate: string;
    courier: string;
    goldPour: {
      id?: string;
      batchId?: string;
      batchCode?: string;
      createdAt?: string;
      pourBarId: string;
      grossWeight: number;
      goldPriceUsdPerGram?: number | null;
      valueUsd?: number | null;
      pourDate: string;
      shiftLeaderName?: string | null;
      expenseWeightTotal?: number | null;
      workerSplitWeight?: number | null;
      companySplitWeight?: number | null;
      companyTotalWeight?: number | null;
      createdBy?: { id: string; name: string } | null;
      site: { name: string; code: string };
    };
  } | null;
};

export type GoldPurchase = {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  sellerType: "EMPLOYEE" | "EXTERNAL";
  sellerName: string;
  sellerPhone: string;
  grossWeight: number;
  estimatedPurity?: number | null;
  storageLocation: string;
  paidAmount: number;
  currency: string;
  paymentMethod: string;
  paymentChannel?: string | null;
  paymentReference?: string | null;
  notes?: string | null;
  createdAt: string;
  site: { id: string; name: string; code: string };
  sellerEmployee?: { id: string; name: string; employeeId: string } | null;
  receiver1: { id: string; name: string; employeeId: string };
  receiver2: { id: string; name: string; employeeId: string };
  goldPour: {
    id: string;
    pourBarId: string;
    pourDate: string;
    grossWeight: number;
    goldPriceUsdPerGram?: number | null;
    valueUsd?: number | null;
    site: { name: string; code: string };
  };
};

export type GoldShiftAllocationExpense = {
  id: string;
  type: string;
  weight: number;
};

export type GoldShiftAllocationWorkerShare = {
  id: string;
  shareWeight: number;
  shareValueUsd?: number | null;
  employee: { id: string; name: string; employeeId: string };
};

export type GoldShiftAllocation = {
  id: string;
  date: string;
  shift: string;
  siteId: string;
  totalWeight: number;
  netWeight: number;
  splitMode: "DEFAULT_50_50" | "OVERRIDE_WORKER_WEIGHT";
  workerShareOverrideWeight?: number | null;
  splitOverrideReason?: string | null;
  workerShareWeight: number;
  companyShareWeight: number;
  perWorkerWeight: number;
  goldPriceUsdPerGram?: number | null;
  valuationDate?: string | null;
  totalWeightValueUsd?: number | null;
  netWeightValueUsd?: number | null;
  workerShareValueUsd?: number | null;
  companyShareValueUsd?: number | null;
  perWorkerValueUsd?: number | null;
  payCycleWeeks: number;
  workflowStatus: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED";
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdBy?: { id: string; name: string } | null;
  submittedBy?: { id: string; name: string } | null;
  approvedBy?: { id: string; name: string } | null;
  site: { name: string; code: string };
  shiftReport?: { id: string; status: string; crewCount: number } | null;
  expenses: GoldShiftAllocationExpense[];
  workerShares: GoldShiftAllocationWorkerShare[];
  createdBatchId?: string | null;
  createdBatchCode?: string | null;
  payoutRecordsCreated?: number;
  warnings?: string[];
  createdAt: string;
};

export type GoldCorrection = {
  id: string;
  pourId: string;
  entityType: "POUR" | "DISPATCH" | "RECEIPT";
  entityId: string;
  reason: string;
  beforeSnapshot?: unknown;
  afterSnapshot?: unknown;
  createdAt: string;
  createdBy: { id: string; name: string };
  pour: {
    id: string;
    pourBarId: string;
    site: { id: string; name: string; code: string };
  };
};

export type GoldPriceRecord = {
  id: string;
  companyId: string;
  effectiveDate: string;
  priceUsdPerGram: number;
  note?: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

export type GoldExpenseType = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExecutiveRange = "7d" | "30d" | "90d";

export type ExecutiveKpiTone = "neutral" | "positive" | "warning" | "critical";

export type ExecutiveKpiCard = {
  id: string;
  label: string;
  value: number;
  unit?: string;
  valueLabel?: string;
  delta?: number;
  deltaLabel?: string;
  tone?: ExecutiveKpiTone;
  module:
    | "gold"
    | "stores"
    | "finance"
    | "workforce"
    | "operations"
    | "maintenance"
    | "compliance"
    | "reports"
    | "general";
};

export type ExecutiveTrendPoint = {
  date: string;
  value: number;
  comparison?: number;
};

export type ExecutiveCashTrendPoint = {
  date: string;
  inflow: number;
  outflow: number;
  net: number;
};

export type ExecutiveBreakdownPoint = {
  label: string;
  value: number;
};

export type ExecutiveCharts = {
  goldTrend: ExecutiveTrendPoint[];
  cashTrend: ExecutiveCashTrendPoint[];
  throughputTrend: ExecutiveTrendPoint[];
  riskBreakdown: ExecutiveBreakdownPoint[];
};

export type ExecutiveHighlight = {
  id: string;
  title: string;
  description: string;
  value?: number;
  valueLabel?: string;
  unit?: string;
  tone?: ExecutiveKpiTone;
};

export type ExecutiveQuickLink = {
  href: string;
  label: string;
  module:
    | "gold"
    | "stores"
    | "finance"
    | "workforce"
    | "operations"
    | "maintenance"
    | "compliance"
    | "reports"
    | "general";
  priority: number;
  badgeCount?: number;
  badgeLabel?: string;
  isPrimary?: boolean;
  primaryOrder?: number;
};

export type ExecutiveModuleStatus = "healthy" | "watch" | "critical";

export type ExecutiveSummaryMetric = {
  label: string;
  value: number;
  unit?: string;
  valueLabel?: string;
};

export type ExecutiveModuleSummary = {
  module:
    | "finance"
    | "gold"
    | "workforce"
    | "operations"
    | "stores"
    | "maintenance"
    | "compliance"
    | "reports";
  status: ExecutiveModuleStatus;
  primaryMetric: ExecutiveSummaryMetric;
  secondaryMetric?: ExecutiveSummaryMetric;
  tertiaryMetric?: ExecutiveSummaryMetric;
  openExceptions: number;
  trendDelta?: number;
  topExceptionLabel?: string;
  reportHref: string;
};

export type ExecutiveDashboardResponse = {
  generatedAt: string;
  range: ExecutiveRange;
  siteId: string;
  fullView: boolean;
  window: {
    startDate: string;
    endDate: string;
    previousStartDate: string;
    previousEndDate: string;
    days: number;
  };
  sites: Site[];
  kpis: ExecutiveKpiCard[];
  charts: ExecutiveCharts;
  highlights: ExecutiveHighlight[];
  executiveSummary: ExecutiveModuleSummary[];
  quickLinks: ExecutiveQuickLink[];
};

export async function fetchExecutiveDashboardOverview(params: {
  siteId?: string;
  range: ExecutiveRange;
}) {
  const query = buildQuery({
    siteId: params.siteId,
    range: params.range,
  });
  return fetchJson<ExecutiveDashboardResponse>(`/api/dashboard/executive-overview${query}`);
}

export async function fetchGoldPours(
  params: {
    siteId?: string;
    sourceType?: "PRODUCTION" | "PURCHASE_PUBLIC";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPour>>(`/api/gold/pours${query}`);
}

export async function fetchGoldDispatches(
  params: {
    siteId?: string;
    goldPourId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldDispatch>>(`/api/gold/dispatches${query}`);
}

export async function fetchGoldReceipts(
  params: {
    siteId?: string;
    goldDispatchId?: string;
    goldPourId?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<BuyerReceipt>>(`/api/gold/receipts${query}`);
}

export async function fetchGoldPurchases(
  params: {
    siteId?: string;
    sellerType?: "EMPLOYEE" | "EXTERNAL";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPurchase>>(`/api/gold/purchases${query}`);
}

export async function fetchGoldShiftAllocations(
  params: {
    siteId?: string;
    shift?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldShiftAllocation>>(
    `/api/gold/shift-allocations${query}`,
  );
}

export async function fetchGoldCorrections(
  params: {
    siteId?: string;
    pourId?: string;
    entityType?: "POUR" | "DISPATCH" | "RECEIPT";
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldCorrection>>(`/api/gold/corrections${query}`);
}

export async function fetchGoldPrices(
  params: {
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<Pagination<GoldPriceRecord>>(`/api/gold/prices${query}`);
}

export async function createGoldPrice(input: {
  effectiveDate: string;
  priceUsdPerGram: number;
  note?: string;
}) {
  return fetchJson<GoldPriceRecord>("/api/gold/prices", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateGoldPrice(
  id: string,
  input: {
    effectiveDate?: string;
    priceUsdPerGram?: number;
    note?: string | null;
  },
) {
  return fetchJson<GoldPriceRecord>(`/api/gold/prices/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchGoldExpenseTypes(
  params: { active?: boolean | "all"; search?: string } = {},
) {
  const query = buildQuery(params);
  const response = await fetchJson<{ expenseTypes: GoldExpenseType[] }>(
    `/api/gold/expense-types${query}`,
  );
  return response.expenseTypes;
}
