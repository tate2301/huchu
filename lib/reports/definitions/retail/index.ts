import { BIN_REPORTS } from "@/lib/reports/definitions/retail/bin";
import { BUYING_REPORTS } from "@/lib/reports/definitions/retail/buying";
import { CATEGORY_REPORTS } from "@/lib/reports/definitions/retail/categories";
import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { PEOPLE_REPORTS } from "@/lib/reports/definitions/retail/people";
import { PRODUCT_REPORTS } from "@/lib/reports/definitions/retail/products";
import { SHIFT_RECORD_REPORTS } from "@/lib/reports/definitions/retail/shift-record";
import { STOCK_ON_HAND_REPORTS } from "@/lib/reports/definitions/retail/stock-on-hand";
import { STOCK_MOVEMENT_REPORTS } from "@/lib/reports/definitions/retail/stock-movements";
import { STOCK_TRANSFER_REPORTS } from "@/lib/reports/definitions/retail/stock-transfers";
import { STOCK_COUNT_REPORTS } from "@/lib/reports/definitions/retail/stock-counts";
import { SITE_REPORTS } from "@/lib/reports/definitions/retail/sites";
import { TILL_REPORTS } from "@/lib/reports/definitions/retail/tills";
import { REPORT_ONLY_REPORTS } from "@/lib/reports/definitions/retail/reports";
import { REPORT_CATALOG_REPORTS } from "@/lib/reports/definitions/retail/reports-catalog";
import type { ReportDefinition } from "@/lib/reports/types";

/** Retail's report sources, one file per area so area units add a line here and nothing else. */
export const RETAIL_REPORTS: ReportDefinition[] = [...FLOOR_REPORTS, ...SHIFT_RECORD_REPORTS, ...PRODUCT_REPORTS, ...STOCK_ON_HAND_REPORTS, ...STOCK_MOVEMENT_REPORTS, ...STOCK_TRANSFER_REPORTS, ...STOCK_COUNT_REPORTS, ...CATEGORY_REPORTS, ...BIN_REPORTS, ...SITE_REPORTS, ...TILL_REPORTS, ...PEOPLE_REPORTS, ...BUYING_REPORTS, ...REPORT_ONLY_REPORTS, ...REPORT_CATALOG_REPORTS];
