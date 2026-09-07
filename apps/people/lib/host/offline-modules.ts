/**
 * The offline modules this host composes: the workforce essentials and the
 * till. Each names its module's routes, queries and sync adapters, and moves
 * into that module when the manifests carry offline workflows; the runtime
 * they plug into is `@corelithzw/module-offline`.
 */
import { fetchDisciplinaryActions, fetchEmployees, fetchHrIncidents, fetchShiftGroups, fetchShiftGroupSchedules } from "@corelithzw/module-people/api-client";
import { fetchSites } from "@corelithzw/platform/client/sites";
import type {
  OfflineModuleDefinition,
  OfflinePreloadQuery,
} from "@corelithzw/module-offline/types";


const hrWorkforceCorePreloadQueries: OfflinePreloadQuery[] = [
  {
    key: "hr-employees-active",
    queryKey: ["employees", "", "active"],
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-sites-default",
    queryKey: ["sites"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "hr-shift-groups-default",
    queryKey: ["shift-groups", "", undefined],
    fetcher: async () => fetchShiftGroups({ limit: 300 }),
  },
  {
    key: "hr-shift-schedules-default",
    queryKey: ["shift-group-schedules", "", undefined],
    fetcher: async () => fetchShiftGroupSchedules({ limit: 300 }),
  },
  {
    key: "hr-incident-employees",
    queryKey: ["employees", "hr-incidents"],
    fetcher: async () => fetchEmployees({ active: true, limit: 500 }),
  },
  {
    key: "hr-incident-sites",
    queryKey: ["sites", "hr-incidents"],
    fetcher: async () => fetchSites(),
  },
  {
    key: "hr-incidents-default",
    queryKey: ["hr-incidents", "", "ALL"],
    fetcher: async () => fetchHrIncidents({ limit: 300 }),
  },
  {
    key: "hr-disciplinary-actions-default",
    queryKey: ["disciplinary-actions", "", "ALL"],
    fetcher: async () => fetchDisciplinaryActions({ limit: 300 }),
  },
];



function createWarmupRoutes(
  routes: string[],
  criticalRoutes?: string[],
) {
  const criticalSet = new Set(criticalRoutes ?? routes);
  return Array.from(new Set(routes)).map((href) => ({
    canonicalRoute: href,
    matchPaths: [href],
    warmupUrls: [href],
    critical: criticalSet.has(href),
  }));
}

const hrWorkforceCoreRoutes = [
  "/people",
  "/people/rosters",
  "/people/incidents",
];

export const OFFLINE_MODULES: OfflineModuleDefinition[] = [
  {
    moduleId: "hr-workforce-core",
    syncPriority: 16,
    bootstrapPriority: 16,
    primaryFlowLabel: "HR workforce support",
    warmupBudget: "standard",
    criticalRoutes: hrWorkforceCoreRoutes,
    routes: createWarmupRoutes(hrWorkforceCoreRoutes),
    preloadQueries: hrWorkforceCorePreloadQueries,
    entityAdapters: [],
    mutationAdapters: [],
  },
];
