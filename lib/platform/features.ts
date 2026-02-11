export type FeatureMap = Record<string, boolean>;

async function getPrismaClient() {
  const { prisma } = await import("@/lib/prisma");
  return prisma;
}

function normalizeFeatureKey(value: string): string {
  return value.trim().toLowerCase();
}

export async function getFeatureMap(companyId: string): Promise<FeatureMap> {
  const normalizedCompanyId = companyId.trim();
  if (!normalizedCompanyId) {
    return {};
  }

  const prisma = await getPrismaClient();

  try {
    const [platformFeatures, companyFlags] = await Promise.all([
      prisma.platformFeature.findMany({
        where: { isActive: true },
        select: { id: true, key: true },
      }),
      prisma.companyFeatureFlag.findMany({
        where: { companyId: normalizedCompanyId },
        select: {
          featureId: true,
          isEnabled: true,
          feature: { select: { key: true } },
        },
      }),
    ]);

    const map: FeatureMap = {};
    for (const feature of platformFeatures) {
      map[normalizeFeatureKey(feature.key)] = false;
    }

    for (const flag of companyFlags) {
      const key = normalizeFeatureKey(flag.feature.key);
      map[key] = flag.isEnabled;
    }

    return map;
  } catch {
    return {};
  }
}

export async function hasFeature(companyId: string, featureKey: string): Promise<boolean> {
  const normalizedFeatureKey = normalizeFeatureKey(featureKey);
  if (!normalizedFeatureKey) {
    return false;
  }

  const map = await getFeatureMap(companyId);
  return map[normalizedFeatureKey] === true;
}
