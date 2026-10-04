import { FLOOR_LOADERS } from "@/lib/reports/loaders/retail/floor";
import type { ReportLoader } from "@/lib/reports/types";

/** Retail's loaders, one file per area, paired by key with `definitions/retail`. */
export const RETAIL_LOADERS: Record<string, ReportLoader> = { ...FLOOR_LOADERS };
