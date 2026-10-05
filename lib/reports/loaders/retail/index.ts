import { FLOOR_LOADERS } from "@/lib/reports/loaders/retail/floor";
import { PRODUCT_LOADERS } from "@/lib/reports/loaders/retail/products";
import { SHIFT_RECORD_LOADERS } from "@/lib/reports/loaders/retail/shift-record";
import type { ReportLoader } from "@/lib/reports/types";

/** Retail's loaders, one file per area, paired by key with `definitions/retail`. */
export const RETAIL_LOADERS: Record<string, ReportLoader> = { ...FLOOR_LOADERS, ...SHIFT_RECORD_LOADERS, ...PRODUCT_LOADERS };
