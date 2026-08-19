import { PEOPLE_TABS } from "@/lib/people/tab-config";
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
  "/gold/settlement/approvals":
    "Settlement approvals need tighter server coordination and are excluded.",
};

const PEOPLE_MINIMAL_ROUTES = PEOPLE_TABS.filter((tab) =>
  ["/people", "/people/rosters", "/people/incidents"].includes(
    tab.href,
  ),
).map((tab) => tab.href);

export const OFFLINE_WORKFLOW_CATALOG: OfflineWorkflowCatalogEntry[] = [
  {
    workflowId: "hr-workforce-minimal",
    vertical: "HR",
    audience: "OPERATOR",
    warmupScope: "required",
    routes: PEOPLE_MINIMAL_ROUTES,
    queryKeys: [
      "employees",
      "sites",
      "shift-groups",
      "shift-group-schedules",
      "hr-incidents",
      "disciplinary-actions",
    ],
    moduleIds: ["hr-workforce-core"],
    excludedRoutes: ["/gold/settlement/approvals"],
  },
];

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

/**
 * ST-2.3. Scrap ticketing was the one route family that answered "offline-safe"
 * here; with the vertical gone nothing in the warmed scope accepts a write while
 * disconnected, so every route that is not outright excluded is online-only.
 * The excluded check stays first because "excluded" and "online-only" mean
 * different things to the caller: excluded is a deliberate refusal it explains
 * to the user, online-only is merely the absence of a warmed write path.
 */
export function getRouteOfflineMutationPolicy(pathname: string): OfflineMutationPolicy {
  if (isRouteExcludedFromOffline(pathname)) {
    return "excluded";
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

  if (pathname.startsWith("/people") || pathname.startsWith("/payroll")) {
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
