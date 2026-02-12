import { prisma } from "../prisma";
import { appendAuditEvent } from "./audit-ledger";
import { FEATURE_BUNDLES, FEATURE_CATALOG, TIERS, getBundleDefinition, getTierDefinition } from "../../../lib/platform/feature-catalog";
import type {
  AddonBundleSummary,
  AddonSetResult,
  CatalogSyncResult,
  SubscriptionHealthSummary,
  SubscriptionPricingLineItem,
  SubscriptionPricingSummary,
  TierAssignResult,
  TierPlanSummary,
} from "../types";

function formatDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString();
}

function normalizeTier(value: string): string {
  return String(value || "").trim().toUpperCase();
}

function money(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function syncCommercialCatalog(): Promise<CatalogSyncResult> {
  await prisma.$transaction(async (tx) => {
    for (const feature of FEATURE_CATALOG) {
      await tx.platformFeature.upsert({
        where: { key: feature.key },
        update: {
          name: feature.name,
          description: feature.description,
          domain: feature.domain,
          defaultEnabled: feature.defaultEnabled,
          isBillable: feature.isBillable,
          monthlyPrice: feature.monthlyPrice,
          isActive: true,
        },
        create: {
          key: feature.key,
          name: feature.name,
          description: feature.description,
          domain: feature.domain,
          defaultEnabled: feature.defaultEnabled,
          isBillable: feature.isBillable,
          monthlyPrice: feature.monthlyPrice,
          isActive: true,
        },
      });
    }

    for (const bundle of FEATURE_BUNDLES) {
      const savedBundle = await tx.featureBundle.upsert({
        where: { code: bundle.code },
        update: {
          name: bundle.name,
          description: bundle.description,
          monthlyPrice: bundle.monthlyPrice,
          isActive: true,
        },
        create: {
          code: bundle.code,
          name: bundle.name,
          description: bundle.description,
          monthlyPrice: bundle.monthlyPrice,
          isActive: true,
        },
        select: { id: true },
      });

      for (const featureKey of bundle.features) {
        const feature = await tx.platformFeature.findUnique({
          where: { key: featureKey },
          select: { id: true },
        });
        if (!feature) continue;
        await tx.featureBundleItem.upsert({
          where: {
            bundleId_featureId: {
              bundleId: savedBundle.id,
              featureId: feature.id,
            },
          },
          update: {},
          create: {
            bundleId: savedBundle.id,
            featureId: feature.id,
          },
        });
      }
    }

    for (const tier of TIERS) {
      await tx.subscriptionPlan.upsert({
        where: { code: tier.code },
        update: {
          name: tier.name,
          description: tier.description,
          monthlyPrice: tier.monthlyPrice,
          annualPrice: tier.monthlyPrice * 12,
          maxSites: tier.includedSites,
          warningDays: tier.warningDays,
          graceDays: tier.graceDays,
          isActive: true,
        },
        create: {
          code: tier.code,
          name: tier.name,
          description: tier.description,
          monthlyPrice: tier.monthlyPrice,
          annualPrice: tier.monthlyPrice * 12,
          maxSites: tier.includedSites,
          warningDays: tier.warningDays,
          graceDays: tier.graceDays,
          currency: "USD",
          isActive: true,
        },
      });
    }
  });

  return {
    features: FEATURE_CATALOG.length,
    bundles: FEATURE_BUNDLES.length,
    bundleItems: FEATURE_BUNDLES.reduce((sum, bundle) => sum + bundle.features.length, 0),
    tiers: TIERS.length,
  };
}

export async function listTierPlans(): Promise<TierPlanSummary[]> {
  const rows = await prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: [{ monthlyPrice: "asc" }, { code: "asc" }],
  });

  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    description: row.description ?? null,
    monthlyPrice: row.monthlyPrice,
    annualPrice: row.annualPrice ?? null,
    includedSites: getTierDefinition(row.code)?.includedSites ?? Math.max(0, row.maxSites ?? 0),
    additionalSiteMonthlyPrice: getTierDefinition(row.code)?.additionalSiteMonthlyPrice ?? 0,
    warningDays: row.warningDays,
    graceDays: row.graceDays,
    isActive: row.isActive,
  }));
}

export async function assignTier(input: {
  companyId: string;
  tierCode: string;
  actor: string;
  reason?: string;
}): Promise<TierAssignResult> {
  const tierCode = normalizeTier(input.tierCode);
  const plan = await prisma.subscriptionPlan.findUnique({
    where: { code: tierCode },
    select: { id: true, code: true },
  });
  if (!plan) {
    throw new Error(`Tier not found: ${tierCode}`);
  }

  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const before = await prisma.companySubscription.findFirst({
    where: { companyId: input.companyId },
    include: { plan: { select: { code: true } } },
    orderBy: [{ updatedAt: "desc" }],
  });

  const now = new Date();
  if (before) {
    await prisma.companySubscription.update({
      where: { id: before.id },
      data: {
        planId: plan.id,
        currentPeriodStart: now,
        status: before.status === "EXPIRED" ? "ACTIVE" : before.status,
      },
    });
  } else {
    await prisma.companySubscription.create({
      data: {
        companyId: input.companyId,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
      },
    });
  }

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SUBSCRIPTION_ASSIGN_TIER",
    entityType: "subscription",
    entityId: input.companyId,
    companyId: input.companyId,
    reason: input.reason ?? `Assigned tier ${plan.code}`,
    before: { planCode: before?.plan?.code ?? null },
    after: { planCode: plan.code },
  });

  return {
    companyId: input.companyId,
    companyName: company.name,
    companySlug: company.slug,
    beforePlanCode: before?.plan?.code ?? null,
    afterPlanCode: plan.code,
    auditEventId: audit.id,
  };
}

export async function listAddOnBundles(companyId: string): Promise<AddonBundleSummary[]> {
  const [bundles, enabled] = await Promise.all([
    prisma.featureBundle.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.companySubscriptionAddon.findMany({
      where: { companyId },
      include: { bundle: { select: { code: true } } },
    }),
  ]);

  const enabledByCode = new Map(enabled.map((row) => [row.bundle.code, row]));
  return bundles.map((bundle) => {
    const bundleDef = getBundleDefinition(bundle.code);
    const state = enabledByCode.get(bundle.code);
    return {
      code: bundle.code,
      name: bundle.name,
      description: bundle.description ?? null,
      monthlyPrice: bundle.monthlyPrice,
      additionalSiteMonthlyPrice: bundleDef?.additionalSiteMonthlyPrice ?? 0,
      isActive: bundle.isActive,
      enabled: state?.isEnabled ?? false,
      reason: state?.reason ?? null,
    };
  });
}

export async function setAddOnBundle(input: {
  companyId: string;
  bundleCode: string;
  enabled: boolean;
  actor: string;
  reason?: string;
}): Promise<AddonSetResult> {
  const company = await prisma.company.findUnique({
    where: { id: input.companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${input.companyId}`);

  const bundle = await prisma.featureBundle.findUnique({
    where: { code: String(input.bundleCode || "").trim().toUpperCase() },
    select: { id: true, code: true, name: true },
  });
  if (!bundle) throw new Error(`Add-on bundle not found: ${input.bundleCode}`);

  const before = await prisma.companySubscriptionAddon.findUnique({
    where: {
      companyId_bundleId: {
        companyId: input.companyId,
        bundleId: bundle.id,
      },
    },
    select: { isEnabled: true, reason: true },
  });

  const after = await prisma.companySubscriptionAddon.upsert({
    where: {
      companyId_bundleId: {
        companyId: input.companyId,
        bundleId: bundle.id,
      },
    },
    update: {
      isEnabled: input.enabled,
      reason: input.reason ?? null,
    },
    create: {
      companyId: input.companyId,
      bundleId: bundle.id,
      isEnabled: input.enabled,
      reason: input.reason ?? null,
    },
  });

  const bundleDefinition = getBundleDefinition(bundle.code);
  const bundleFeatureKeys = bundleDefinition?.features ?? [];
  if (bundleFeatureKeys.length > 0) {
    if (input.enabled) {
      for (const featureKey of bundleFeatureKeys) {
        const normalizedKey = featureKey.trim().toLowerCase();
        const catalog = FEATURE_CATALOG.find((feature) => feature.key.toLowerCase() === normalizedKey);
        const feature = await prisma.platformFeature.upsert({
          where: { key: catalog?.key ?? normalizedKey },
          update: {
            name: catalog?.name ?? normalizedKey,
            description: catalog?.description ?? `Feature flag for ${normalizedKey}`,
            domain: catalog?.domain ?? null,
            defaultEnabled: catalog?.defaultEnabled ?? false,
            isBillable: catalog?.isBillable ?? false,
            monthlyPrice: catalog?.monthlyPrice ?? null,
            isActive: true,
          },
          create: {
            key: catalog?.key ?? normalizedKey,
            name: catalog?.name ?? normalizedKey,
            description: catalog?.description ?? `Feature flag for ${normalizedKey}`,
            domain: catalog?.domain ?? null,
            defaultEnabled: catalog?.defaultEnabled ?? false,
            isBillable: catalog?.isBillable ?? false,
            monthlyPrice: catalog?.monthlyPrice ?? null,
            isActive: true,
          },
          select: { id: true },
        });
        await prisma.companyFeatureFlag.upsert({
          where: { companyId_featureId: { companyId: input.companyId, featureId: feature.id } },
          update: {
            isEnabled: true,
            reason: input.reason ?? `Enabled via add-on ${bundle.code}`,
          },
          create: {
            companyId: input.companyId,
            featureId: feature.id,
            isEnabled: true,
            reason: input.reason ?? `Enabled via add-on ${bundle.code}`,
          },
        });
      }
    } else {
      const [subscription, enabledAddons] = await Promise.all([
        prisma.companySubscription.findFirst({
          where: { companyId: input.companyId },
          include: { plan: { select: { code: true } } },
          orderBy: [{ updatedAt: "desc" }],
        }),
        prisma.companySubscriptionAddon.findMany({
          where: { companyId: input.companyId, isEnabled: true },
          include: { bundle: { select: { code: true } } },
        }),
      ]);
      const entitledAfter = buildIncludedFeatureSet(
        subscription?.plan?.code ?? null,
        enabledAddons.map((row) => row.bundle.code),
      );
      for (const featureKey of bundleFeatureKeys) {
        const normalizedKey = featureKey.trim().toLowerCase();
        if (entitledAfter.has(normalizedKey)) continue;
        const feature = await prisma.platformFeature.findUnique({
          where: { key: normalizedKey },
          select: { id: true },
        });
        if (!feature) continue;
        await prisma.companyFeatureFlag.upsert({
          where: { companyId_featureId: { companyId: input.companyId, featureId: feature.id } },
          update: {
            isEnabled: false,
            reason: input.reason ?? `Disabled via add-on ${bundle.code}`,
          },
          create: {
            companyId: input.companyId,
            featureId: feature.id,
            isEnabled: false,
            reason: input.reason ?? `Disabled via add-on ${bundle.code}`,
          },
        });
      }
    }
  }

  const audit = await appendAuditEvent({
    actor: input.actor,
    action: "SUBSCRIPTION_SET_ADDON",
    entityType: "subscription_addon",
    entityId: `${input.companyId}:${bundle.code}`,
    companyId: input.companyId,
    reason: input.reason ?? null,
    before: { enabled: before?.isEnabled ?? null, reason: before?.reason ?? null },
    after: { enabled: after.isEnabled, reason: after.reason ?? null },
  });

  return {
    companyId: input.companyId,
    companyName: company.name,
    companySlug: company.slug,
    bundleCode: bundle.code,
    enabled: after.isEnabled,
    reason: after.reason ?? null,
    auditEventId: audit.id,
  };
}

function buildIncludedFeatureSet(planCode: string | null, addonCodes: string[]): Set<string> {
  const set = new Set<string>();
  const tier = getTierDefinition(planCode);
  for (const key of tier?.includedFeatures ?? []) {
    set.add(key.toLowerCase());
  }
  for (const bundleCode of tier?.includedBundles ?? []) {
    const bundle = FEATURE_BUNDLES.find((row) => row.code === bundleCode);
    for (const key of bundle?.features ?? []) set.add(key.toLowerCase());
  }
  for (const bundleCode of addonCodes) {
    const bundle = FEATURE_BUNDLES.find((row) => row.code === bundleCode);
    for (const key of bundle?.features ?? []) set.add(key.toLowerCase());
  }
  return set;
}

export async function computeSubscriptionPricing(companyId: string): Promise<SubscriptionPricingSummary> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, slug: true },
  });
  if (!company) throw new Error(`Organization not found for id: ${companyId}`);

  const subscription = await prisma.companySubscription.findFirst({
    where: { companyId },
    include: { plan: true },
    orderBy: [{ updatedAt: "desc" }],
  });
  const siteCount = await prisma.site.count({
    where: { companyId, isActive: true },
  });

  const baseAmount = money(subscription?.plan?.monthlyPrice ?? 0);
  const planCode = subscription?.plan?.code ?? null;
  const planName = subscription?.plan?.name ?? null;
  const currency = subscription?.plan?.currency ?? "USD";
  const tier = getTierDefinition(planCode);
  const tierIncludedSites = Math.max(0, tier?.includedSites ?? 0);
  const tierSiteOverageRate = money(tier?.additionalSiteMonthlyPrice ?? 0);
  const tierSiteOverageCount = Math.max(0, siteCount - tierIncludedSites);
  const tierSiteOverageAmount = tierSiteOverageCount * tierSiteOverageRate;
  const lineItems: SubscriptionPricingLineItem[] = [
    {
      code: planCode ?? "NO_PLAN",
      label: planName ?? "No Tier",
      amount: baseAmount,
      type: "tier",
    },
  ];
  if (tierSiteOverageAmount > 0) {
    lineItems.push({
      code: `${planCode ?? "NO_PLAN"}:SITE_OVERAGE`,
      label: `Tier site overage (${tierSiteOverageCount} x ${tierSiteOverageRate.toFixed(2)})`,
      amount: tierSiteOverageAmount,
      type: "site-overage",
    });
  }

  const addons = await prisma.companySubscriptionAddon.findMany({
    where: { companyId, isEnabled: true },
    include: { bundle: true },
    orderBy: [{ bundle: { code: "asc" } }],
  });
  const addonCodes = addons.map((row) => row.bundle.code);
  let addonBaseAmount = 0;
  let addonSiteAmount = 0;
  for (const addon of addons) {
    const bundleDef = getBundleDefinition(addon.bundle.code);
    const base = money(addon.bundle.monthlyPrice);
    const perSite = money(bundleDef?.additionalSiteMonthlyPrice ?? 0);
    const siteCharge = perSite * siteCount;
    addonBaseAmount += base;
    addonSiteAmount += siteCharge;
    lineItems.push({
      code: addon.bundle.code,
      label: addon.bundle.name,
      amount: base,
      type: "addon",
    });
    if (siteCharge > 0) {
      lineItems.push({
        code: `${addon.bundle.code}:SITE`,
        label: `${addon.bundle.name} site charge (${siteCount} x ${perSite.toFixed(2)})`,
        amount: siteCharge,
        type: "addon-site",
      });
    }
  }
  const addonAmount = addonBaseAmount + addonSiteAmount;

  const includedFeatures = buildIncludedFeatureSet(planCode, addonCodes);
  const manualBillable = await prisma.companyFeatureFlag.findMany({
    where: { companyId, isEnabled: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: {
      feature: { select: { key: true, name: true, isBillable: true, monthlyPrice: true, isActive: true } },
    },
  });

  let featureAmount = 0;
  for (const row of manualBillable) {
    const key = row.feature.key.toLowerCase();
    if (!row.feature.isActive || !row.feature.isBillable || includedFeatures.has(key)) continue;
    const amount = money(row.feature.monthlyPrice);
    if (amount <= 0) continue;
    featureAmount += amount;
    lineItems.push({
      code: row.feature.key,
      label: row.feature.name,
      amount,
      type: "feature",
    });
  }

  const totalAmount = baseAmount + tierSiteOverageAmount + addonAmount + featureAmount;
  return {
    companyId,
    companyName: company.name,
    companySlug: company.slug,
    planCode,
    planName,
    currency,
    siteCount,
    tierIncludedSites,
    tierSiteOverageRate,
    tierSiteOverageCount,
    tierSiteOverageAmount,
    baseAmount,
    addonBaseAmount,
    addonSiteAmount,
    addonAmount,
    featureAmount,
    totalAmount,
    lineItems,
    computedAt: new Date().toISOString(),
  };
}

export async function recomputeSubscriptionPricing(companyId: string): Promise<SubscriptionPricingSummary> {
  const summary = await computeSubscriptionPricing(companyId);
  const latest = await prisma.companySubscription.findFirst({
    where: { companyId },
    orderBy: [{ updatedAt: "desc" }],
    select: { id: true },
  });
  if (latest) {
    await prisma.companySubscription.update({
      where: { id: latest.id },
      data: {
        effectiveMonthlyAmount: summary.totalAmount,
        priceSnapshotJson: JSON.stringify(summary),
        lastPriceComputedAt: new Date(),
      },
    });
  }
  return summary;
}

export async function getSubscriptionHealthSummary(companyId: string): Promise<SubscriptionHealthSummary> {
  const latest = await prisma.companySubscription.findFirst({
    where: { companyId },
    include: { plan: true },
    orderBy: [{ updatedAt: "desc" }],
  });

  if (!latest) {
    return {
      companyId,
      state: "MISSING_SUBSCRIPTION",
      status: null,
      shouldBlock: true,
      warningDays: 14,
      graceDays: 7,
      currentPeriodEnd: null,
      daysUntilEnd: null,
      daysOverdue: null,
      reason: "No subscription record found.",
    };
  }

  const warningDays = latest.plan.warningDays;
  const graceDays = latest.plan.graceDays;
  const currentPeriodEnd = latest.currentPeriodEnd ?? latest.trialEndsAt ?? latest.endedAt ?? null;
  const status = latest.status;

  const now = Date.now();
  const daysUntilEnd = currentPeriodEnd
    ? Math.floor((currentPeriodEnd.getTime() - now) / (24 * 60 * 60 * 1000))
    : null;
  const overdue = daysUntilEnd !== null && daysUntilEnd < 0 ? Math.abs(daysUntilEnd) : null;

  if (["CANCELED", "EXPIRED"].includes(status)) {
    return {
      companyId,
      state: "EXPIRED_BLOCKED",
      status,
      shouldBlock: true,
      warningDays,
      graceDays,
      currentPeriodEnd: formatDate(currentPeriodEnd),
      daysUntilEnd,
      daysOverdue: overdue,
      reason: `Subscription status is ${status}.`,
    };
  }

  if (daysUntilEnd !== null && daysUntilEnd < 0) {
    if ((overdue ?? 0) <= graceDays) {
      return {
        companyId,
        state: "IN_GRACE",
        status,
        shouldBlock: false,
        warningDays,
        graceDays,
        currentPeriodEnd: formatDate(currentPeriodEnd),
        daysUntilEnd,
        daysOverdue: overdue,
        reason: `In grace period (${overdue}/${graceDays} overdue days).`,
      };
    }
    return {
      companyId,
      state: "EXPIRED_BLOCKED",
      status,
      shouldBlock: true,
      warningDays,
      graceDays,
      currentPeriodEnd: formatDate(currentPeriodEnd),
      daysUntilEnd,
      daysOverdue: overdue,
      reason: "Grace period exceeded.",
    };
  }

  if (daysUntilEnd !== null && daysUntilEnd <= warningDays) {
    return {
      companyId,
      state: "EXPIRING_SOON",
      status,
      shouldBlock: false,
      warningDays,
      graceDays,
      currentPeriodEnd: formatDate(currentPeriodEnd),
      daysUntilEnd,
      daysOverdue: null,
      reason: `Subscription expires in ${daysUntilEnd} day(s).`,
    };
  }

  return {
    companyId,
    state: "ACTIVE",
    status,
    shouldBlock: false,
    warningDays,
    graceDays,
    currentPeriodEnd: formatDate(currentPeriodEnd),
    daysUntilEnd,
    daysOverdue: null,
    reason: "Subscription is active.",
  };
}
