import type { SheetKind } from "@/lib/workspace/sheet-kind";

import { BUNDLE_SHEETS } from "./bundles";
import { BUYING_SHEETS } from "./buying";
import { ORDER_SHEETS } from "./orders";
import { CUSTOMER_SHEETS } from "./customers";
import { FLOOR_SHEETS } from "./floor";
import { LAYBY_SHEETS } from "./laybys";
import { PEOPLE_SHEETS } from "./people";
import { PRICE_SHEETS } from "./prices";
import { PRODUCT_SHEETS } from "./products";
import { PROMOTION_SHEETS } from "./promotions";
import { REQUISITION_SHEETS } from "./requisitions";
import { SETUP_SHEETS } from "./setup";
import { STOCK_SHEETS } from "./stock";
import { STOCK_ADJUST_SHEETS } from "./stock-adjust";
import { STOCK_COUNT_SHEETS } from "./stock-count";
import { TILL_SHEETS } from "./tills";
import { VOUCHER_SHEETS } from "./vouchers";

/**
 * Every sheet kind, by the `?sheet=` key that opens it (00-foundations 5.7.6).
 * Each area adds its kinds in its own file and one line here.
 */
export const SHEET_KINDS: Readonly<Record<string, SheetKind>> = {
  ...FLOOR_SHEETS,
  ...LAYBY_SHEETS,
  ...PRODUCT_SHEETS,
  ...PRICE_SHEETS,
  ...BUNDLE_SHEETS,
  ...PROMOTION_SHEETS,
  ...VOUCHER_SHEETS,
  ...SETUP_SHEETS,
  ...STOCK_SHEETS,
  ...STOCK_ADJUST_SHEETS,
  ...STOCK_COUNT_SHEETS,
  ...TILL_SHEETS,
  ...PEOPLE_SHEETS,
  ...BUYING_SHEETS,
  ...ORDER_SHEETS,
  ...REQUISITION_SHEETS,
  ...CUSTOMER_SHEETS,
};
