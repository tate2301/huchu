import { countLowLines } from "@/lib/retail/stock/on-hand";

import type { NavBadgeProvider } from "./types";

/**
 * Stock's figures. On hand: the lines running low or out ("5 low"), counted
 * by the helper On hand's list reads, so the badge and its Low and Out tabs
 * agree.
 */
export const ON_HAND_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/stock",
  requires: [["retail.stock", "view"]],
  count: ({ companyId }) => countLowLines(companyId),
  label: (count) => `${count} low`,
};

export const STOCK_NAV_BADGES: readonly NavBadgeProvider[] = [ON_HAND_NAV_BADGE];
