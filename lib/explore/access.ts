import { USER_ROLE_LABELS, VERTICAL_ROLE_REGISTRY } from "@/lib/platform/vertical-role-registry";
import { canReadReport } from "@/lib/reports/access";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { sqlName } from "@/lib/reports/sql/schema";
import type { ReportDefinition } from "@/lib/reports/types";

import { byProduct, productOf, PRODUCTS, type LockedTable, type ProductKey } from "./products";

export { canUseExplore, EXPLORE_ROLES } from "./roles";

/**
 * What each role reads in Explore: what it reads in the app, never more —
 * the report sources its pages allow (`canReadReport`). Who may open Explore
 * at all is in `roles.ts`.
 */

/** A role, the way Management → Explore and a locked table name it: "Owners", "Managers". */
const PLURAL: Record<string, string> = {
  SUPERADMIN: "Owners",
  MANAGER: "Managers",
  CLERK: "Clerks",
  OPERATOR: "Operators",
  FINANCE_OFFICER: "Finance officers",
  SHOP_MANAGER: "Shop managers",
  CASHIER: "Cashiers",
  STOCK_CLERK: "Stock clerks",
  SALES_EXEC: "Sales executives",
  SALES_REP: "Sales reps",
  SCHOOL_ADMIN: "School admins",
  BURSAR: "Bursars",
  REGISTRAR: "Registrars",
  HOD: "Heads of department",
  WARDEN: "Wardens",
  TEACHER: "Teachers",
};

export function roleName(role: string): string {
  const label = (USER_ROLE_LABELS as Record<string, string | undefined>)[role] ?? role;
  return label.charAt(0) + label.slice(1).toLowerCase();
}

function plural(role: string): string {
  return PLURAL[role] ?? `${roleName(role)}s`;
}

/** "Owners and managers", "Owners, managers and finance officers". */
export function whoReads(roles: readonly string[]): string {
  const names = roles.map((role, index) => (index === 0 ? plural(role) : plural(role).toLowerCase()));
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The roles a workspace of this profile has. */
export function workspaceRoles(profile: string | null | undefined): string[] {
  const registry = VERTICAL_ROLE_REGISTRY as Record<string, { roles: string[] }>;
  return [...((profile && registry[profile]?.roles) || registry.GENERAL!.roles)];
}

type Access = { role: string; enabledFeatures: string[] | undefined };

/** The sources a role reads in this workspace. */
export function sourcesFor(access: Access, definitions: readonly ReportDefinition[] = REPORT_DEFINITIONS): ReportDefinition[] {
  return definitions.filter((definition) => canReadReport(definition, access));
}

/**
 * The tables the person cannot read but someone in the workspace can, with
 * who: the panel shows them locked ("staff · People managers") so a person
 * knows to ask rather than wonder.
 */
export function lockedTables(
  /** The sources the person reads, by key. */
  own: ReadonlySet<string>,
  enabledFeatures: string[] | undefined,
  roles: readonly string[],
  definitions: readonly ReportDefinition[] = REPORT_DEFINITIONS,
): LockedTable[] {
  return definitions.flatMap((definition) => {
    if (own.has(definition.key)) return [];
    const readers = roles.filter((role) => canReadReport(definition, { role, enabledFeatures }));
    if (!readers.length) return [];
    return [{ name: sqlName(definition.key), key: definition.key, product: productOf(definition.key), who: whoReads(readers) }];
  });
}

/** What a role reads, by product: "Every table", "Books, CRM and Tender", or "—". */
export function readsSummary(role: string, roles: readonly string[], enabledFeatures: string[] | undefined): string {
  const everyone = new Set(roles.flatMap((other) => sourcesFor({ role: other, enabledFeatures }).map((definition) => definition.key)));
  const own = sourcesFor({ role, enabledFeatures });
  if (!own.length) return "—";
  if (own.length >= everyone.size) return "Every table";
  const products = byProduct(own.map((definition) => ({ name: definition.key, product: productOf(definition.key) }))).map((group) => group.product.name);
  if (products.length <= 1) return products.join("");
  return `${products.slice(0, -1).join(", ")} and ${products[products.length - 1]}`;
}

/** What each product shows: its tables, for Management → Explore. Products the workspace has none of are left out. */
export function productTables(enabledFeatures: string[] | undefined, roles: readonly string[]): Array<{ product: ProductKey; name: string; tables: string[] }> {
  const readable = new Map<string, ReportDefinition>();
  for (const role of roles) for (const definition of sourcesFor({ role, enabledFeatures })) readable.set(definition.key, definition);
  return PRODUCTS.flatMap((product) => {
    const tables = [...readable.values()].filter((definition) => productOf(definition.key) === product.key).map((definition) => sqlName(definition.key)).sort();
    return tables.length ? [{ product: product.key, name: product.name, tables }] : [];
  });
}
