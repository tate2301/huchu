import { fetchJson } from "@/lib/api-client";
import type { ReportsHomeData } from "@/lib/reports/all";

/** The query every Reports page shares: one answer for the catalogue. */
export const REPORTS_HOME_KEY = ["reports", "catalog"] as const;

export function fetchReportsHome() {
  return fetchJson<ReportsHomeData>("/api/v2/reports");
}
