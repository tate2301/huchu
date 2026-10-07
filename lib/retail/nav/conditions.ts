import { prisma } from "@/lib/prisma";

import type { RetailNavCondition } from "./types";

/**
 * The shop facts nav items wait on (`RetailNavItem.when`), for one company.
 * `multi-site`: two or more open sites, so stock has somewhere to go.
 */
export async function navConditions(companyId: string): Promise<Record<RetailNavCondition, boolean>> {
  const openSites = await prisma.site.count({ where: { companyId, isActive: true } });
  return { "multi-site": openSites >= 2 };
}
