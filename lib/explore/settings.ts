import { canUseExplore, productTables, readsSummary, roleName, whoReads, workspaceRoles } from "./access";
import { EXPLORE_ROW_LIMIT, EXPLORE_TIME_LIMIT_SECONDS } from "./guard";
import type { ProductKey } from "./products";
import type { RunRow } from "./runs";

/**
 * Management → Explore: who may use it (`ExploreSettings.roles`, changed
 * here), what each role reads, what each product shows, the guards every
 * question runs inside, and the questions run today (`ExploreQuestionRun`).
 * Owners always use Explore.
 */

export type ExploreRoleRow = {
  role: string;
  label: string;
  /** "James Nyabadza", "Rudo Mapfumo and Chipo Mhlanga", or "6 people". */
  people: string;
  /** The people in the role, for their avatars: up to four. */
  faces?: Array<{ name: string; image: string | null }>;
  reads: string;
  canUse: boolean;
  /** Owners always use Explore; their row cannot be changed. */
  fixed: boolean;
};

export type ExploreProductRow = { key: string; name: string; tables: string[]; scope: string };

export type ExploreSettingsView = {
  workspaceName: string;
  roles: ExploreRoleRow[];
  products: ExploreProductRow[];
  rowLimit: number;
  timeLimitSeconds: number;
  /** Whether questions run as Explore's own login, and so are logged. */
  runLog: boolean;
  /** Today's questions, newest first (empty until the login is set up). */
  runs: RunRow[];
  /** This month: how many questions ran, and how many changes were refused. */
  month: { ran: number; refusedChanges: number };
  /** The person reading may change who uses Explore. */
  canChange: boolean;
};

function peopleLabel(names: string[]): string {
  if (names.length === 0) return "No one yet";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} people`;
}

/** At most eight table names, then how many more. */
function shortList(tables: readonly string[]): string[] {
  return tables.length > 8 ? [...tables.slice(0, 8), `${tables.length - 8} more`] : [...tables];
}

export function exploreSettingsView(input: {
  workspaceName: string;
  profile: string | null | undefined;
  enabledFeatures: string[] | undefined;
  users: Array<{ name: string; role: string; image?: string | null }>;
  /** The roles that may use Explore here (`exploreRoles`). */
  allowed: readonly string[];
  /** With Explore's own login: each product's real tables, by Explore's names. */
  realTables?: Partial<Record<ProductKey, string[]>> | null;
  runs?: RunRow[];
  month?: { ran: number; refusedChanges: number };
  runLog: boolean;
  canChange: boolean;
}): ExploreSettingsView {
  const roles = workspaceRoles(input.profile);
  const roleRows = roles.map((role) => ({
    role,
    label: role === "SUPERADMIN" ? "Owners and directors" : roleName(role),
    people: peopleLabel(input.users.filter((user) => user.role === role).map((user) => user.name)),
    faces: input.users.filter((user) => user.role === role).slice(0, 4).map((user) => ({ name: user.name, image: user.image ?? null })),
    reads: readsSummary(role, roles, input.enabledFeatures),
    canUse: canUseExplore(role, input.allowed),
    fixed: role === "SUPERADMIN",
  }));
  const products = productTables(input.enabledFeatures, roles).map((product) => {
    // A product only some roles read says who; one every role with any of it reads is "By role".
    const readers = roles.filter((role) => readsSummary(role, roles, input.enabledFeatures) !== "—");
    const own = roles.filter((role) =>
      product.tables.some((table) => readsTable(role, table, input.enabledFeatures)),
    );
    const real = input.realTables?.[product.product];
    return {
      key: product.product,
      name: product.name,
      tables: shortList(real?.length ? real : product.tables),
      scope: own.length && own.length < readers.length ? `${whoReads(own)} only` : "By role",
    };
  });
  return {
    workspaceName: input.workspaceName,
    roles: roleRows,
    products,
    rowLimit: EXPLORE_ROW_LIMIT,
    timeLimitSeconds: EXPLORE_TIME_LIMIT_SECONDS,
    runLog: input.runLog,
    runs: input.runs ?? [],
    month: input.month ?? { ran: 0, refusedChanges: 0 },
    canChange: input.canChange,
  };
}

function readsTable(role: string, table: string, enabledFeatures: string[] | undefined): boolean {
  return productTables(enabledFeatures, [role]).some((product) => product.tables.includes(table));
}

/** The finding's second sentence: "213 questions ran this month; 2 changes were refused." */
export function monthLine(month: { ran: number; refusedChanges: number }): string {
  const ran = month.ran === 1 ? "1 question ran this month" : `${month.ran.toLocaleString("en-GB")} questions ran this month`;
  const refused = month.refusedChanges === 1 ? "1 change was refused" : `${month.refusedChanges} changes were refused`;
  return `${ran}; ${refused}.`;
}
