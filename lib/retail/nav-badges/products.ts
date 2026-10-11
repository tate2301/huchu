import { prisma } from "@/lib/prisma";

import type { NavBadgeProvider } from "./types";

/**
 * Products' figures. Promotions: the ones running right now, not paused
 * ("3 on"), by the clock as the till applies them (PRD-09).
 */
export const PROMOTIONS_NAV_BADGE: NavBadgeProvider = {
  href: "/retail/products/promotions",
  requires: [["retail.promotions", "view"]],
  count: ({ companyId }) => {
    const now = new Date();
    return prisma.retailPromotion.count({
      where: {
        companyId,
        archivedAt: null,
        pausedAt: null,
        endedAt: null,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      },
    });
  },
  label: (count) => `${count} on`,
};

export const PRODUCTS_NAV_BADGES: readonly NavBadgeProvider[] = [PROMOTIONS_NAV_BADGE];
