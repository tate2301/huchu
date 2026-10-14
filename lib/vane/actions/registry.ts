import { BOOKS_ACTIONS } from "./books";
import { CRM_ACTIONS } from "./crm";
import { REPORTS_ACTIONS } from "./reports";
import { RETAIL_ACTIONS } from "./retail";
import { SCHOOLS_ACTIONS } from "./schools";
import type { VaneActionKind } from "./types";
import { VANE_OWN_ACTIONS } from "./vane";

/**
 * Everything Vane can do once a person approves it, by module. A new action
 * is a `VaneActionKind` in its module's file, listed here; Claude is shown
 * each one's description and inputs (`lib/vane/tools.ts`).
 */
export const VANE_ACTIONS: readonly VaneActionKind<never>[] = [
  ...BOOKS_ACTIONS,
  ...CRM_ACTIONS,
  ...RETAIL_ACTIONS,
  ...REPORTS_ACTIONS,
  ...SCHOOLS_ACTIONS,
  ...VANE_OWN_ACTIONS,
] as unknown as readonly VaneActionKind<never>[];
