import { prisma } from "@/lib/prisma";
import { decidableRequisitions } from "@/lib/retail/buying/waiting";

import type { NavBadgeProvider } from "./types";

/** Buying's figures. Orders: those sent or part delivered, not in the bin ("3 open"). */
export const ORDERS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/buying/orders",
  requires: [["retail.purchasing", "view"]],
  count: ({ companyId }) => prisma.retailPurchaseOrder.count({ where: { companyId, archivedAt: null, status: { in: ["SENT", "PARTIAL"] } } }),
  label: (count) => `${count} open`,
};

/** Requisitions: those this person may decide now ("2 to approve"); approvers only. */
export const REQUISITIONS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/buying/requisitions",
  requires: [["retail.requisitions", "approve"]],
  count: async ({ companyId, userId, role }) => (await decidableRequisitions({ companyId, userId, role })).length,
  label: (count) => `${count} to approve`,
};

export const BUYING_NAV_BADGES: readonly NavBadgeProvider[] = [ORDERS_NAV_BADGE, REQUISITIONS_NAV_BADGE];
