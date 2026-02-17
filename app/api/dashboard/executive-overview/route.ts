import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import {
  calculateDelta,
  getExecutiveDashboardAggregations,
} from "@/lib/dashboard/executive-aggregations";
import {
  EXECUTIVE_FULL_VIEW_ROLES,
  EXECUTIVE_MAX_QUICK_LINKS,
  getQuickLinkBasePriority,
  getQuickLinkModule,
  parseExecutiveDashboardRange,
} from "@/lib/dashboard/executive-config";
import { getNavSectionsForRole } from "@/lib/navigation";
import { prisma } from "@/lib/prisma";
import { filterNavSectionsByEnabledFeatures } from "@/lib/platform/gating/nav-filter";
import { hasTokenFeature } from "@/lib/platform/gating/token-check";
import { hasRole, type UserRole } from "@/lib/roles";

type QuickLinkCandidate = {
  href: string;
  label: string;
  isPrimaryQuickAction?: boolean;
  primaryOrder?: number;
};

function canAccess(
  role: string | null | undefined,
  enabledFeatures: string[] | undefined,
  allowedRoles: UserRole[],
  requiredFeatures: string[],
) {
  if (!hasRole(role, allowedRoles)) return false;
  return requiredFeatures.every((feature) => hasTokenFeature(enabledFeatures, feature));
}

function canAccessAnyFeature(
  enabledFeatures: string[] | undefined,
  features: string[],
) {
  return features.some((feature) => hasTokenFeature(enabledFeatures, feature));
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const role = session.user.role;
    const enabledFeatures = session.user.enabledFeatures;

    const { searchParams } = new URL(request.url);
    const range = parseExecutiveDashboardRange(searchParams.get("range"));
    const requestedSiteId = (searchParams.get("siteId") ?? "all").trim() || "all";

    if (requestedSiteId !== "all" && !isValidUUID(requestedSiteId)) {
      return errorResponse("Invalid siteId. Expected 'all' or a UUID.", 400);
    }

    const sites = await prisma.site.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    });

    const siteId = requestedSiteId === "all" ? null : requestedSiteId;
    if (siteId && !sites.some((site) => site.id === siteId)) {
      return errorResponse("Invalid site for current company", 403);
    }

    const aggregations = await getExecutiveDashboardAggregations({
      companyId: session.user.companyId,
      siteId,
      range,
    });

    const metrics = aggregations.metrics;

    const fullView = hasRole(role, EXECUTIVE_FULL_VIEW_ROLES);

    const kpiCandidates = [
      {
        id: "cash-position",
        label: "Cash Position",
        value: metrics.cashPosition,
        unit: "USD",
        module: "finance",
        tone: metrics.cashPosition < 0 ? "critical" : "positive",
        delta: calculateDelta(metrics.cashPosition, metrics.previousCashPosition),
        requiredFeatures: ["accounting.banking"],
      },
      {
        id: "near-term-net",
        label: "Near-Term Net Position",
        value: metrics.nearTermNetPosition,
        unit: "USD",
        module: "finance",
        tone: metrics.nearTermNetPosition < 0 ? "warning" : "positive",
        requiredFeatures: ["accounting.ar", "accounting.ap"],
      },
      {
        id: "gold-produced",
        label: "Gold Produced",
        value: metrics.goldProducedWeight,
        unit: "g",
        module: "gold",
        delta: calculateDelta(metrics.goldProducedWeight, metrics.previousGoldProducedWeight),
        requiredFeatures: ["gold.intake.pours"],
      },
      {
        id: "gold-realized",
        label: "Gold Realized Value",
        value: metrics.goldRealizedValue,
        unit: "USD",
        module: "gold",
        delta: calculateDelta(metrics.goldRealizedValue, metrics.previousGoldRealizedValue),
        requiredFeatures: ["gold.receipts"],
      },
      {
        id: "active-workers",
        label: "Active Workers",
        value: metrics.activeWorkers,
        module: "workforce",
        requiredFeatures: ["hr.employees"],
      },
      {
        id: "workforce-liability",
        label: "Workforce Liability",
        value: metrics.workforceLiability,
        unit: "USD",
        module: "workforce",
        tone: metrics.workforceLiability > 0 ? "warning" : "positive",
        requiredFeatures: ["hr.salaries"],
      },
      {
        id: "plant-throughput",
        label: "Plant Throughput",
        value: metrics.plantThroughput,
        unit: "t",
        module: "operations",
        delta: calculateDelta(metrics.plantThroughput, metrics.previousPlantThroughput),
        requiredFeatures: ["ops.plant-report.submit"],
      },
      {
        id: "total-risk",
        label: "Total Risk Items",
        value: metrics.totalRiskItems,
        module: "operations",
        tone: metrics.totalRiskItems > 0 ? "warning" : "positive",
        requiredFeatures: ["reports.dashboard"],
      },
      {
        id: "pending-approvals",
        label: "Pending Approvals",
        value: metrics.pendingPayrollApprovals + metrics.pendingDisbursements,
        module: "workforce",
        tone:
          metrics.pendingPayrollApprovals + metrics.pendingDisbursements > 0
            ? "warning"
            : "positive",
        requiredFeatures: ["hr.approvals-history"],
      },
    ];

    const kpis = kpiCandidates
      .filter((kpi) =>
        canAccess(role, enabledFeatures, EXECUTIVE_FULL_VIEW_ROLES, kpi.requiredFeatures),
      )
      .map((kpi) => ({
        id: kpi.id,
        label: kpi.label,
        value: kpi.value,
        unit: kpi.unit,
        module: kpi.module,
        tone: kpi.tone,
        delta: kpi.delta,
      }));

    const highlightCandidates = [
      {
        id: "dispatches-pending-receipt",
        title: "Dispatches pending receipt",
        description:
          "Gold dispatched but not yet receipted by buyers. Escalate custody follow-up to settlement.",
        value: metrics.dispatchPendingReceipt,
        tone: metrics.dispatchPendingReceipt > 0 ? "warning" : "positive",
        requiredFeatures: ["gold.receipts"],
      },
      {
        id: "workforce-owed-breakdown",
        title: "Workforce obligations",
        description: "Outstanding salary and gold payout obligations across all active workers.",
        valueLabel: `Salary USD ${metrics.salaryOwed.toLocaleString()} | Gold USD ${metrics.goldPayoutOwed.toLocaleString()}`,
        tone: metrics.workforceLiability > 0 ? "warning" : "positive",
        requiredFeatures: ["hr.salaries"],
      },
      {
        id: "compliance-pressure",
        title: "Compliance pressure",
        description: "Open incidents and permits expiring in the next 30 days.",
        value: metrics.openComplianceIncidents + metrics.permitsExpiring30Days,
        tone:
          metrics.openComplianceIncidents + metrics.permitsExpiring30Days > 0
            ? "critical"
            : "positive",
        requiredFeatures: ["compliance.incidents"],
      },
      {
        id: "security-events",
        title: "Critical CCTV events",
        description: "High/critical unacknowledged CCTV events in selected range.",
        value: metrics.criticalUnackedCctvEvents,
        tone: metrics.criticalUnackedCctvEvents > 0 ? "critical" : "positive",
        requiredFeatures: ["cctv.events"],
      },
      {
        id: "inventory-pressure",
        title: "Inventory pressure",
        description: "Items at or below minimum stock threshold.",
        value: metrics.lowStockItems,
        tone: metrics.lowStockItems > 0 ? "warning" : "positive",
        requiredFeatures: ["stores.inventory"],
      },
    ];

    const highlights = highlightCandidates
      .filter((highlight) =>
        canAccess(role, enabledFeatures, EXECUTIVE_FULL_VIEW_ROLES, highlight.requiredFeatures),
      )
      .map((highlight) => ({
        id: highlight.id,
        title: highlight.title,
        description: highlight.description,
        value: highlight.value,
        valueLabel: highlight.valueLabel,
        tone: highlight.tone,
      }));

    const charts = {
      goldTrend: canAccessAnyFeature(enabledFeatures, ["gold.intake.pours", "reports.gold-chain"])
        ? aggregations.charts.goldTrend
        : [],
      cashTrend: canAccessAnyFeature(enabledFeatures, ["accounting.banking"])
        ? aggregations.charts.cashTrend
        : [],
      throughputTrend: canAccessAnyFeature(enabledFeatures, ["ops.plant-report.submit", "reports.plant"])
        ? aggregations.charts.throughputTrend
        : [],
      riskBreakdown: canAccessAnyFeature(enabledFeatures, ["reports.dashboard"])
        ? aggregations.charts.riskBreakdown
        : [],
    };

    const roleSections = getNavSectionsForRole(role);
    const authorizedSections = filterNavSectionsByEnabledFeatures(roleSections, enabledFeatures);
    const sidebarQuickActions = authorizedSections.find((section) => section.id === "daily")?.items ?? [];

    const quickLinkCandidates: QuickLinkCandidate[] = [];
    const seen = new Set<string>();

    sidebarQuickActions.forEach((action, index) => {
      if (seen.has(action.href)) return;
      seen.add(action.href);
      quickLinkCandidates.push({
        href: action.href,
        label: action.label,
        isPrimaryQuickAction: true,
        primaryOrder: index,
      });
    });

    for (const section of authorizedSections) {
      for (const item of section.items) {
        if (item.href === "/" || item.href === "/help") continue;
        if (seen.has(item.href)) continue;
        seen.add(item.href);
        quickLinkCandidates.push({
          href: item.href,
          label: item.label,
        });
      }
    }

    const quickLinks = quickLinkCandidates
      .map((link) => {
        const badge = aggregations.quickLinkBadges[link.href];
        const badgeCount = badge?.count ?? 0;
        const priority = getQuickLinkBasePriority(link.href) + Math.min(40, badgeCount) * 2;

        return {
          href: link.href,
          label: link.label,
          module: getQuickLinkModule(link.href),
          priority,
          badgeCount: badgeCount > 0 ? badgeCount : undefined,
          badgeLabel: badge?.label,
          isPrimary: Boolean(link.isPrimaryQuickAction),
          primaryOrder: link.primaryOrder,
        };
      })
      .sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        if (a.isPrimary && b.isPrimary) {
          return (a.primaryOrder ?? Number.MAX_SAFE_INTEGER) - (b.primaryOrder ?? Number.MAX_SAFE_INTEGER);
        }
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.label.localeCompare(b.label);
      })
      .slice(0, fullView ? EXECUTIVE_MAX_QUICK_LINKS : 8);

    return successResponse({
      generatedAt: aggregations.generatedAt,
      range,
      siteId: siteId ?? "all",
      fullView,
      window: aggregations.window,
      sites,
      kpis,
      charts,
      highlights,
      quickLinks,
    });
  } catch (error) {
    console.error("[API] GET /api/dashboard/executive-overview error:", error);
    return errorResponse("Failed to fetch executive dashboard overview");
  }
}
