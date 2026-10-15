import { canUseExplore, productTables, readsSummary, roleName, whoReads, workspaceRoles } from "./access";
import { EXPLORE_ROW_LIMIT, EXPLORE_TIME_LIMIT_SECONDS } from "./guard";

/**
 * Management → Explore, from what exists today: the workspace's roles and
 * people, what each reads (the report sources its pages allow), and the
 * guards every question runs inside. Who may use Explore, each product's
 * scope, the limits and the questions-run log become settings of their own
 * with `ExploreSettings` and `ExploreQuestionRun`, waiting for approval with
 * Explore's reader; until then this page reads them and changes nothing.
 */

export type ExploreRoleRow = {
  role: string;
  label: string;
  /** "James Nyabadza", "Rudo Mapfumo and Chipo Mhlanga", or "6 people". */
  people: string;
  reads: string;
  canUse: boolean;
};

export type ExploreProductRow = { key: string; name: string; tables: string[]; scope: string };

export type ExploreSettingsView = {
  workspaceName: string;
  roles: ExploreRoleRow[];
  products: ExploreProductRow[];
  rowLimit: number;
  timeLimitSeconds: number;
  /** Whether the questions-run log exists yet (it waits for approval). */
  runLog: boolean;
};

function peopleLabel(names: string[]): string {
  if (names.length === 0) return "No one yet";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} people`;
}

export function exploreSettingsView(input: {
  workspaceName: string;
  profile: string | null | undefined;
  enabledFeatures: string[] | undefined;
  users: Array<{ name: string; role: string }>;
}): ExploreSettingsView {
  const roles = workspaceRoles(input.profile);
  const roleRows = roles.map((role) => ({
    role,
    label: role === "SUPERADMIN" ? "Owners and directors" : roleName(role),
    people: peopleLabel(input.users.filter((user) => user.role === role).map((user) => user.name)),
    reads: readsSummary(role, roles, input.enabledFeatures),
    canUse: canUseExplore(role),
  }));
  const products = productTables(input.enabledFeatures, roles).map((product) => {
    // A product only some roles read says who; one every role with any of it reads is "By role".
    const readers = roles.filter((role) => readsSummary(role, roles, input.enabledFeatures) !== "—");
    const own = roles.filter((role) =>
      product.tables.some((table) => readsTable(role, table, input.enabledFeatures)),
    );
    return {
      key: product.product,
      name: product.name,
      tables: product.tables,
      scope: own.length && own.length < readers.length ? `${whoReads(own)} only` : "By role",
    };
  });
  return { workspaceName: input.workspaceName, roles: roleRows, products, rowLimit: EXPLORE_ROW_LIMIT, timeLimitSeconds: EXPLORE_TIME_LIMIT_SECONDS, runLog: false };
}

function readsTable(role: string, table: string, enabledFeatures: string[] | undefined): boolean {
  return productTables(enabledFeatures, [role]).some((product) => product.tables.includes(table));
}
