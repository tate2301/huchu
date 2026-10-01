import type { FieldDefinition } from "@/lib/forms/fields";
import type { ReportLayout } from "@/lib/reports/layout";

/**
 * A report is a source of rows about one kind of thing, and a view over them.
 *
 * The source is code: what it reports on, which columns it has, what it can be
 * narrowed by before it is fetched, and what can be done to a row. The view is
 * data — which columns, in what order, filtered, sorted, grouped and totalled —
 * and is the part a person changes. Keeping the two apart is what lets the
 * same view drive the screen, the CSV and the PDF without any of them drifting.
 */

/** What a value is, which decides how it is drawn, compared and totalled. */
export type ReportColumnKind =
  | "text"
  | "status"
  | "code"
  | "relation"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "money";

export type ReportValue = string | number | boolean | null;

/** One row. `id` identifies the record for row actions and links. */
export type ReportRow = { id: string } & Record<string, ReportValue>;

export type ReportColumn = {
  key: string;
  label: string;
  kind: ReportColumnKind;
  /** ISO currency of a `money` column, when the source knows it. */
  currency?: string;
  /** Folded away until someone asks for it — a detail, not something scanned. */
  hidden?: boolean;
  /** The total the footer shows until someone picks another. */
  total?: Aggregate;
};

/** Something the rows are narrowed by before they are fetched. */
export type ReportParam =
  | { key: string; label: string; type: "date"; default?: "today" | `-${number}d` | "monthStart" | "yearStart" }
  | { key: string; label: string; type: "choice"; options: ReportOption[] };

export type ReportOption = { value: string; label: string };

export type ReportParams = Record<string, string>;

/**
 * Text with `{column}` holes, filled from a row. A list is tried in order and
 * the first whose holes are all filled wins — "the deal, or else the lead".
 */
export type RowTemplate = string | string[];

/** What can be done to one row. Each is hidden for roles it does not name. */
export type ReportRowAction =
  | { id: string; kind: "open"; label: string; href: RowTemplate; roles?: string[] }
  | { id: string; kind: "delete"; label: string; endpoint: RowTemplate; confirm: RowTemplate; roles?: string[] }
  | {
      id: string;
      kind: "edit";
      label: string;
      /** PATCHed with the answers, each typed by its field. */
      endpoint: RowTemplate;
      fields: FieldDefinition[];
      /** Which row column each field starts from, by field key. */
      values: Record<string, string>;
      roles?: string[];
    };

export const AGGREGATES = ["sum", "avg", "min", "max", "count", "distinct"] as const;
export type Aggregate = (typeof AGGREGATES)[number];

export type ReportContext = {
  companyId: string;
  userId: string;
  role: string;
};

/** The limit on rows a report returns. Past it, narrow the dates. */
export const REPORT_ROW_LIMIT = 5000;

export type ReportLoadResult = {
  rows: ReportRow[];
  /** More rows matched than came back. */
  truncated: boolean;
};

/** Everything a source says about itself that the browser may know. */
export type ReportMeta = {
  key: string;
  title: string;
  area: string;
  columns: ReportColumn[];
  params: ReportParam[];
  /** The view someone gets before they change anything. */
  defaults: Partial<Pick<ReportView, "sort" | "groupBy">>;
  rowActions?: ReportRowAction[];
  /** How the report is laid out as a page. Absent, the default for its columns. */
  layout?: ReportLayout;
  /** The view the workspace saved as everyone's starting point, if it saved one. */
  defaultView?: ReportView;
};

/** One report as management lists it. */
export type ReportSettingSummary = {
  key: string;
  /** The workspace's row for this report, once it has changed anything. */
  settingId: string | null;
  title: string;
  area: string;
  enabled: boolean;
  /** The workspace arranged its own page. */
  arranged: boolean;
  /** The workspace saved a starting view. */
  viewSaved: boolean;
};

/** What a workspace has saved over a report's own setup. */
export type SavedReportSetup = {
  layout: ReportLayout | null;
  view: ReportView | null;
};

/**
 * A report as the product knows it, without its query: safe to import
 * anywhere, including the navigation that runs in the browser.
 */
export type ReportDefinition = ReportMeta & {
  /**
   * The page this report is about. Who may read the report is decided the way
   * who may open that page is: its feature, its roles.
   */
  href: string;
  /** Overrides the feature `href` resolves to, where the report has its own grant. */
  featureKey?: string;
  /** Only these roles, on top of whatever the page allows. */
  roles?: string[];
  /** Workspace profiles this report is at the front of the catalogue for. */
  profiles: string[];
};

/** How a report's rows are fetched. Server-only: it queries the database. */
export type ReportLoader = {
  load: (ctx: ReportContext, params: ReportParams) => Promise<ReportLoadResult>;
  /** Choices for `choice` params that depend on the company, by param key. */
  options?: (ctx: ReportContext) => Promise<Record<string, ReportOption[]>>;
};

/* ──────────────────────────────────────────────────────────────────────────
   The view
   ────────────────────────────────────────────────────────────────────────── */

export const CONDITION_OPS = ["is", "isNot", "contains", "gt", "lt", "between", "empty", "notEmpty"] as const;
export type ConditionOp = (typeof CONDITION_OPS)[number];

export type Condition = {
  column: string;
  op: ConditionOp;
  /** `is` and `isNot` take a list; `between` two bounds; the rest one value. */
  value?: string | string[];
};

export type SortRule = { column: string; dir: "asc" | "desc" };

export type ReportView = {
  /** Every column, in order; a hidden one keeps its place. */
  columns: Array<{ key: string; hidden: boolean }>;
  conditions: Condition[];
  search: string;
  sort: SortRule[];
  groupBy: string | null;
  /** Which total each column's footer shows. Absent means none. */
  totals: Record<string, Aggregate>;
};
