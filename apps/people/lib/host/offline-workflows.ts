/**
 * The offline workflows this host warms — the workforce essentials and the
 * till — and the routes it keeps online on purpose. Data the modules will
 * carry in their manifests; registered on both sides from `modules.client.ts`.
 */
import { PEOPLE_TABS } from "@corelithzw/module-people/people/tab-config";
import type { OfflineWorkflowCatalogEntry } from "@corelithzw/module-offline/types";

export const OFFLINE_EXCLUDED_ROUTE_REASONS: Record<string, string> = {
  "/accounting": "Accounting workflows are intentionally excluded from the current offline scope.",
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
    requiredFeatures: ["hr.employees", "hr.shift-groups", "hr.incidents", "hr.disciplinary-actions"],
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
  },
];
