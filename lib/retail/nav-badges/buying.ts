import { prisma } from "@/lib/prisma";

import type { NavBadgeProvider } from "./types";

/** Buying's figures. Orders: those sent or part delivered, not in the bin ("3 open"). */
export const ORDERS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/buying/orders",
  requires: [["retail.purchasing", "view"]],
  count: ({ companyId }) => prisma.retailPurchaseOrder.count({ where: { companyId, archivedAt: null, status: { in: ["SENT", "PARTIAL"] } } }),
  label: (count) => `${count} open`,
};

export const BUYING_NAV_BADGES: readonly NavBadgeProvider[] = [ORDERS_NAV_BADGE];
