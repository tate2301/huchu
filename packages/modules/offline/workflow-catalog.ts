/**
 * Which screens work offline, for whom, and which are kept online on purpose.
 *
 * The catalogue is data the modules own and the host registers on both sides
 * (`modules.client.ts`); this file keeps the registry and the questions the
 * runtime asks of it, and names no module.
 */
import { registry } from "@corelithzw/platform/registry";
import type { OfflineMutationPolicy, OfflineWorkflowCatalogEntry } from "./types";

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

const catalogue = registry<{ entries: readonly OfflineWorkflowCatalogEntry[]; excluded: Readonly<Record<string, string>> }>(
  "offline.workflows",
  () => ({ entries: [], excluded: {} }),
);

export function registerOfflineWorkflows(
  entries: readonly OfflineWorkflowCatalogEntry[],
  excludedRouteReasons: Readonly<Record<string, string>> = {},
): void {
  catalogue.entries = entries;
  catalogue.excluded = excludedRouteReasons;
}

export function registeredOfflineWorkflows(): readonly OfflineWorkflowCatalogEntry[] {
  return catalogue.entries;
}

export function registeredOfflineExcludedRoutes(): Readonly<Record<string, string>> {
  return catalogue.excluded;
}

export function resolveOfflineWorkflowCatalog(enabledFeatures?: string[]) {
  const features = new Set(enabledFeatures ?? []);
  // An entry that names no feature is always in scope; one that names some is
  // in scope when the tenant has any of them. The old default warmed nothing
  // for a vertical the resolver did not know, which is how retail went dark
  // once; an entry now says what selects it, and nothing is dark by omission.
  return registeredOfflineWorkflows().filter((entry) =>
    entry.requiredFeatures ? entry.requiredFeatures.some((feature) => features.has(feature)) : true,
  );
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
  for (const [route, reason] of Object.entries(registeredOfflineExcludedRoutes())) {
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
