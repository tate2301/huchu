import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createPlatformServices } from "@/scripts/platform/services";
import { computeSubscriptionPricing } from "@/scripts/platform/domain/commercial-service";
import { requirePlatformAdminAccess } from "../_auth";

export const runtime = "nodejs";

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(value: Date, count: number) {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function monthLabel(value: Date) {
  return value.toLocaleDateString("en-US", { month: "short" });
}

function daysBetween(future: Date, baseline: Date) {
  return Math.floor((future.getTime() - baseline.getTime()) / (24 * 60 * 60 * 1000));
}

type LatestSubscriptionRow = {
  id: string;
  companyId: string;
  status: string;
  startedAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
  updatedAt: Date;
  effectiveMonthlyAmount: number | null;
  lastPriceComputedAt: Date | null;
  company: {
    name: string;
    slug: string;
    tenantStatus: string;
  } | null;
  plan: {
    code: string;
    name: string;
    currency: string;
    warningDays: number;
    graceDays: number;
  } | null;
};

function buildHealth(subscription: LatestSubscriptionRow | null) {
  if (!subscription) {
    return {
      state: "MISSING_SUBSCRIPTION",
      shouldBlock: true,
      daysUntilEnd: null as number | null,
      daysOverdue: null as number | null,
      reason: "No subscription record.",
    };
  }

  const warningDays = subscription.plan?.warningDays ?? 14;
  const graceDays = subscription.plan?.graceDays ?? 7;
  const anchorDate = subscription.currentPeriodEnd ?? subscription.trialEndsAt ?? subscription.endedAt ?? null;
  const now = new Date();
  const daysUntilEnd = anchorDate ? daysBetween(anchorDate, now) : null;
  const daysOverdue = daysUntilEnd !== null && daysUntilEnd < 0 ? Math.abs(daysUntilEnd) : null;

  if (subscription.status === "CANCELED" || subscription.status === "EXPIRED") {
    return {
      state: "EXPIRED_BLOCKED",
      shouldBlock: true,
      daysUntilEnd,
      daysOverdue,
      reason: `Subscription status is ${subscription.status}.`,
    };
  }

  if (daysUntilEnd !== null && daysUntilEnd < 0) {
    if ((daysOverdue ?? 0) <= graceDays) {
      return {
        state: "IN_GRACE",
        shouldBlock: false,
        daysUntilEnd,
        daysOverdue,
        reason: `In grace (${daysOverdue}/${graceDays} overdue days).`,
      };
    }

    return {
      state: "EXPIRED_BLOCKED",
      shouldBlock: true,
      daysUntilEnd,
      daysOverdue,
      reason: "Grace period exceeded.",
    };
  }

  if (daysUntilEnd !== null && daysUntilEnd <= warningDays) {
    return {
      state: "EXPIRING_SOON",
      shouldBlock: false,
      daysUntilEnd,
      daysOverdue: null,
      reason: `Renews in ${daysUntilEnd} day(s).`,
    };
  }

  if (subscription.status === "PAST_DUE") {
    return {
      state: "PAST_DUE",
      shouldBlock: false,
      daysUntilEnd,
      daysOverdue,
      reason: "Marked past due.",
    };
  }

  return {
    state: "ACTIVE",
    shouldBlock: false,
    daysUntilEnd,
    daysOverdue: null,
    reason: "Subscription is active.",
  };
}

function resolveDueBucket(subscription: LatestSubscriptionRow | null, health: ReturnType<typeof buildHealth>, now: Date) {
  if (!subscription) return "NO_SUBSCRIPTION" as const;
  const anchorDate = subscription.currentPeriodEnd ?? subscription.trialEndsAt ?? null;
  if (!anchorDate) return "NO_SCHEDULE" as const;
  if (anchorDate.getTime() < now.getTime()) return "OVERDUE" as const;
  if (anchorDate <= endOfMonth(now)) return "DUE_THIS_MONTH" as const;
  const inThirtyDays = new Date(now);
  inThirtyDays.setDate(inThirtyDays.getDate() + 30);
  if (anchorDate <= inThirtyDays || health.state === "EXPIRING_SOON") return "NEXT_30_DAYS" as const;
  return "FUTURE" as const;
}

function resolveRiskBucket(subscription: LatestSubscriptionRow | null, health: ReturnType<typeof buildHealth>, dueBucket: string) {
  if (!subscription) return "MISSING" as const;
  if (dueBucket === "OVERDUE" || health.daysOverdue !== null) return "OVERDUE" as const;
  if (
    health.shouldBlock ||
    health.state === "EXPIRING_SOON" ||
    health.state === "IN_GRACE" ||
    health.state === "PAST_DUE" ||
    subscription.status === "PAST_DUE" ||
    subscription.status === "CANCELED" ||
    subscription.status === "EXPIRED"
  ) {
    return "AT_RISK" as const;
  }
  return "HEALTHY" as const;
}

export async function GET(request: Request) {
  const access = await requirePlatformAdminAccess(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const services = createPlatformServices();

  try {
    const [
      companies,
      subscriptionRows,
      siteCounts,
      addonCounts,
      plans,
      templates,
      bundleCatalog,
      featureCatalog,
    ] = await Promise.all([
      prisma.company.findMany({
        select: { id: true, name: true, slug: true, tenantStatus: true },
        orderBy: { name: "asc" },
      }),
      prisma.companySubscription.findMany({
        select: {
          id: true,
          companyId: true,
          status: true,
          startedAt: true,
          trialEndsAt: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          canceledAt: true,
          endedAt: true,
          updatedAt: true,
          effectiveMonthlyAmount: true,
          lastPriceComputedAt: true,
          company: { select: { name: true, slug: true, tenantStatus: true } },
          plan: {
            select: {
              code: true,
              name: true,
              currency: true,
              warningDays: true,
              graceDays: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      }),
      prisma.site.groupBy({
        by: ["companyId"],
        where: { isActive: true },
        _count: { _all: true },
      }),
      prisma.companySubscriptionAddon.groupBy({
        by: ["companyId"],
        where: { isEnabled: true },
        _count: { _all: true },
      }),
      services.subscription.listPlans(),
      services.subscription.listTemplates(),
      services.subscription.listBundleCatalog(),
      services.feature.list(),
    ]);

    const latestSubscriptionByCompany = new Map<string, LatestSubscriptionRow>();
    for (const row of subscriptionRows) {
      if (!latestSubscriptionByCompany.has(row.companyId)) {
        latestSubscriptionByCompany.set(row.companyId, row as LatestSubscriptionRow);
      }
    }

    const fallbackPricingCompanies = [...latestSubscriptionByCompany.values()]
      .filter((row) => row.effectiveMonthlyAmount === null)
      .map((row) => row.companyId);

    const fallbackPricing = new Map(
      (
        await Promise.all(
          fallbackPricingCompanies.map(async (companyId) => [companyId, await computeSubscriptionPricing(companyId)] as const),
        )
      ).map(([companyId, pricing]) => [companyId, pricing]),
    );

    const siteCountByCompany = new Map(siteCounts.map((entry) => [entry.companyId, entry._count._all]));
    const addonCountByCompany = new Map(addonCounts.map((entry) => [entry.companyId, entry._count._all]));
    const now = new Date();
    const thirtyDaysOut = new Date(now);
    thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const ninetyDaysOut = new Date(now);
    ninetyDaysOut.setDate(ninetyDaysOut.getDate() + 90);

    const workspaceRows = companies.map((company) => {
      const subscription = latestSubscriptionByCompany.get(company.id) ?? null;
      const pricing = subscription ? fallbackPricing.get(company.id) ?? null : null;
      const health = buildHealth(subscription);
      const dueBucket = resolveDueBucket(subscription, health, now);
      const riskBucket = resolveRiskBucket(subscription, health, dueBucket);

      return {
        companyId: company.id,
        companyName: company.name,
        companySlug: company.slug,
        companyStatus: company.tenantStatus,
        subscriptionId: subscription?.id ?? null,
        subscriptionStatus: subscription?.status ?? null,
        planCode: subscription?.plan?.code ?? null,
        planName: subscription?.plan?.name ?? null,
        monthlyAmount: subscription?.effectiveMonthlyAmount ?? pricing?.totalAmount ?? 0,
        currency: subscription?.plan?.currency ?? pricing?.currency ?? "USD",
        currentPeriodEnd: toIso(subscription?.currentPeriodEnd ?? subscription?.trialEndsAt ?? null),
        lastPriceComputedAt: toIso(subscription?.lastPriceComputedAt),
        pricingSource: subscription
          ? subscription.effectiveMonthlyAmount !== null
            ? "SNAPSHOT"
            : pricing
              ? "COMPUTED"
              : "NONE"
          : "NONE",
        siteCount: siteCountByCompany.get(company.id) ?? 0,
        addonCount: addonCountByCompany.get(company.id) ?? 0,
        healthState: health.state,
        healthReason: health.reason,
        shouldBlock: health.shouldBlock,
        daysUntilEnd: health.daysUntilEnd,
        daysOverdue: health.daysOverdue,
        dueBucket,
        riskBucket,
      };
    });

    const dueNow = workspaceRows
      .filter((row) => row.dueBucket === "OVERDUE" || row.dueBucket === "DUE_THIS_MONTH")
      .sort((left, right) => {
        const overdueDelta = (right.daysOverdue ?? -1) - (left.daysOverdue ?? -1);
        if (overdueDelta !== 0) return overdueDelta;
        return (left.daysUntilEnd ?? 999) - (right.daysUntilEnd ?? 999);
      });

    const renewals = workspaceRows
      .filter((row) => {
        if (!row.currentPeriodEnd || row.subscriptionStatus === "CANCELED" || row.subscriptionStatus === "EXPIRED") {
          return false;
        }
        const anchorDate = new Date(row.currentPeriodEnd);
        return anchorDate >= now && anchorDate <= ninetyDaysOut;
      })
      .sort((left, right) => (left.daysUntilEnd ?? 999) - (right.daysUntilEnd ?? 999));

    const committedRows = workspaceRows.filter(
      (row) =>
        row.subscriptionId &&
        row.monthlyAmount > 0 &&
        row.subscriptionStatus !== "CANCELED" &&
        row.subscriptionStatus !== "EXPIRED",
    );

    const summary = {
      workspaceCount: workspaceRows.length,
      subscribedWorkspaceCount: workspaceRows.filter((row) => row.subscriptionId).length,
      committedMrr: committedRows.reduce((sum, row) => sum + row.monthlyAmount, 0),
      dueThisMonth: workspaceRows
        .filter((row) => row.dueBucket === "DUE_THIS_MONTH")
        .reduce((sum, row) => sum + row.monthlyAmount, 0),
      overdueExposure: workspaceRows
        .filter((row) => row.dueBucket === "OVERDUE")
        .reduce((sum, row) => sum + row.monthlyAmount, 0),
      atRiskRevenue: workspaceRows
        .filter((row) => row.riskBucket === "AT_RISK" || row.riskBucket === "OVERDUE")
        .reduce((sum, row) => sum + row.monthlyAmount, 0),
      next30RenewalCount: renewals.filter((row) => {
        if (!row.currentPeriodEnd) return false;
        const date = new Date(row.currentPeriodEnd);
        return date <= thirtyDaysOut;
      }).length,
      next30RenewalValue: renewals
        .filter((row) => {
          if (!row.currentPeriodEnd) return false;
          const date = new Date(row.currentPeriodEnd);
          return date <= thirtyDaysOut;
        })
        .reduce((sum, row) => sum + row.monthlyAmount, 0),
    };

    const committedBaseline = committedRows.reduce(
      (sum, row) => sum + row.monthlyAmount,
      0,
    );
    const projectionHorizonMonths = 12;

    const projections = Array.from(
      { length: projectionHorizonMonths },
      (_, index) => {
        const monthStart = addMonths(startOfMonth(now), index);
        const monthEnd = endOfMonth(monthStart);
        const renewableRows = committedRows.filter((row) => {
          if (!row.currentPeriodEnd) return false;
          const periodEnd = new Date(row.currentPeriodEnd);
          return periodEnd >= monthStart && periodEnd <= monthEnd;
        });
        const renewalPressure = renewableRows.length / Math.max(committedRows.length, 1);
        const committedAmount = Math.max(
          committedBaseline * 0.72,
          committedBaseline * (1 - renewalPressure * 0.08 - index * 0.004),
        );
        const atRiskAmount = Math.min(
          committedAmount * 0.92,
          committedRows.reduce((sum, row) => {
            let weight = 0.08;
            if (row.riskBucket === "AT_RISK") weight = 0.36;
            if (row.riskBucket === "OVERDUE") weight = 0.62;
            if (row.riskBucket === "MISSING") weight = 0.45;

            if (row.subscriptionStatus === "PAST_DUE") {
              weight += 0.1;
            }

            if (row.currentPeriodEnd) {
              const periodEnd = new Date(row.currentPeriodEnd);
              const monthsUntilRenewal =
                (periodEnd.getFullYear() - monthStart.getFullYear()) * 12 +
                (periodEnd.getMonth() - monthStart.getMonth());
              if (monthsUntilRenewal < 0) weight += 0.18;
              if (monthsUntilRenewal === 0) weight += 0.16;
              if (monthsUntilRenewal === 1) weight += 0.1;
              if (monthsUntilRenewal >= 4) weight -= 0.03;
            } else {
              weight += 0.12;
            }

            const normalizedWeight = Math.max(0.06, Math.min(weight, 0.9));
            return sum + row.monthlyAmount * normalizedWeight;
          }, 0),
        );

        return {
          id: monthStart.toISOString(),
          label: monthLabel(monthStart),
          monthStart: monthStart.toISOString(),
          committedAmount,
          atRiskAmount,
          workspaceCount: Math.max(
            0,
            Math.round(
              committedRows.length - renewalPressure * 2 - index * 0.3,
            ),
          ),
        };
      },
    );

    const planMix = [...committedRows.reduce((map, row) => {
      const key = row.planCode ?? "UNASSIGNED";
      const current = map.get(key) ?? {
        planCode: key,
        planName: row.planName ?? "Unassigned",
        workspaceCount: 0,
        monthlyAmount: 0,
      };
      current.workspaceCount += 1;
      current.monthlyAmount += row.monthlyAmount;
      map.set(key, current);
      return map;
    }, new Map<string, { planCode: string; planName: string; workspaceCount: number; monthlyAmount: number }>()).values()]
      .sort((left, right) => right.monthlyAmount - left.monthlyAmount);

    const subscriptions = [...latestSubscriptionByCompany.values()]
      .map((row) => ({
        id: row.id,
        companyId: row.companyId,
        companyName: row.company?.name ?? null,
        companySlug: row.company?.slug ?? null,
        status: row.status as import("@/scripts/platform/types").SubscriptionSummary["status"],
        planCode: row.plan?.code ?? null,
        planName: row.plan?.name ?? null,
        startedAt: toIso(row.startedAt),
        currentPeriodStart: toIso(row.currentPeriodStart),
        currentPeriodEnd: toIso(row.currentPeriodEnd),
        trialEndsAt: toIso(row.trialEndsAt),
        canceledAt: toIso(row.canceledAt),
        endedAt: toIso(row.endedAt),
        updatedAt: toIso(row.updatedAt),
      }))
      .sort((left, right) => (left.companyName ?? left.companyId).localeCompare(right.companyName ?? right.companyId));

    return NextResponse.json({
      subscriptions,
      plans,
      templates,
      bundleCatalog,
      featureCatalog,
      overview: {
        summary,
        projections,
        planMix,
        workspaces: workspaceRows,
        dueNow,
        renewals,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load commercial center";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
