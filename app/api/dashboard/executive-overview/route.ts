import { NextRequest, NextResponse } from "next/server";
import type { ExecutiveModuleSummary, ExecutiveSummaryMetric } from "@/lib/api";
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
  getQuickLinkBasePriority,
  getQuickLinkModule,
  parseExecutiveDashboardRange,
} from "@/lib/dashboard/executive-config";
import {
  EXECUTIVE_MODULE_ORDER,
  scoreExecutiveModuleStatus,
  type ExecutiveModuleKey,
} from "@/lib/dashboard/executive-thresholds";
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

type ExecutiveModuleAccessConfig = {
  visibilityFeatures: string[];
  reportTargets: Array<{ href: string; feature: string }>;
};

type ExceptionSignal = {
  label: string;
  value: number;
};

const EXECUTIVE_MODULE_ACCESS_CONFIG: Record<ExecutiveModuleKey, ExecutiveModuleAccessConfig> = {
  finance: {
    visibilityFeatures: ["accounting.banking", "accounting.ar", "accounting.ap"],
    reportTargets: [
      { href: "/accounting/banking", feature: "accounting.banking" },
      { href: "/accounting/sales", feature: "accounting.ar" },
      { href: "/accounting/purchases", feature: "accounting.ap" },
    ],
  },
  gold: {
    visibilityFeatures: ["gold.intake.pours", "gold.receipts", "reports.gold-chain"],
    reportTargets: [
      { href: "/reports/gold-chain", feature: "reports.gold-chain" },
      { href: "/gold/settlement/receipts", feature: "gold.receipts" },
      { href: "/gold/intake/pours", feature: "gold.intake.pours" },
    ],
  },
  workforce: {
    visibilityFeatures: ["hr.employees", "hr.salaries", "hr.approvals-history"],
    reportTargets: [
      { href: "/human-resources/approvals", feature: "hr.approvals-history" },
      { href: "/human-resources/salaries", feature: "hr.salaries" },
      { href: "/human-resources", feature: "hr.employees" },
    ],
  },
  operations: {
    visibilityFeatures: ["ops.plant-report.submit", "reports.plant", "reports.dashboard"],
    reportTargets: [
      { href: "/reports/plant", feature: "reports.plant" },
      { href: "/plant-report", feature: "ops.plant-report.submit" },
      { href: "/reports", feature: "reports.dashboard" },
    ],
  },
  stores: {
    visibilityFeatures: ["stores.inventory", "reports.stores-movements"],
    reportTargets: [
      { href: "/stores/inventory", feature: "stores.inventory" },
      { href: "/reports/stores-movements", feature: "reports.stores-movements" },
    ],
  },
  maintenance: {
    visibilityFeatures: ["maintenance.work-orders", "reports.maintenance-work-orders"],
    reportTargets: [
      { href: "/maintenance/work-orders", feature: "maintenance.work-orders" },
      { href: "/reports/maintenance-work-orders", feature: "reports.maintenance-work-orders" },
    ],
  },
  compliance: {
    visibilityFeatures: ["compliance.incidents", "reports.compliance-incidents"],
    reportTargets: [
      { href: "/reports/compliance-incidents", feature: "reports.compliance-incidents" },
      { href: "/compliance", feature: "compliance.incidents" },
    ],
  },
  security: {
    visibilityFeatures: ["cctv.events", "reports.cctv-events"],
    reportTargets: [
      { href: "/cctv/events", feature: "cctv.events" },
      { href: "/reports/cctv-events", feature: "reports.cctv-events" },
    ],
  },
  reports: {
    visibilityFeatures: ["reports.dashboard"],
    reportTargets: [{ href: "/reports", feature: "reports.dashboard" }],
  },
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

function toExceptionCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function createSummaryMetric(
  label: string,
  value: number,
  options: { unit?: string; valueLabel?: string } = {},
): ExecutiveSummaryMetric {
  return {
    label,
    value,
    unit: options.unit,
    valueLabel: options.valueLabel,
  };
}

function pickTopExceptionLabel(signals: ExceptionSignal[]): string | undefined {
  const topSignal = [...signals]
    .filter((signal) => signal.value > 0)
    .sort((a, b) => {
      if (b.value !== a.value) return b.value - a.value;
      return a.label.localeCompare(b.label);
    })[0];

  return topSignal?.label;
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
    const pendingApprovals = metrics.pendingPayrollApprovals + metrics.pendingDisbursements;

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
        id: "gold-produced-value",
        label: "Gold Produced Value",
        value: metrics.goldProducedValue,
        unit: "USD",
        module: "gold",
        delta: calculateDelta(metrics.goldProducedValue, metrics.previousGoldProducedValue),
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
        id: "salary-owed",
        label: "Salary Owed",
        value: metrics.salaryOwed,
        unit: "USD",
        module: "workforce",
        tone: metrics.salaryOwed > 0 ? "warning" : "positive",
        requiredFeatures: ["hr.salaries"],
      },
      {
        id: "gold-payout-owed",
        label: "Gold Payout Owed",
        value: metrics.goldPayoutOwed,
        unit: "USD",
        module: "workforce",
        tone: metrics.goldPayoutOwed > 0 ? "warning" : "positive",
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
        value: pendingApprovals,
        module: "workforce",
        tone: pendingApprovals > 0 ? "warning" : "positive",
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
        id: "salary-obligations",
        title: "Salary obligations",
        description: "Outstanding salary obligations across all active workers.",
        value: metrics.salaryOwed,
        unit: "USD",
        tone: metrics.salaryOwed > 0 ? "warning" : "positive",
        requiredFeatures: ["hr.salaries"],
      },
      {
        id: "gold-obligations",
        title: "Gold obligations",
        description: "Outstanding gold payout obligations across all active workers.",
        value: metrics.goldPayoutOwed,
        unit: "USD",
        tone: metrics.goldPayoutOwed > 0 ? "warning" : "positive",
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
        valueLabel: "valueLabel" in highlight ? highlight.valueLabel : undefined,
        unit: "unit" in highlight ? highlight.unit : undefined,
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

    const canAccessExecutiveModule = (module: ExecutiveModuleKey) => {
      if (!fullView) return false;
      const { visibilityFeatures } = EXECUTIVE_MODULE_ACCESS_CONFIG[module];
      return canAccessAnyFeature(enabledFeatures, visibilityFeatures);
    };

    const getModuleReportHref = (module: ExecutiveModuleKey) => {
      const reportTarget = EXECUTIVE_MODULE_ACCESS_CONFIG[module].reportTargets.find((target) =>
        hasTokenFeature(enabledFeatures, target.feature),
      );
      return reportTarget?.href ?? EXECUTIVE_MODULE_ACCESS_CONFIG[module].reportTargets[0]?.href ?? "/";
    };

    const topRiskBreakdown = [...aggregations.charts.riskBreakdown]
      .filter((point) => point.value > 0)
      .sort((a, b) => {
        if (b.value !== a.value) return b.value - a.value;
        return a.label.localeCompare(b.label);
      })[0];

    const financeSignals: ExceptionSignal[] = [
      {
        label: "Negative cash position",
        value: metrics.cashPosition < 0 ? Math.abs(metrics.cashPosition) : 0,
      },
      {
        label: "Near-term liabilities exceed receivables",
        value: metrics.nearTermNetPosition < 0 ? Math.abs(metrics.nearTermNetPosition) : 0,
      },
      {
        label: "Open payables exceed open receivables",
        value: metrics.openPayables > metrics.openReceivables
          ? metrics.openPayables - metrics.openReceivables
          : 0,
      },
    ];

    const financeOpenExceptions = financeSignals.filter((signal) => signal.value > 0).length;

    const goldSignals: ExceptionSignal[] = [
      { label: "Dispatches pending buyer receipt", value: metrics.dispatchPendingReceipt },
    ];

    const workforceSignals: ExceptionSignal[] = [
      {
        label: "Pending payroll and disbursement approvals",
        value: pendingApprovals,
      },
      {
        label: "Outstanding workforce liability",
        value: metrics.workforceLiability > 0 ? metrics.workforceLiability : 0,
      },
    ];

    const complianceSignals: ExceptionSignal[] = [
      {
        label: "Open compliance incidents",
        value: metrics.openComplianceIncidents,
      },
      {
        label: "Permits expiring within 30 days",
        value: metrics.permitsExpiring30Days,
      },
    ];

    const executiveSummaryCandidates: Record<
      ExecutiveModuleKey,
      Omit<ExecutiveModuleSummary, "module" | "status">
    > = {
      finance: {
        primaryMetric: createSummaryMetric("Cash Position", metrics.cashPosition, { unit: "USD" }),
        secondaryMetric: createSummaryMetric("Near-Term Net Position", metrics.nearTermNetPosition, {
          unit: "USD",
        }),
        tertiaryMetric: createSummaryMetric("Open Receivables", metrics.openReceivables, { unit: "USD" }),
        openExceptions: toExceptionCount(financeOpenExceptions),
        trendDelta: calculateDelta(metrics.cashPosition, metrics.previousCashPosition),
        topExceptionLabel: pickTopExceptionLabel(financeSignals),
        reportHref: getModuleReportHref("finance"),
      },
      gold: {
        primaryMetric: createSummaryMetric("Gold Produced Value", metrics.goldProducedValue, {
          unit: "USD",
        }),
        secondaryMetric: createSummaryMetric("Gold Realized Value", metrics.goldRealizedValue, {
          unit: "USD",
        }),
        tertiaryMetric: createSummaryMetric("Dispatches Pending Receipt", metrics.dispatchPendingReceipt),
        openExceptions: toExceptionCount(metrics.dispatchPendingReceipt),
        trendDelta: calculateDelta(metrics.goldProducedValue, metrics.previousGoldProducedValue),
        topExceptionLabel: pickTopExceptionLabel(goldSignals),
        reportHref: getModuleReportHref("gold"),
      },
      workforce: {
        primaryMetric: createSummaryMetric("Active Workers", metrics.activeWorkers),
        secondaryMetric: createSummaryMetric("Salary Owed", metrics.salaryOwed, {
          unit: "USD",
        }),
        tertiaryMetric: createSummaryMetric("Gold Payout Owed", metrics.goldPayoutOwed, {
          unit: "USD",
        }),
        openExceptions: toExceptionCount(pendingApprovals + (metrics.workforceLiability > 0 ? 1 : 0)),
        topExceptionLabel: pickTopExceptionLabel(workforceSignals),
        reportHref: getModuleReportHref("workforce"),
      },
      operations: {
        primaryMetric: createSummaryMetric("Plant Throughput", metrics.plantThroughput, { unit: "t" }),
        secondaryMetric: createSummaryMetric("Total Risk Items", metrics.totalRiskItems),
        tertiaryMetric: createSummaryMetric("Dispatches Pending Receipt", metrics.dispatchPendingReceipt),
        openExceptions: toExceptionCount(metrics.totalRiskItems),
        trendDelta: calculateDelta(metrics.plantThroughput, metrics.previousPlantThroughput),
        topExceptionLabel: topRiskBreakdown?.label,
        reportHref: getModuleReportHref("operations"),
      },
      stores: {
        primaryMetric: createSummaryMetric("Low Stock Items", metrics.lowStockItems),
        secondaryMetric: createSummaryMetric("Open Receivables", metrics.openReceivables, { unit: "USD" }),
        openExceptions: toExceptionCount(metrics.lowStockItems),
        topExceptionLabel: metrics.lowStockItems > 0 ? "Items below minimum stock" : undefined,
        reportHref: getModuleReportHref("stores"),
      },
      maintenance: {
        primaryMetric: createSummaryMetric("Open Work Orders", metrics.openWorkOrders),
        secondaryMetric: createSummaryMetric("Total Risk Items", metrics.totalRiskItems),
        openExceptions: toExceptionCount(metrics.openWorkOrders),
        topExceptionLabel: metrics.openWorkOrders > 0 ? "Open work orders pending closure" : undefined,
        reportHref: getModuleReportHref("maintenance"),
      },
      compliance: {
        primaryMetric: createSummaryMetric("Open Compliance Incidents", metrics.openComplianceIncidents),
        secondaryMetric: createSummaryMetric("Permits Expiring (30d)", metrics.permitsExpiring30Days),
        tertiaryMetric: createSummaryMetric(
          "Compliance Pressure",
          metrics.openComplianceIncidents + metrics.permitsExpiring30Days,
        ),
        openExceptions: toExceptionCount(metrics.openComplianceIncidents + metrics.permitsExpiring30Days),
        topExceptionLabel: pickTopExceptionLabel(complianceSignals),
        reportHref: getModuleReportHref("compliance"),
      },
      security: {
        primaryMetric: createSummaryMetric("Critical Unacknowledged Events", metrics.criticalUnackedCctvEvents),
        secondaryMetric: createSummaryMetric("Total Risk Items", metrics.totalRiskItems),
        openExceptions: toExceptionCount(metrics.criticalUnackedCctvEvents),
        topExceptionLabel: metrics.criticalUnackedCctvEvents > 0 ? "Critical CCTV events pending acknowledgement" : undefined,
        reportHref: getModuleReportHref("security"),
      },
      reports: {
        primaryMetric: createSummaryMetric("Total Risk Items", metrics.totalRiskItems),
        secondaryMetric: createSummaryMetric("Open Work Orders", metrics.openWorkOrders),
        tertiaryMetric: createSummaryMetric("Pending Approvals", pendingApprovals),
        openExceptions: toExceptionCount(metrics.totalRiskItems),
        topExceptionLabel: topRiskBreakdown?.label,
        reportHref: getModuleReportHref("reports"),
      },
    };

    const executiveSummary: ExecutiveModuleSummary[] = EXECUTIVE_MODULE_ORDER
      .filter((module) => canAccessExecutiveModule(module))
      .map((module) => {
        const summary = executiveSummaryCandidates[module];
        return {
          module,
          status: scoreExecutiveModuleStatus(module, summary.openExceptions),
          ...summary,
        };
      });

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
      });

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
      executiveSummary,
      quickLinks,
    });
  } catch (error) {
    console.error("[API] GET /api/dashboard/executive-overview error:", error);
    return errorResponse("Failed to fetch executive dashboard overview");
  }
}
