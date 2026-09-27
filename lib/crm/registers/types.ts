/**
 * What a CRM record list — a register — is, described once.
 *
 * Every list in the CRM asks the same questions of its records: which of them
 * (search, filters), in what order (sort), arranged how (table, rows, board,
 * grouped by what), showing which columns — and every one of those answers
 * has to survive being saved as a view, restored from the address bar, and
 * handed to the export. A register describes the answers a list accepts; the
 * codec (`codec.ts`) turns them into a URL and back; the toolbar draws them;
 * the list endpoint and the export read the same filters.
 *
 * Safe for client and server: nothing here imports Prisma or the database.
 */

export const REGISTER_KEYS = [
  "LEAD",
  "DEAL",
  "PERSON",
  "COMPANY",
  "SITE",
  "TASK",
  "FOLLOW_UP",
  "SITE_VISIT",
  "PROJECT",
  "WORK_ORDER",
  "QUOTE",
  "INVOICE",
  "RECEIPT",
  "COLLECTION",
  "REQUISITION",
  "COST_ENTRY",
  "DAILY_REPORT",
  "INTAKE_FORM",
  "WORKFLOW",
  "WORKFLOW_RUN",
  "REP",
] as const;

export type RegisterKey = (typeof REGISTER_KEYS)[number];

export type Layout = "TABLE" | "LIST" | "BOARD";

/**
 * A date filter's relative answer. Kept as a word in URLs and saved views, so
 * "Closing this month" means this month whenever the view is opened.
 */
export const DATE_PRESETS = [
  "today",
  "this-week",
  "this-month",
  "last-7d",
  "last-30d",
  "next-7d",
  "next-30d",
  "overdue",
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number];

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: "Today",
  "this-week": "This week",
  "this-month": "This month",
  "last-7d": "Last 7 days",
  "last-30d": "Last 30 days",
  "next-7d": "Next 7 days",
  "next-30d": "Next 30 days",
  overdue: "Overdue",
};

export type DateRangeValue = { from?: string; to?: string };
export type NumberRangeValue = { min?: number; max?: number };

/**
 * What one filter is narrowed to.
 *
 * - a list of values — statuses, owner ids (with `me` and `none`), group ids;
 * - a day range (`YYYY-MM-DD`, either end open) or a preset;
 * - a number range;
 * - `true`, for an on/off filter.
 */
export type FilterValue =
  | readonly string[]
  | DateRangeValue
  | { preset: DatePreset }
  | NumberRangeValue
  | true;

export type SortDir = "asc" | "desc";

/**
 * Everything that decides which records a list shows and how.
 *
 * The page number is not here: a saved view is "these records, like this",
 * and page 3 of it is a place in a scroll, not part of the question.
 */
export type ViewState = {
  q?: string;
  filters: Readonly<Record<string, FilterValue>>;
  sort?: { key: string; dir: SortDir };
  layout?: Layout;
  /** Group by — a key of the register's `groupBys`. */
  by?: string;
  /** The table's columns, visible and in order. Absent: the register's defaults. */
  columns?: readonly string[];
};

export type FilterOption = { value: string; label: string };

export type FilterKind =
  | "enum"
  | "person"
  | "relation"
  | "date"
  | "number"
  | "boolean"
  | "group";

export type FilterDef = {
  key: string;
  label: string;
  kind: FilterKind;
  /** `enum`: the answers, when they are fixed. */
  options?: readonly FilterOption[];
  /**
   * `enum`: the answers come from the records themselves — every city a site
   * is in — the way a spreadsheet's column filter lists what is in the column.
   */
  facet?: boolean;
  /** `relation`: whose records to pick from. */
  relation?: "COMPANY" | "PERSON" | "DEAL" | "SITE" | "PROJECT" | "LEAD";
  /** What "no filter" is called on this chip — "Anyone", "All", "Anywhere". */
  anyLabel?: string;
  /** Only one value at a time (a radio rather than checkboxes). */
  single?: boolean;
  /**
   * Always on the toolbar as a chip, even when it narrows nothing — the few
   * questions this list is opened to answer. Everything else waits behind
   * "+ Filter" until it is used.
   */
  pinned?: boolean;
  /** `date`: the presets offered, in order. */
  presets?: readonly DatePreset[];
  /** `boolean`: what the chip says when it is on — "Overdue", "Archived". */
  onLabel?: string;
  /**
   * Read from the address bar but not offered under "+ Filter": a record's
   * own scope — the people at one company — which is reached from that
   * record's page rather than chosen from a menu.
   */
  offer?: false;
};

/** How an export writes a column, and how a cell is inked on screen. */
export type ColumnKind =
  | "text"
  | "code"
  | "email"
  | "phone"
  | "relation"
  | "date"
  | "datetime"
  | "number"
  | "money"
  | "percent"
  | "status"
  | "boolean";

export type ColumnDef = {
  id: string;
  label: string;
  kind: ColumnKind;
  /** The one column a table is not a table without — never hidden. */
  required?: boolean;
  /** Off until somebody turns it on. */
  hiddenByDefault?: boolean;
  /** In the export only: facts a table has no room for but a spreadsheet does. */
  exportOnly?: boolean;
  /** The sort key this column's header sorts by, when it sorts. */
  sort?: string;
};

export type SortDef = { key: string; label: string; dir: SortDir };

export type GroupByDef = { key: string; label: string };

export type BuiltInView = {
  key: string;
  name: string;
  state: ViewState;
};

export type BulkActionKey = "assign" | "archive" | "restore" | "group" | "status" | "complete";

export type RegisterDef = {
  key: RegisterKey;
  noun: { one: string; many: string };
  /** The page the list lives on. */
  route: string;
  /** The list endpoint. It reads the same query string as the page. */
  endpoint: string;
  /**
   * The query-cache prefix the list is fetched under. Kept to what each list
   * already used, because every form that changes one of its records
   * refreshes the list by this prefix.
   */
  queryKey: readonly string[];
  layouts: readonly Layout[];
  search: { placeholder: string };
  filters: readonly FilterDef[];
  sorts: readonly SortDef[];
  groupBys?: readonly GroupByDef[];
  columns: readonly ColumnDef[];
  /** `[0]` is where the list opens. */
  views: readonly [BuiltInView, ...BuiltInView[]];
  /** What a selection can be done to. Export is always offered. */
  bulk: readonly BulkActionKey[];
  /** `status` bulk action: the answers, when the register has one. */
  statusOptions?: readonly FilterOption[];
  /**
   * Which kind of record a group (a `CrmList`) holds for this register, when
   * records here can be put in groups.
   */
  groupEntity?: "LEAD" | "DEAL" | "PERSON" | "COMPANY" | "SITE" | "WORK_ORDER";
};

/** A custom field's filter key: `cf.<field key>`. */
export const CUSTOM_FIELD_PREFIX = "cf.";

export function isCustomFieldKey(key: string): boolean {
  return key.startsWith(CUSTOM_FIELD_PREFIX) && key.length > CUSTOM_FIELD_PREFIX.length;
}
