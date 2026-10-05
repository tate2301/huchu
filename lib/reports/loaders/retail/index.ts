import { BIN_LOADERS } from "@/lib/reports/loaders/retail/bin";
import { CATEGORY_LOADERS } from "@/lib/reports/loaders/retail/categories";
import { FLOOR_LOADERS } from "@/lib/reports/loaders/retail/floor";
import { PRODUCT_LOADERS } from "@/lib/reports/loaders/retail/products";
import { SHIFT_RECORD_LOADERS } from "@/lib/reports/loaders/retail/shift-record";
import { STOCK_MOVEMENT_LOADERS } from "@/lib/reports/loaders/retail/stock-movements";
import { STOCK_TRANSFER_LOADERS } from "@/lib/reports/loaders/retail/stock-transfers";
import { SITE_LOADERS } from "@/lib/reports/loaders/retail/sites";
import type { ReportLoader } from "@/lib/reports/types";

/** Retail's loaders, one file per area, paired by key with `definitions/retail`. */
export const RETAIL_LOADERS: Record<string, ReportLoader> = { ...FLOOR_LOADERS, ...SHIFT_RECORD_LOADERS, ...PRODUCT_LOADERS, ...STOCK_MOVEMENT_LOADERS, ...STOCK_TRANSFER_LOADERS, ...CATEGORY_LOADERS, ...BIN_LOADERS, ...SITE_LOADERS };
