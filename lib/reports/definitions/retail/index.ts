import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import type { ReportDefinition } from "@/lib/reports/types";

/** Retail's report sources, one file per area so area units add a line here and nothing else. */
export const RETAIL_REPORTS: ReportDefinition[] = [...FLOOR_REPORTS];
