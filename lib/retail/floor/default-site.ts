import { prisma } from "@/lib/prisma";
import { shopSiteId } from "@/lib/retail/devices";
import { siteScopeOf } from "@/lib/retail/people/scope";

/**
 * The site a person's floor pages open on (50-floor): their first allowed
 * site by name when they work at only some sites, else the shop's own site
 * (the default site while it is open, else the first open site).
 */
export async function defaultSiteFor(companyId: string, userId: string): Promise<string | null> {
  const scope = await siteScopeOf(companyId, userId);
  if (!scope.all) {
    const first = await prisma.site.findFirst({
      where: { companyId, isActive: true, id: { in: scope.ids } },
      orderBy: { name: "asc" },
      select: { id: true },
    });
    if (first) return first.id;
  }
  return shopSiteId(companyId);
}
