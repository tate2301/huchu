import { prisma } from "@/lib/prisma";

import { DEFAULT_DEPOSIT } from "./create";

/**
 * What the New product sheet needs to know before anyone types (PRD-03): the
 * shop's open sites and its default (At is asked only with two or more), its
 * business type and whether it charges deposits (Returnable bottle), and the
 * default price list's name for the hints.
 */
export type ProductNewContext = {
  sites: Array<{ id: string; name: string; isDefault: boolean }>;
  oneSite: boolean;
  defaultSiteId: string | null;
  businessType: string;
  depositsOn: boolean;
  defaultDeposit: string;
  currency: string;
  listName: string;
};

export async function productNewContext(companyId: string): Promise<ProductNewContext> {
  const [sites, profile, list] = await Promise.all([
    prisma.site.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ createdAt: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.retailShopProfile.findUnique({
      where: { companyId },
      select: { businessType: true, emptiesAndDeposits: true, defaultSiteId: true },
    }),
    prisma.priceList.findFirst({
      where: { companyId, isDefault: true },
      orderBy: { createdAt: "asc" },
      select: { name: true, currency: true },
    }),
  ]);
  const defaultSiteId =
    sites.find((site) => site.id === profile?.defaultSiteId)?.id ?? sites[0]?.id ?? null;
  const businessType = profile?.businessType ?? "GENERAL";
  return {
    sites: sites.map((site) => ({ ...site, isDefault: site.id === defaultSiteId })),
    oneSite: sites.length < 2,
    defaultSiteId,
    businessType,
    depositsOn: businessType === "LIQUOR" && Boolean(profile?.emptiesAndDeposits),
    defaultDeposit: DEFAULT_DEPOSIT,
    currency: list?.currency ?? "USD",
    listName: list?.name ?? "Retail",
  };
}
