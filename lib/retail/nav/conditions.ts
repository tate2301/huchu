import { prisma } from "@/lib/prisma";

import type { RetailNavCondition } from "./types";

/**
 * The shop facts nav items wait on (`RetailNavItem.when`), for one company.
 * `multi-site`: two or more open sites, so stock has somewhere to go.
 * `liquor-empties`: a liquor store taking deposits on its empties (STK-09).
 */
export async function navConditions(companyId: string): Promise<Record<RetailNavCondition, boolean>> {
  const [openSites, profile] = await Promise.all([
    prisma.site.count({ where: { companyId, isActive: true } }),
    prisma.retailShopProfile.findUnique({ where: { companyId }, select: { businessType: true, emptiesAndDeposits: true } }),
  ]);
  return {
    "multi-site": openSites >= 2,
    "liquor-empties": profile?.businessType === "LIQUOR" && profile.emptiesAndDeposits,
  };
}
