import { prisma } from "@/lib/prisma";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";

import type { NavBadgeProvider } from "./types";

/**
 * The floor's figures. Shifts: the drawers open right now ("2 open"). Whoever
 * cashes up sees every till; a cashier sees their own open shift.
 */
export const SHIFTS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/shifts",
  requires: [
    ["retail.cash-control", "view"],
    ["retail.sell", "open-shift"],
  ],
  count: ({ companyId, userId, role }) =>
    prisma.retailShift.count({
      where: {
        companyId,
        status: "OPEN",
        ...(canRetailRoleDo(role, "retail.cash-control", "view") ? {} : { cashierId: userId }),
      },
    }),
  label: (count) => `${count} open`,
};

/** Lay-bys: how many are still being paid, at any site ("3"). */
export const LAYBYS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/laybys",
  requires: [["retail.laybys", "view"]],
  count: ({ companyId }) => prisma.retailLayby.count({ where: { companyId, status: "PAYING" } }),
  label: (count) => String(count),
};

export const FLOOR_NAV_BADGES: readonly NavBadgeProvider[] = [SHIFTS_NAV_BADGE, LAYBYS_NAV_BADGE];
