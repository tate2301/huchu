import { CRM_LOADERS } from "@/lib/reports/loaders/crm";
import { OPERATIONS_LOADERS } from "@/lib/reports/loaders/operations";
import { PEOPLE_LOADERS } from "@/lib/reports/loaders/people";
import { RETAIL_LOADERS } from "@/lib/reports/loaders/retail";
import { SCHOOL_LOADERS } from "@/lib/reports/loaders/schools";
import { getReportDefinition } from "@/lib/reports/registry";
import type { ReportDefinition, ReportLoader } from "@/lib/reports/types";

const LOADERS: Record<string, ReportLoader> = {
  ...OPERATIONS_LOADERS,
  ...SCHOOL_LOADERS,
  ...RETAIL_LOADERS,
  ...CRM_LOADERS,
  ...PEOPLE_LOADERS,
};

/** A report with the query behind it. Null for a key nobody defined. */
export function getReport(key: string): { definition: ReportDefinition; loader: ReportLoader } | null {
  const definition = getReportDefinition(key);
  const loader = LOADERS[key];
  return definition && loader ? { definition, loader } : null;
}

/** Keys defined without a loader, or loaded without a definition. For the test. */
export function unpairedReportKeys(definitions: readonly ReportDefinition[]): string[] {
  const defined = new Set(definitions.map((definition) => definition.key));
  return [
    ...definitions.filter((definition) => !LOADERS[definition.key]).map((definition) => definition.key),
    ...Object.keys(LOADERS).filter((key) => !defined.has(key)),
  ];
}
