import { registeredExtensions } from "@/extensions";
import { mergeReports } from "@/lib/extensions/registry";
import { BOOKS_REPORTS } from "@/lib/reports/definitions/books";
import { CRM_REPORTS } from "@/lib/reports/definitions/crm";
import { OPERATIONS_REPORTS } from "@/lib/reports/definitions/operations";
import { PEOPLE_REPORTS } from "@/lib/reports/definitions/people";
import { RETAIL_REPORTS } from "@/lib/reports/definitions/retail";
import { SCHOOL_REPORTS } from "@/lib/reports/definitions/schools";
import type { ReportDefinition } from "@/lib/reports/types";

/**
 * Every report there is, as definitions only — no queries — so the navigation
 * and the browser can ask which reports exist. Areas are listed in this order
 * when none of them is the workspace's own. Registered extensions' reports
 * come last (`extensions/index.ts`).
 */
export const REPORT_DEFINITIONS: readonly ReportDefinition[] = mergeReports([
  ...OPERATIONS_REPORTS,
  ...SCHOOL_REPORTS,
  ...RETAIL_REPORTS,
  ...CRM_REPORTS,
  ...PEOPLE_REPORTS,
  ...BOOKS_REPORTS,
], registeredExtensions);

const byKey = new Map(REPORT_DEFINITIONS.map((definition) => [definition.key, definition]));

export function getReportDefinition(key: string): ReportDefinition | null {
  return byKey.get(key) ?? null;
}
