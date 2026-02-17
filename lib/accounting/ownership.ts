import { prisma } from "@/lib/prisma";

function normalizeUniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function findForeignAccountIds(
  companyId: string,
  accountIds: Array<string | null | undefined>,
) {
  const normalized = normalizeUniqueIds(accountIds);
  if (normalized.length === 0) return [];
  const owned = await prisma.chartOfAccount.findMany({
    where: {
      companyId,
      id: { in: normalized },
    },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((account) => account.id));
  return normalized.filter((id) => !ownedSet.has(id));
}

export async function findForeignCostCenterIds(
  companyId: string,
  costCenterIds: Array<string | null | undefined>,
) {
  const normalized = normalizeUniqueIds(costCenterIds);
  if (normalized.length === 0) return [];
  const owned = await prisma.costCenter.findMany({
    where: {
      companyId,
      id: { in: normalized },
    },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((center) => center.id));
  return normalized.filter((id) => !ownedSet.has(id));
}

export async function findForeignTaxCodeIds(
  companyId: string,
  taxCodeIds: Array<string | null | undefined>,
) {
  const normalized = normalizeUniqueIds(taxCodeIds);
  if (normalized.length === 0) return [];
  const owned = await prisma.taxCode.findMany({
    where: {
      companyId,
      id: { in: normalized },
    },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((taxCode) => taxCode.id));
  return normalized.filter((id) => !ownedSet.has(id));
}
