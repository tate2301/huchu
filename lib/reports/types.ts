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
  /**
   * A percentage of two summed row keys (`num ÷ den × 100`): its `avg` total
   * is over the whole set ("24.6%" margin across categories), not a mean of rows.
   */
  ratio?: { num: string; den: string };
  /** The total sums this row key instead of the cell's own (a voided sale shows its total, which no longer counts). */
  totalOf?: string;
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
  /** The same rows as Reports reads them (`face=report`, 70-insights-reports decision 5). */
  report?: ReportFace;
};

/** How a report's rows are fetched. Server-only: it queries the database. */
export type ReportLoader = {
  load: (ctx: ReportContext, params: ReportParams, face?: "list" | "report") => Promise<ReportLoadResult>;
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
  /** The name of the record a `parent` filter with `all` scopes the list to ("Amarula Cream 750ml"). */
  parentLabel?: (ctx: ReportContext, filters: Record<string, string>) => Promise<string | null>;
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
  /** "One row for each": the rollup keys a report face is rolled up by. */
  rows?: string[];
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
  /** A dot in the value's tone and the word, no ground ("● Cash"): a kind of thing, not a judgement. */
  | "dot"
  | "bar"
  | "duration"
  | "edit-money"
  /** A word that does the row menu action named by the column's `action` ("Restore"), in 600 ink. */
  | "action";

export type ListColumn = ReportColumn & {
  cell: CellKind;
  /** Grid track: "104px" or "minmax(132px,1fr)". */
  width: string;
  /** Default end for num, money, diff, owed, zero, edit-money. */
  align?: "start" | "end";
  /** 3 leaves at ≤1140px of table width, 2 at ≤940px. */
  priority?: 1 | 2 | 3;
  sortable?: boolean;
  /** state and dot: value → tone. The order of the keys is the order groups are drawn in. */
  tones?: Record<string, Tone>;
  /** Totals band: rows whose tone is one of these, counted under this label ("23 to check"). */
  summary?: { tones: Tone[]; label: string };
  /** variance: − bad, + warn; gain: + ok. */
  diff?: "variance" | "gain";
  /** date: the row key holding the time of day, drawn after the day and sorted with it. */
  timeKey?: string;
  /** date: "2 Nov 2026" (medium), or "Today", "Yesterday", else medium (relative). Default "15 August 2026". */
  dayFormat?: "medium" | "relative";
  /** duration: the row key that is true while the thing is still running. */
  runningKey?: string;
  /** link/ref: default `list.rowHref`. */
  href?: RowTemplate;
  /** text: drawn in 600 ink, a name that is not a link (a supplier's contact, edited from the row ⋯). */
  strong?: boolean;
  /** link: the row key holding muted words after the link (" · stopped"). */
  suffixKey?: string;
  /** bar: the fill % key, and the % under which the bar warns. */
  bar?: { pctKey: string; warnBelow: number };
  /** num: the row key holding the unit word printed after the figure ("13 bottles"). */
  unitKey?: string;
  /** num: the figure is a percentage, printed "22.4%". */
  percent?: boolean;
  /** num: the row key holding a tone; when set the figure sits in that tone's pill ("22.4%" under target). */
  pillKey?: string;
  /** num: always signed ("+40", "−1"); `gain` also colours a rise `--ok`, without a pill. */
  sign?: "plain" | "gain";
  /**
   * state and dot: the row key holding the tone, when the words vary row to row ("Count, two broken").
   * text and date: the words take that tone's ink when the key is set ("2 Nov 2026" in `--warn` in its last days).
   * money: the figure takes that ink (a voided sale's total in `--ink-3`). link: a row with no record to open
   * draws its words in that ink ("Walk-in" in `--faint`), or plain.
   */
  toneKey?: string;
  /** action: the key of the row menu action the cell does; drawn only when the row's menu offers it. */
  action?: string;
  /**
   * No value draws "—" in `--faint`, except: `blank` draws nothing, where the board leaves the cell blank (a till's
   * Last sale before its first); `dash` draws "–", where the board does (a count's Difference while it is counting).
   */
  empty?: "blank" | "dash";
  /**
   * `view-cost`: dropped, values and all, for roles that may not see cost.
   * `multi-site`: dropped while the company has one open site.
   */
  requires?: "view-cost" | "multi-site";
  /** Grouped by this column, its groups are drawn in this order of values (Reports' areas); others after, by name. */
  groupOrder?: readonly string[];
  /**
   * Said once by the page instead of on every row: not drawn while the list is
   * grouped by it (`group`), or while the parent filter named here narrows the
   * list to one value of it (`parent`). The Group menu turns it back on.
   */
  impliedBy?: { group?: boolean; parent?: string };
};

/** A choice. `where` narrows the rows itself, for a choice that is a range or a word rather than a value. */
export type ListOption = ReportOption & { where?: Condition[] };

export const PERIOD_PRESETS = [
  "today",
  "yesterday",
  "this-week",
  "last-weekend",
  "7d",
  "30d",
  "this-month",
  "last-month",
  "this-year",
  "any",
] as const;
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
      /** The default is worked out for the caller: `default-site`, the site their floor pages open on. */
      defaultFrom?: "default-site";
      /** Not offered while the company has fewer options than this (Site, with one site). */
      hideBelow?: number;
      /** Dropped while the company has one open site. */
      requires?: "multi-site";
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
  /**
   * Never drawn: the record a record tab or an "all" link is scoped to. Passed
   * to the loader too. With `all`, a list opened on it says whose rows these
   * are as its header sub (the loader's `parentLabel`) and `all` clears it.
   */
  | { key: string; type: "parent"; column: string; all?: string };

export type ConfirmSpec = { title: string; body: string; confirm: string; tone?: "bad" };

export type ListAction = {
  key: string;
  label: string;
  tone?: "bad";
  more?: boolean;
  /** Row menu: a separator is drawn before it ("Delete for good" after "Open it"). */
  separated?: boolean;
  /** Any of. */
  requires: ListGrant[];
  /** Row menu: only for rows that match. */
  when?: Condition[];
  /** Bulk: only on these tabs ("Sell them again" on Archived). */
  tabs?: string[];
  /** Dropped while the company has one open site ("Move to another site"). */
  sites?: "multi-site";
  do:
    | { sheet: string }
    /**
     * A row's link, or for a bulk action a link built from the ticked rows:
     * `{min:key}` and `{max:key}` are the smallest and largest of that column.
     */
    | { href: RowTemplate }
    /** A row's file, opened in a new tab to print (a sale's receipt). */
    | { open: RowTemplate }
    | { confirm: ConfirmSpec; endpoint: string }
    /**
     * POSTs `{ ids }` to the endpoint, asking first when the named entry of
     * the list runs (`lib/retail/asks`) has an ask, and toasts its done words.
     * A row menu action's endpoint may hold `{key}` holes, filled from its row
     * (`/api/v2/retail/tills/{id}/unpair`).
     */
    | { run: string; endpoint: string }
    | {
        /** POSTed with the ids; the answer is a file. A row menu action's may hold `{key}` holes, filled from its row. */
        download: string;
        /** The body key the ids go under. Default `ids`. */
        idsAs?: string;
        /** More of the body, fixed. */
        with?: Record<string, string>;
        /** Opened in a new tab (a PDF to print) rather than saved. */
        open?: boolean;
        /** A response header holding a count, and the toast that says it: `{n}` is the count. */
        notice?: { header: string; text: string };
        /** At most this many ids per request. */
        cap?: number;
      }
    /** Copies that column's values, comma-separated; `done` is the toast, `{n}` the count. */
    | { copy: string; done?: string }
    /** The list's own Export over the ticked rows, in this format ("Print" is the PDF). */
    | { export: "pdf" | "csv" | "xlsx" };
};

/**
 * What a list says before it has ever had a row (00-foundations 5.12.2).
 * With `steps` it teaches the job in three numbered sentences under a
 * question (the Guided board); without, it is the list's icon, a statement
 * and one line (the TenderUI board). `icon` names an export of `lib/icons`.
 */
export type EmptyGuideSpec = {
  icon?: string;
  title: string;
  line: string;
  /** Each step: the bold clause, then the rest of the sentence. */
  steps?: Array<[bold: string, rest: string]>;
  /**
   * Record tabs carry none: their rows arrive from elsewhere. Any of
   * `requires` offers it, as with the list's own primary; a caller with none
   * of them sees the guide without the button.
   */
  primary?: { label: string; sheet?: string; href?: string; requires: ListGrant[] };
  secondary?: { label: string; href: string; requires: ListGrant[] };
};

/** The guide as one caller sees it: only the actions their grants allow, no grants. */
export type EmptyGuidePublic = Omit<EmptyGuideSpec, "primary" | "secondary"> & {
  primary?: Omit<NonNullable<EmptyGuideSpec["primary"]>, "requires">;
  secondary?: Omit<NonNullable<EmptyGuideSpec["secondary"]>, "requires">;
};

export type ListSort = { key: string; label: string; rules: SortRule[] };

export type ListSpec = {
  /** "shifts" — in Export's caption, empty states, refusals ("Your role cannot view shifts"). */
  noun: string;
  /** The header's sub beside the title ("Kept for 30 days, then gone for good"); a parent's name replaces it. */
  sub?: string;
  /** Any of these grants reads the list. */
  read: ListGrant[];
  /** The 403 for a role none of `read` admits, where the list speaks for a module ("Your role cannot view reports"). Default "Your role cannot view <noun>". */
  refusal?: string;
  /**
   * The list exists only for a company with two or more open sites; with one,
   * every read answers 403 with this sentence ("Transfers need a second site.").
   */
  multiSiteOnly?: { refusal: string };
  /** These roles see only the rows where `column` is their own user id; `filter` is hidden from them. */
  scopeOwn?: { roles: string[]; column: string; filter?: string };
  search: { placeholder: string; keys: string[] };
  /** `empty`: the line drawn while the tab holds nothing at all ("Nothing of yours yet. …"), in place of "No match". */
  tabs?: Array<{ key: string; label: string; where: Condition[]; empty?: string }>;
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
  /** A link in the header after the title (and the sub): a sheet over the list ("Who can do what"). */
  subLink?: { label: string; sheet: string };
  /** The phone card. */
  card: {
    title: string;
    badge?: string;
    figure: string;
    meta: RowTemplate;
    /** A second meta line under the first ("Last sale Today, 11:42 · Chipo Dube"). */
    meta2?: RowTemplate;
    figure2?: string;
    /** A button on the card doing this row menu action ("Restore"), when the row's menu offers it. */
    action?: string;
  };
  empty: EmptyGuideSpec;
  edit?: { column: string; endpoint: string; changedLabel: string; note: string; save: string };
  /** Links under Export's formats, after a separator: other ways in ("Import a spreadsheet"). */
  exportExtras?: Array<{ label: string; href: string; requires: ListGrant[] }>;
  /** Refetched this often while open, for rows whose state changes on its own (a till going offline). */
  refreshSeconds?: number;
};

/**
 * What the browser is told about a list, for one role: no grants and no
 * scoping rule; only the columns, filters and actions that role has; choice
 * options resolved for the company.
 */
export type ListSpecPublic = Omit<ListSpec, "read" | "scopeOwn" | "primary" | "exportExtras" | "empty"> & {
  primary: Omit<NonNullable<ListSpec["primary"]>, "requires"> | null;
  empty: EmptyGuidePublic;
  exportExtras?: Array<{ label: string; href: string }>;
};

/** The six places a Reports template belongs (`lib/reports/areas.ts`). */
export type ReportArea = "selling" | "stock" | "buying" | "customers" | "money" | "floor";

/**
 * A source as Reports reads it (70-insights-reports 5.14): a second list spec
 * over the same loader, with the board's columns, filters and sorts, and the
 * "One row for each" choices. `startsFrom` is the source's "Starts from" card
 * on the New template sheet; the inherited `card` stays the phone card.
 */
export type ReportFace = ListSpec & {
  area: ReportArea;
  startsFrom?: { title: string; sub: string };
  /** "One row for each". The first is the unrolled row ("Sale"), key `none`; the rest are column keys. */
  rollups: Array<{ key: string; label: string }>;
  /** The count column that exists only rolled up ("Payments"): how many source rows each rolled row holds. */
  rollupOnly?: string;
};

/** Which spec of a source a list request reads. */
export type ListFace = "list" | "report";

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
  /** `report`: the source's report face. Default `list`. */
  face?: ListFace;
  /** A Reports template whose query lies under this one. */
  template?: string;
  /** "One row for each": rollup keys of the report face. */
  rows?: string[];
  /** Visible columns, in order. */
  cols?: string[];
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
  /** One of `LIST_PAGE_SIZES` from an address; an export asks a database-paged source for `REPORT_ROW_LIMIT`. */
  size: number;
  /** Every declared filter's value (`any` when off); parents only when given. */
  filters: Record<string, string>;
  hidden: string[];
  face: ListFace;
  /** The template the query was laid over, when it was. */
  template: string | null;
  /** Rolled up by these keys; empty when not. */
  rows: string[];
  /** The visible columns in drawing order, when the address chose them; the rest are hidden. */
  cols: string[] | null;
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
  /** The record a parent filter with `all` scopes the list to: the header sub, and the filter `all` clears. */
  parent: { key: string; label: string; all: string } | null;
  query: ResolvedListQuery;
  size: number;
};

/** "Select all" fetches at most this many ids. */
export const LIST_IDS_CAP = 5000;
export type ListIdsResponse = {
  ids: string[];
  total: number;
  capped: boolean;
  /** With `pick=a,b`: those columns' values, in the order of `ids` (what bulk actions read). */
  picked?: Record<string, ReportValue[]>;
};
