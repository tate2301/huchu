/**
 * The offline workflows this host warms — the workforce essentials and the
 * till — and the routes it keeps online on purpose. Data the modules will
 * carry in their manifests; registered on both sides from `modules.client.ts`.
 */
import { PEOPLE_TABS } from "@corelithzw/module-people/people/tab-config";
import type { OfflineMutationPolicy, OfflineWorkflowCatalogEntry } from "@corelithzw/module-offline/types";

export const OFFLINE_EXCLUDED_ROUTE_REASONS: Record<string, string> = {
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
    requiredFeatures: ["retail.pos"],
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
