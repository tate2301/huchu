import { CATEGORY_REPORTS } from "@/lib/reports/definitions/retail/categories";
import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { PRODUCT_REPORTS } from "@/lib/reports/definitions/retail/products";
import { SHIFT_RECORD_REPORTS } from "@/lib/reports/definitions/retail/shift-record";
import type { ReportDefinition } from "@/lib/reports/types";

/** Retail's report sources, one file per area so area units add a line here and nothing else. */
export const RETAIL_REPORTS: ReportDefinition[] = [...FLOOR_REPORTS, ...SHIFT_RECORD_REPORTS, ...PRODUCT_REPORTS, ...CATEGORY_REPORTS];
