import type { FieldDefinition } from "@/lib/forms/fields";
import type { ReportLayout } from "@/lib/reports/layout";
import type { RetailAction, RetailResource } from "@/lib/retail/permissions";

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
  /** One line on what it shows, under its name in the catalogue. */
  summary?: string;
  /** A working list: paged on the server, drawn by ListFrame (5.4). */
  list?: ListSpec;
};

/** How a report's rows are fetched. Server-only: it queries the database. */
export type ReportLoader = {
  load: (ctx: ReportContext, params: ReportParams) => Promise<ReportLoadResult>;
  /** Choices for `choice` params (and list filters) that depend on the company, by key. */
  options?: (ctx: ReportContext) => Promise<Record<string, ReportOption[]>>;
  /**
   * One list page, paged by the database. Required for a list source that can
   * pass `REPORT_ROW_LIMIT` rows; it honours the whole query and totals every
   * filtered row with `aggregate`/`groupBy`, never by adding up a page. It also
   * applies the list's `scopeOwn` and drops `view-cost` values for `ctx.role`,
   * which the in-memory path does for `load`.
   */
  page?: (ctx: ReportContext, query: ResolvedListQuery) => Promise<ListPageResult>;
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

/* ──────────────────────────────────────────────────────────────────────────
   Lists: a report source paged on the server (00-foundations 5.4.2)
   ────────────────────────────────────────────────────────────────────────── */

/** A grant from the retail matrix. Type-only, so this file stays importable in the browser. */
export type ListGrant = [RetailResource, RetailAction];

/** How a judgement is coloured. Colour always comes with a word. */
export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "hollow" | "pending" | "gold";

export type CellKind =
  | "link"
  | "ref"
  | "text"
  | "muted"
  | "mono"
  | "num"
  | "date"
  | "when"
  | "money"
  | "diff"
  | "owed"
  | "zero"
  | "state"
  | "bar"
  | "duration"
  | "edit-money";

export type ListColumn = ReportColumn & {
  cell: CellKind;
  /** Grid track: "104px" or "minmax(132px,1fr)". */
  width: string;
  /** Default end for num, money, diff, owed, zero, edit-money. */
  align?: "start" | "end";
  /** 3 leaves at ≤1140px of table width, 2 at ≤940px. */
  priority?: 1 | 2 | 3;
  sortable?: boolean;
  /** state: value → tone. The order of the keys is the order groups are drawn in. */
  tones?: Record<string, Tone>;
  /** Totals band: rows whose tone is one of these, counted under this label ("23 to check"). */
  summary?: { tones: Tone[]; label: string };
  /** variance: − bad, + warn; gain: + ok. */
  diff?: "variance" | "gain";
  /** date: the row key holding the time of day, drawn after the day and sorted with it. */
  timeKey?: string;
  /** duration: the row key that is true while the thing is still running. */
  runningKey?: string;
  /** link/ref: default `list.rowHref`. */
  href?: RowTemplate;
  /** bar: the fill % key, and the % under which the bar warns. */
  bar?: { pctKey: string; warnBelow: number };
  /** Dropped, values and all, for roles that may not see cost. */
  requires?: "view-cost";
};

/** A choice. `where` narrows the rows itself, for a choice that is a range or a word rather than a value. */
export type ListOption = ReportOption & { where?: Condition[] };

export const PERIOD_PRESETS = ["today", "yesterday", "7d", "30d", "this-month", "last-month", "this-year", "any"] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export type ListFilter =
  | {
      key: string;
      label: string;
      type: "choice";
      /** The "any" option's words: "Any", "Anyone", "All sites". Its value is `any`. */
      any: string;
      options?: ListOption[];
      /** The options come from the loader's `options(ctx)` under this filter's key. */
      optionsFromLoader?: boolean;
      /** Set: applied as `column is <value>` over the loaded rows. Unset: passed to the loader as a param. */
      column?: string;
      /** On the toolbar row; otherwise inside Filters. */
      primary?: boolean;
      default?: string;
    }
  | {
      key: string;
      label: string;
      type: "period";
      any: string;
      /** A `date` column holding calendar days (`YYYY-MM-DD`) in the company's zone. */
      column: string;
      primary?: boolean;
      default?: PeriodPreset;
    }
  /** Never drawn: the record a record tab or an "all" link is scoped to. Passed to the loader too. */
  | { key: string; type: "parent"; column: string };

export type ConfirmSpec = { title: string; body: string; confirm: string; tone?: "bad" };

export type ListAction = {
  key: string;
  label: string;
  tone?: "bad";
  more?: boolean;
  /** Any of. */
  requires: ListGrant[];
  /** Row menu: only for rows that match. */
  when?: Condition[];
  do:
    | { sheet: string }
    | { href: RowTemplate }
    | { confirm: ConfirmSpec; endpoint: string }
    | { download: string }
    | { copy: string };
};

export type EmptyGuideSpec = {
  icon: string;
  title: string;
  body: string;
  primary?: { label: string; sheet?: string; href?: string };
};

export type ListSort = { key: string; label: string; rules: SortRule[] };

export type ListSpec = {
  /** "shifts" — in Export's caption, empty states, refusals ("Your role cannot view shifts"). */
  noun: string;
  /** Any of these grants reads the list. */
  read: ListGrant[];
  /** These roles see only the rows where `column` is their own user id; `filter` is hidden from them. */
  scopeOwn?: { roles: string[]; column: string; filter?: string };
  search: { placeholder: string; keys: string[] };
  tabs?: Array<{ key: string; label: string; where: Condition[] }>;
  filters: ListFilter[];
  /** The first is the default. */
  sorts: ListSort[];
  /** Column keys offered under Group. */
  groups?: string[];
  defaultGroup?: string;
  columns: ListColumn[];
  rowHref: RowTemplate;
  rowMenu?: ListAction[];
  bulk?: Array<ListAction | { key: "export" }>;
  primary?: { label: string; icon?: "plus"; requires: ListGrant[]; sheet?: string; href?: string };
  /** The phone card. */
  card: { title: string; badge?: string; figure: string; meta: RowTemplate; figure2?: string };
  empty: EmptyGuideSpec;
  edit?: { column: string; endpoint: string; changedLabel: string; note: string; save: string };
  /** Listed in the Reports catalogue. Default false. */
  catalog?: boolean;
};

/**
 * What the browser is told about a list, for one role: no grants and no
 * scoping rule; only the columns, filters and actions that role has; choice
 * options resolved for the company.
 */
export type ListSpecPublic = Omit<ListSpec, "read" | "scopeOwn" | "primary"> & {
  primary: Omit<NonNullable<ListSpec["primary"]>, "requires"> | null;
};

/** A list request as the address carries it. */
export type ListQuery = {
  tab?: string;
  q?: string;
  sort?: string;
  group?: string;
  page: number;
  size: number;
  /** choice, period and parent filters by key. */
  filters: Record<string, string>;
  /** Hidden column keys. */
  hidden?: string[];
};

export const LIST_PAGE_SIZES = [25, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZES)[number];

/** A query with every default filled and every value checked against the source. */
export type ResolvedListQuery = {
  tab: string | null;
  q: string;
  /** A named sort's key, or `<column>:asc|desc`. */
  sort: string;
  group: string | null;
  page: number;
  size: ListPageSize;
  /** Every declared filter's value (`any` when off); parents only when given. */
  filters: Record<string, string>;
  hidden: string[];
};

export type ListGroup = {
  value: string | null;
  /** "None" for blank. */
  label: string;
  tone: Tone | null;
  /** Rows in the whole group, not just this page. */
  count: number;
  totals: Record<string, ReportValue>;
};

export type ListSummary = Record<string, { count: number; label: string; tone: Tone }>;

/** One page, and everything about the whole filtered set the frame draws around it. */
export type ListPageResult = {
  total: number;
  pages: number;
  page: number;
  rows: ReportRow[];
  groups: ListGroup[] | null;
  totals: Record<string, ReportValue>;
  summary: ListSummary;
  tabs: Record<string, number> | null;
  everEmpty: boolean;
  truncated: boolean;
};

export type ListPageResponse = ListPageResult & {
  report: ReportMeta & { list: ListSpecPublic };
  query: ResolvedListQuery;
  size: ListPageSize;
};

/** "Select all" fetches at most this many ids. */
export const LIST_IDS_CAP = 5000;
export type ListIdsResponse = { ids: string[]; total: number; capped: boolean };
