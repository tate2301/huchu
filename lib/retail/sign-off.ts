/**
 * Who signs a till's cash-up off: the site's shop manager if it has one, else
 * a manager of the company, first by name. Derived, not stored: it follows the
 * people as they are set up today.
 */

import { prisma } from "@/lib/prisma";

export type SignOff = { name: string };

export async function cashUpSignOff(companyId: string, siteId: string): Promise<SignOff | null> {
  const atSite = { OR: [{ allSites: true }, { siteAccess: { some: { siteId } } }] };
  const shopManager = await prisma.user.findFirst({
    where: { companyId, isActive: true, role: "SHOP_MANAGER", ...atSite },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  if (shopManager) return { name: shopManager.name };
  const manager = await prisma.user.findFirst({
    where: { companyId, isActive: true, role: "MANAGER" },
    orderBy: { name: "asc" },
    select: { name: true },
  });
  return manager ? { name: manager.name } : null;
}
