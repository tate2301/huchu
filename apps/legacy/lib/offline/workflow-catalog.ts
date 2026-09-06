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

/**
 * The POS portal, taken from the `retail-pos` module's own critical routes so the
 * two cannot drift. `/portal/pos/login` is deliberately absent: warming a login
 * page is warming the one screen that must always be answered by the server.
 */
const RETAIL_POS_ROUTES = [
  "/portal/pos",
  "/portal/pos/overview",
  "/portal/pos/history",
  "/portal/pos/held",
  "/portal/pos/customers",
  "/portal/pos/shift",
  "/portal/pos/price-check",
];

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
  /**
   * The till.
   *
   * `retail-pos` has been a fully specified offline module for some time — an
   * outbox, entity adapters, mutation policies, the lot — and it was never
   * warmed, because `resolveOfflineWorkflowCatalog` knew two verticals and
   * returned `false` for everything else. So the offline runtime existed and
   * never ran for the one surface built around it, and a bottle store whose line
   * dropped mid-sale lost the sale. A till that cannot sell when the line drops
   * is not a till.
   *
   * Scoped to the POS portal rather than the retail admin screens: the cashier is
   * who needs to keep working, and warming the whole module would pull the
   * trading dashboard and its charts onto a phone for no benefit.
   */
  {
    workflowId: "retail-pos-core",
    vertical: "RETAIL",
    audience: "CASHIER",
    warmupScope: "required",
    routes: RETAIL_POS_ROUTES,
    queryKeys: [
      "retail-sites",
      "retail-current-shift",
      "retail-pos-catalog",
      "retail-pos-catalog-categories",
      "retail-pos-promotions",
      "retail-pos-tender-policy",
      "retail-pos-held-carts",
      "retail-pos-sales",
      "retail-pos-customer-search",
    ],
    moduleIds: ["retail-pos"],
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

/**
 * The till warms when the tenant has bought the till. `retail.pos` is the key the
 * route registry already uses for `/portal/pos`, so the two agree by construction.
 */
function hasRetailPosFeature(features: Set<string>) {
  return features.has("retail.pos");
}

export function resolveOfflineWorkflowCatalog(enabledFeatures?: string[]) {
  const features = new Set(enabledFeatures ?? []);
  return OFFLINE_WORKFLOW_CATALOG.filter((entry) => {
    if (entry.vertical === "HR") {
      return hasHrMinimalFeature(features);
    }
    if (entry.vertical === "RETAIL") {
      return hasRetailPosFeature(features);
    }
    // Unknown verticals warm nothing. That default is why retail was dark: the
    // module existed, nothing selected it, and no error was raised.
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
