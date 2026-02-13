import { prisma } from "../prisma";
import { appendAuditEvent } from "./audit-ledger";
import { FEATURE_BUNDLES, FEATURE_CATALOG, getBundleDefinition } from "../../../lib/platform/feature-catalog";
import type {
  BundleCatalogSummary,
  SetBundleFeaturesInput,
  UpsertBundleCatalogInput,
} from "../types";

function normalizeBundleCode(value: string): string {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  if (!normalized) throw new Error("Bundle code is required.");
  return normalized;
}

function normalizeFeatureKey(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, parsed);
}

function resolveAdditionalSiteMonthlyPrice(bundleCode: string, value: unknown): number {
  const normalized = money(value);
  if (normalized > 0) return normalized;
  const fallback = getBundleDefinition(bundleCode);
  return money(fallback?.additionalSiteMonthlyPrice ?? 0);
}

function mapBundleSummary(row: {
  code: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  additionalSiteMonthlyPrice: number;
  isActive: boolean;
  items: Array<{ feature: { key: string } }>;
}): BundleCatalogSummary {
  const featureKeys = row.items.map((item) => item.feature.key).sort();
  const source = FEATURE_BUNDLES.some((bundle) => bundle.code === row.code) ? "SYSTEM" : "CUSTOM";
  return {
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    monthlyPrice: money(row.monthlyPrice),
    additionalSiteMonthlyPrice: resolveAdditionalSiteMonthlyPrice(row.code, row.additionalSiteMonthlyPrice),
    isActive: row.isActive,
    featureKeys,
    source,
  };
}

export async function getBundleFeatureKeysByCodes(bundleCodes: string[]): Promise<Set<string>> {
  const normalizedCodes = [...new Set(bundleCodes.map((code) => normalizeBundleCode(code)))];
  if (normalizedCodes.length === 0) return new Set<string>();

  const rows = await prisma.featureBundle.findMany({
    where: { code: { in: normalizedCodes } },
    select: { code: true, items: { select: { feature: { select: { key: true } } } } },
  });

  const set = new Set<string>();
  for (const row of rows) {
    for (const item of row.items) {
      set.add(normalizeFeatureKey(item.feature.key));
    }
  }

  for (const code of normalizedCodes) {
    if (rows.some((row) => row.code === code)) continue;
    const fallback = FEATURE_BUNDLES.find((bundle) => bundle.code === code);
    for (const featureKey of fallback?.features ?? []) {
      set.add(normalizeFeatureKey(featureKey));
    }
  }

  return set;
}

export async function listBundleCatalog(): Promise<BundleCatalogSummary[]> {
  const rows = await prisma.featureBundle.findMany({
    include: {
      items: {
        include: {
          feature: {
            select: { key: true },
          },
        },
      },
    },
    orderBy: [{ code: "asc" }],
  });

  return rows.map(mapBundleSummary);
}

export async function upsertBundleCatalog(input: UpsertBundleCatalogInput): Promise<BundleCatalogSummary> {
  const code = normalizeBundleCode(input.code);
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Bundle name is required.");

  const monthlyPrice = money(input.monthlyPrice ?? 0);
  const additionalSiteMonthlyPrice = input.additionalSiteMonthlyPrice === undefined
    ? undefined
    : money(input.additionalSiteMonthlyPrice);
  const fallbackAdditionalSiteMonthlyPrice = money(getBundleDefinition(code)?.additionalSiteMonthlyPrice ?? 0);
  const saved = await prisma.featureBundle.upsert({
    where: { code },
    update: {
      name,
      description: input.description ? String(input.description).trim() : null,
      monthlyPrice,
      ...(additionalSiteMonthlyPrice === undefined ? {} : { additionalSiteMonthlyPrice }),
      isActive: input.isActive ?? true,
    },
    create: {
      code,
      name,
      description: input.description ? String(input.description).trim() : null,
      monthlyPrice,
      additionalSiteMonthlyPrice: additionalSiteMonthlyPrice ?? fallbackAdditionalSiteMonthlyPrice,
      isActive: input.isActive ?? true,
    },
    include: {
      items: {
        include: {
          feature: {
            select: { key: true },
          },
        },
      },
    },
  });

  const summary = mapBundleSummary(saved);
  await appendAuditEvent({
    actor: input.actor,
    action: "BUNDLE_CATALOG_UPSERT",
    entityType: "feature_bundle",
    entityId: summary.code,
    reason: input.reason ?? `Upserted bundle ${summary.code}`,
    after: summary,
  });
  return summary;
}

export async function setBundleFeatures(input: SetBundleFeaturesInput): Promise<BundleCatalogSummary> {
  const bundleCode = normalizeBundleCode(input.bundleCode);
  const bundle = await prisma.featureBundle.findUnique({
    where: { code: bundleCode },
    select: { id: true, code: true },
  });
  if (!bundle) throw new Error(`Bundle not found: ${bundleCode}`);

  const requestedKeys = [...new Set(input.featureKeys.map(normalizeFeatureKey).filter(Boolean))];
  await prisma.$transaction(async (tx) => {
    const features = [];
    for (const featureKey of requestedKeys) {
      const catalog = FEATURE_CATALOG.find((feature) => feature.key.toLowerCase() === featureKey);
      const feature = await tx.platformFeature.upsert({
        where: { key: catalog?.key ?? featureKey },
        update: {
          name: catalog?.name ?? featureKey,
          description: catalog?.description ?? `Feature flag for ${featureKey}`,
          domain: catalog?.domain ?? null,
          defaultEnabled: catalog?.defaultEnabled ?? false,
          isBillable: catalog?.isBillable ?? false,
          monthlyPrice: catalog?.monthlyPrice ?? null,
          isActive: true,
        },
        create: {
          key: catalog?.key ?? featureKey,
          name: catalog?.name ?? featureKey,
          description: catalog?.description ?? `Feature flag for ${featureKey}`,
          domain: catalog?.domain ?? null,
          defaultEnabled: catalog?.defaultEnabled ?? false,
          isBillable: catalog?.isBillable ?? false,
          monthlyPrice: catalog?.monthlyPrice ?? null,
          isActive: true,
        },
        select: { id: true },
      });
      features.push(feature);
    }

    await tx.featureBundleItem.deleteMany({
      where: {
        bundleId: bundle.id,
        ...(features.length > 0 ? { featureId: { notIn: features.map((feature) => feature.id) } } : {}),
      },
    });

    for (const feature of features) {
      await tx.featureBundleItem.upsert({
        where: {
          bundleId_featureId: {
            bundleId: bundle.id,
            featureId: feature.id,
          },
        },
        update: {},
        create: {
          bundleId: bundle.id,
          featureId: feature.id,
        },
      });
    }

    if (features.length === 0) {
      await tx.featureBundleItem.deleteMany({ where: { bundleId: bundle.id } });
    }
  });

  const saved = await prisma.featureBundle.findUnique({
    where: { code: bundleCode },
    include: {
      items: {
        include: {
          feature: {
            select: { key: true },
          },
        },
      },
    },
  });
  if (!saved) throw new Error(`Bundle not found after update: ${bundleCode}`);
  const summary = mapBundleSummary(saved);
  await appendAuditEvent({
    actor: input.actor,
    action: "BUNDLE_SET_FEATURES",
    entityType: "feature_bundle",
    entityId: summary.code,
    reason: input.reason ?? `Updated features for bundle ${summary.code}`,
    after: {
      featureCount: summary.featureKeys.length,
      featureKeys: summary.featureKeys,
    },
  });
  return summary;
}
