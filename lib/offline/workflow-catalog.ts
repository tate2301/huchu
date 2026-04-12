import { HR_TABS } from "@/lib/hr/tab-config";
import { SCRAP_TABS } from "@/lib/scrap-metal/tab-config";
import type {
  OfflineMutationPolicy,
  OfflineWorkflowCatalogEntry,
} from "@/lib/offline/types";

function routeMatches(pathname: string, candidate: string) {
  return pathname === candidate || pathname.startsWith(`${candidate}/`);
}

function warmRouteMatches(pathname: string, candidate: string) {
  if (candidate.endsWith("/*")) {
    const base = candidate.slice(0, -2);
    return pathname === base || pathname.startsWith(`${base}/`);
  }
  return pathname === candidate;
}

const OFFLINE_EXCLUDED_ROUTE_REASONS: Record<string, string> = {
  "/accounting": "Accounting workflows are intentionally excluded from the current offline scope.",
  "/scrap-metal/settlements":
    "Scrap settlement workflows require tighter server coordination and are excluded.",
  "/human-resources/payouts":
    "HR settlement workflows are intentionally excluded from the current offline scope.",
};

const SCRAP_OPERATOR_ROUTES = SCRAP_TABS.filter((tab) =>
  tab.roles?.includes("OPERATOR"),
)
  .map((tab) => tab.href)
  .filter((href) => href !== "/scrap-metal/settlements");

const SCRAP_REPORT_ROUTES = [
  "/scrap-metal/reports",
  "/scrap-metal/reports/daily-snapshot",
  "/scrap-metal/reports/supplier-performance",
  "/scrap-metal/reports/variance-aging",
];

const HR_MINIMAL_ROUTES = HR_TABS.filter((tab) =>
  ["/human-resources", "/human-resources/shift-groups", "/human-resources/incidents"].includes(
    tab.href,
  ),
).map((tab) => tab.href);

export const OFFLINE_WORKFLOW_CATALOG: OfflineWorkflowCatalogEntry[] = [
  {
    workflowId: "scrap-operator-core",
    vertical: "SCRAP_METAL",
    audience: "OPERATOR",
    warmupScope: "required",
    routes: SCRAP_OPERATOR_ROUTES.filter((route) => !SCRAP_REPORT_ROUTES.includes(route)),
    queryKeys: [
      "sites",
      "employees",
      "scrap-materials",
      "scrap-sellers",
      "scrap-prices",
      "scrap-batches",
      "scrap-held-inbound-total",
      "scrap-held-outbound-total",
      "scrap-held-inbound-tickets",
      "scrap-held-outbound-tickets",
      "scrap-metal-purchases",
      "scrap-metal-sales",
      "scrap-ready-batches",
      "scrap-unassigned-purchases-page",
      "scrap-adjustment-register",
    ],
    moduleIds: ["scrap-metal", "scrap-lots"],
    excludedRoutes: ["/scrap-metal/settlements", "/scrap-metal/sales/approval-requests"],
  },
  {
    workflowId: "scrap-operator-reports",
    vertical: "SCRAP_METAL",
    audience: "OPERATOR",
    warmupScope: "snapshot",
    routes: SCRAP_REPORT_ROUTES,
    queryKeys: [
      "scrap-home-daily-snapshot",
      "scrap-dashboard-reporting",
      "scrap-daily-snapshot",
      "scrap-supplier-performance",
      "scrap-variance-report",
      "scrap-aging-report",
    ],
    moduleIds: ["scrap-reports-snapshot"],
    excludedRoutes: ["/scrap-metal/settlements"],
  },
  {
    workflowId: "hr-workforce-minimal",
    vertical: "HR",
    audience: "OPERATOR",
    warmupScope: "required",
    routes: HR_MINIMAL_ROUTES,
    queryKeys: [
      "employees",
      "sites",
      "shift-groups",
      "shift-group-schedules",
      "hr-incidents",
      "disciplinary-actions",
    ],
    moduleIds: ["hr-workforce-core"],
    excludedRoutes: ["/human-resources/payouts"],
  },
];

function hasScrapFeature(features: Set<string>) {
  return [...features].some((feature) => feature.startsWith("scrap-metal."));
}

function hasHrMinimalFeature(features: Set<string>) {
  return (
    features.has("hr.employees") ||
    features.has("hr.shift-groups") ||
    features.has("hr.incidents") ||
    features.has("hr.disciplinary-actions")
  );
}

export function resolveOfflineWorkflowCatalog(enabledFeatures?: string[]) {
  const features = new Set(enabledFeatures ?? []);
  return OFFLINE_WORKFLOW_CATALOG.filter((entry) => {
    if (entry.vertical === "SCRAP_METAL") {
      return hasScrapFeature(features);
    }
    if (entry.vertical === "HR") {
      return hasHrMinimalFeature(features);
    }
    return false;
  });
}

export function getOfflineWarmupModuleIds(enabledFeatures?: string[]) {
  const catalog = resolveOfflineWorkflowCatalog(enabledFeatures);
  return [...new Set(catalog.flatMap((entry) => entry.moduleIds))];
}

export function getOfflineWarmupRoutes(enabledFeatures?: string[]) {
  const catalog = resolveOfflineWorkflowCatalog(enabledFeatures);
  return [...new Set(catalog.flatMap((entry) => entry.routes))];
}

export function filterRoutesToOfflineWarmupScope(
  routes: string[],
  enabledFeatures?: string[],
) {
  const allowed = new Set(getOfflineWarmupRoutes(enabledFeatures));
  return routes.filter((route) => allowed.has(route));
}

export function getOfflineExcludedRouteReason(pathname: string) {
  for (const [route, reason] of Object.entries(OFFLINE_EXCLUDED_ROUTE_REASONS)) {
    if (routeMatches(pathname, route)) {
      return reason;
    }
  }
  return null;
}

export function isRouteExcludedFromOffline(pathname: string) {
  return getOfflineExcludedRouteReason(pathname) !== null;
}

export function isRouteWarmedForOffline(pathname: string, enabledFeatures?: string[]) {
  return getOfflineWarmupRoutes(enabledFeatures).some((route) =>
    warmRouteMatches(pathname, route),
  );
}

export function getRouteOfflineMutationPolicy(pathname: string): OfflineMutationPolicy {
  if (isRouteExcludedFromOffline(pathname)) {
    return "excluded";
  }
  if (routeMatches(pathname, "/scrap-metal/tickets")) {
    return "offline-safe";
  }
  if (pathname.startsWith("/scrap-metal") || pathname.startsWith("/human-resources")) {
    return "online-only";
  }
  return "online-only";
}

export function getOfflineRouteAvailability(
  pathname: string,
  enabledFeatures?: string[],
) {
  const excludedReason = getOfflineExcludedRouteReason(pathname);
  if (excludedReason) {
    return {
      availability: "excluded" as const,
      reason: excludedReason,
    };
  }

  if (isRouteWarmedForOffline(pathname, enabledFeatures)) {
    return {
      availability: "warmed" as const,
      reason: null,
    };
  }

  if (pathname.startsWith("/scrap-metal") || pathname.startsWith("/human-resources")) {
    return {
      availability: "online-only" as const,
      reason: "This workflow is available online only and is not part of the warmed offline scope for this user.",
    };
  }

  return {
    availability: "outside-scope" as const,
    reason: null,
  };
}
