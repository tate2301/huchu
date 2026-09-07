// Shared types for the import-detail wizard. Keeping these in one file so
// the table, anomaly panel, and the page itself agree on shapes.

export type LedgerEntry = {
  id: string;
  lineNo: number;
  parsedDate: string | null;
  parsedName: string | null;
  mappedShiftGroupId: string | null;
  gramsTotal: number | null;
  expensesJson: string | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
  status: "PENDING" | "CREATED" | "ANOMALY" | "FAILED";
  goldShiftAllocationId: string | null;
  goldPourId: string | null;
  buyerReceiptId: string | null;
  errorMessage: string | null;
  parserWarning: string | null;
  shiftGroup: { id: string; name: string } | null;
};

export type ExpenseBreakdown = Array<{ type: string; weight: number }>;

export type AnomalySeverity = "INFO" | "WARN" | "CRITICAL";

export type AnomalyCode =
  | "MISSING_DATE"
  | "MISSING_NAME"
  | "EMPTY_ROW"
  | "SPLIT_MISMATCH"
  | "OVERSELL"
  | "NEGATIVE_SHARE"
  | "FUTURE_DATE"
  | "UNKNOWN_EXPENSE_TYPE"
  | "DUPLICATE_DATE_LEADER"
  | "UNMAPPED_LEADER"
  | "FAILED_PARSE";

export type Anomaly = {
  entryId: string;
  code: AnomalyCode;
  severity: AnomalySeverity;
  message: string;
  suggestedFix?: string | null;
};

export type DryRunSummary = {
  anomalies: Anomaly[];
  countsBySeverity: Record<AnomalySeverity, number>;
  countsByCode: Record<AnomalyCode, number>;
};

export type CommitSummary = {
  rowsCreated: number;
  rowsSkipped: number;
  rowsAnomaly: number;
  rowsFailed: number;
  allocationsCreated: number;
  poursCreated: number;
  salesCreated: number;
  totalSaleGrams: number;
  totalDeficitGrams: number;
};

export type ImportDetail = {
  id: string;
  fileName: string;
  status: "DRAFT" | "MAPPING" | "PREVIEW" | "COMMITTED" | "FAILED" | "ROLLED_BACK";
  siteId: string | null;
  mappingsJson: string | null;
  rowsTotal: number;
  rowsCreated: number;
  rowsAnomaly: number;
  rowsFailed: number;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
  site: { id: string; name: string; code: string } | null;
  entries: LedgerEntry[];
  summary?: CommitSummary;
};

export const KNOWN_EXPENSE_TYPES = ["Diesel", "Shoots", "LCD"] as const;

export function parseExpenses(json: string | null): ExpenseBreakdown {
  if (!json) return [];
  try {
    const arr = JSON.parse(json) as ExpenseBreakdown;
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function expenseWeightFor(
  type: string,
  list: ExpenseBreakdown,
): number | null {
  const match = list.find((e) => e.type.toLowerCase() === type.toLowerCase());
  return match ? match.weight : null;
}

export const ANOMALY_LABEL: Record<AnomalyCode, string> = {
  MISSING_DATE: "Missing date",
  MISSING_NAME: "Missing leader",
  EMPTY_ROW: "Empty row",
  SPLIT_MISMATCH: "Split mismatch",
  OVERSELL: "Inventory oversell",
  NEGATIVE_SHARE: "Negative share",
  FUTURE_DATE: "Future-dated",
  UNKNOWN_EXPENSE_TYPE: "Unknown expense type",
  DUPLICATE_DATE_LEADER: "Duplicate date+leader",
  UNMAPPED_LEADER: "Unmapped leader",
  FAILED_PARSE: "Parse warning",
};
