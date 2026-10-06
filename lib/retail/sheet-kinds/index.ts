import type { SheetKind } from "@/lib/workspace/sheet-kind";

import { FLOOR_SHEETS } from "./floor";
import { PEOPLE_SHEETS } from "./people";
import { PRODUCT_SHEETS } from "./products";
import { SETUP_SHEETS } from "./setup";
import { STOCK_SHEETS } from "./stock";
import { TILL_SHEETS } from "./tills";

/**
 * Every sheet kind, by the `?sheet=` key that opens it (00-foundations 5.7.6).
 * Each area adds its kinds in its own file and one line here.
 */
export const SHEET_KINDS: Readonly<Record<string, SheetKind>> = {
  ...FLOOR_SHEETS,
  ...PRODUCT_SHEETS,
  ...SETUP_SHEETS,
  ...STOCK_SHEETS,
  ...TILL_SHEETS,
  ...PEOPLE_SHEETS,
};
