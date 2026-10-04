import {
  LIST_IDS_CAP,
  LIST_PAGE_SIZES,
  PERIOD_PRESETS,
  type Condition,
  type ListAction,
  type ListColumn,
  type ListGrant,
  type ListGroup,
  type ListIdsResponse,
  type ListOption,
  type ListPageResult,
  type ListPageSize,
  type ListQuery,
  type ListSpec,
  type ListSpecPublic,
  type ListSummary,
  type PeriodPreset,
  type ReportColumn,
  type ReportColumnKind,
  type ReportParams,
  type ReportRow,
  type ReportValue,
  type ReportView,
  type ResolvedListQuery,
  type SortRule,
} from "@/lib/reports/types";
import { applyView, filterRows, type AppliedView, type ReportGroup } from "@/lib/reports/view";
import { dayKey } from "@/lib/workspace/format";

/**
 * A list page, worked out from a source's rows (00-foundations 4.1, 5.4.2).
 *
 * The address says what somebody asked for; `resolveListQuery` checks every
 * value against the source and fills the defaults, so an unknown filter value,
 * sort or group is the default and never an error. `runList` then narrows,
 * sorts and groups every row the caller may see, totals the whole filtered set,
 * counts the tabs before search and filters, and cuts out one page — the
 * totals never come from adding up the page.
 *
 * Pure. Permissions arrive as answers (`can`, `seeCost`) and the clock as `now`,
 * so the route, the export and the tests all run the same arithmetic.
 */

export type ListContext = {
  role: string;
  userId: string;
  now: Date;
  timeZone: string;
  /** Whether this caller holds a grant. */
  can: (grant: ListGrant) => boolean;
  /** Whether this caller may see what the shop paid (`view-cost`). */
  seeCost: boolean;
};

/* ──────────────────────────────────────────────────────────────────────────
   Reading the address
   ────────────────────────────────────────────────────────────────────────── */

const RESERVED = new Set(["page", "size", "tab", "q", "sort", "group", "cols", "idsOnly", "preview", "template", "v"]);

export function parseListQuery(search: URLSearchParams): ListQuery {
  const filters: Record<string, string> = {};
  for (const [key, value] of search) {
    if (!RESERVED.has(key) && !(key in filters)) filters[key] = value;
  }
  const cols = search.get("cols");
  return {
    ...(search.has("tab") ? { tab: search.get("tab")! } : {}),
    ...(search.has("q") ? { q: search.get("q")! } : {}),
    ...(search.has("sort") ? { sort: search.get("sort")! } : {}),
    ...(search.has("group") ? { group: search.get("group")! } : {}),
    page: Number(search.get("page") ?? 1),
    size: Number(search.get("size") ?? 50),
    filters,
    ...(cols !== null ? { hidden: cols.split(",").filter(Boolean) } : {}),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Periods
   ────────────────────────────────────────────────────────────────────────── */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!) + days * DAY_MS).toISOString().slice(0, 10);
}

function validDay(day: string): boolean {
  return ISO_DAY.test(day) && addDays(day, 0) === day;
}

/** `30d`, `this-month`, … or `YYYY-MM-DD..YYYY-MM-DD` (either end may be open). */
export function isPeriodValue(value: string): boolean {
  if ((PERIOD_PRESETS as readonly string[]).includes(value)) return true;
  const match = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  if (match[1] && !validDay(match[1])) return false;
  if (match[2] && !validDay(match[2])) return false;
  return !(match[1] && match[2] && match[1] > match[2]);
}

/**
 * A period as calendar days in the company's zone, both ends included, or null
 * for "Any time". "Last 30 days" on 3 October is 4 September to 3 October.
 */
export function periodRange(
  value: PeriodPreset | string,
  now: Date,
  timeZone: string,
): { from: string | null; to: string | null } | null {
  const today = dayKey(now, timeZone);
  const monthStart = `${today.slice(0, 7)}-01`;
  switch (value) {
    case "any":
      return null;
    case "today":
      return { from: today, to: today };
    case "yesterday":
      return { from: addDays(today, -1), to: addDays(today, -1) };
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "this-month":
      return { from: monthStart, to: today };
    case "last-month": {
      const lastDay = addDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
    case "this-year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
  const [from, to] = value.split("..");
  return { from: from || null, to: to || null };
}

/** The instant a calendar day starts in a zone. */
export function startOfDayIn(day: string, timeZone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  const midnightUtc = Date.UTC(year!, month! - 1, date!);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - instant;
  };
  const first = midnightUtc - offset(midnightUtc);
  return new Date(midnightUtc - offset(first));
}

/** A period as instants for a database query: `gte` the first day's start, `lt` the day after the last. */
export function periodInstants(
  value: string,
  now: Date,
  timeZone: string,
): { gte?: Date; lt?: Date } | undefined {
  const range = periodRange(value, now, timeZone);
  if (!range) return undefined;
  return {
    ...(range.from ? { gte: startOfDayIn(range.from, timeZone) } : {}),
    ...(range.to ? { lt: startOfDayIn(addDays(range.to, 1), timeZone) } : {}),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Resolving a query against a source
   ────────────────────────────────────────────────────────────────────────── */

/** Whether this caller sees only their own rows. */
function scopedFor(spec: ListSpec, role: string): NonNullable<ListSpec["scopeOwn"]> | null {
  return spec.scopeOwn && spec.scopeOwn.roles.includes(role) ? spec.scopeOwn : null;
}

/** The columns this caller may see. Cost columns are gone, not hidden. */
export function listColumnsFor(spec: ListSpec, seeCost: boolean): ListColumn[] {
  return spec.columns.filter((column) => seeCost || column.requires !== "view-cost");
}

function choiceOptions(
  filter: Extract<ListSpec["filters"][number], { type: "choice" }>,
  loaded: Record<string, ListOption[]>,
): ListOption[] {
  return filter.options ?? loaded[filter.key] ?? [];
}

/** A named sort's key, or `<column>:asc|desc` for a sortable column. */
function sortRules(spec: ListSpec, sort: string, columns: ListColumn[]): SortRule[] | null {
  const named = spec.sorts.find((candidate) => candidate.key === sort);
  if (named) return named.rules;
  const match = /^([A-Za-z0-9_]+):(asc|desc)$/.exec(sort);
  if (!match) return null;
  const column = columns.find((candidate) => candidate.key === match[1] && candidate.sortable);
  if (!column) return null;
  const dir = match[2] as SortRule["dir"];
  // A day sorts with its time of day, or every shift on one day ties.
  return [{ column: column.key, dir }, ...(column.timeKey ? [{ column: column.timeKey, dir }] : [])];
}

function sameRules(a: SortRule[], b: SortRule[]): boolean {
  return a.length === b.length && a.every((rule, index) => rule.column === b[index]!.column && rule.dir === b[index]!.dir);
}

/**
 * Every value checked against the source and every gap filled. What the source
 * does not declare is ignored; a value it does not offer is its default.
 */
export function resolveListQuery(
  spec: ListSpec,
  query: ListQuery,
  loadedOptions: Record<string, ListOption[]>,
  ctx: Pick<ListContext, "role" | "seeCost">,
): ResolvedListQuery {
  const columns = listColumnsFor(spec, ctx.seeCost);
  const scope = scopedFor(spec, ctx.role);

  const tab = spec.tabs?.length
    ? (spec.tabs.find((candidate) => candidate.key === query.tab) ?? spec.tabs[0]!).key
    : null;

  const defaultSort = spec.sorts[0]?.key ?? "";
  let sort = defaultSort;
  if (query.sort) {
    const rules = sortRules(spec, query.sort, columns);
    if (rules) {
      // A column sort that equals a named one is that named one.
      sort = spec.sorts.find((candidate) => sameRules(candidate.rules, rules))?.key ?? query.sort;
    }
  }

  const groupable = (spec.groups ?? []).filter((key) => columns.some((column) => column.key === key));
  const defaultGroup = spec.defaultGroup && groupable.includes(spec.defaultGroup) ? spec.defaultGroup : null;
  const group =
    query.group === "none" ? null : query.group && groupable.includes(query.group) ? query.group : defaultGroup;

  const filters: Record<string, string> = {};
  for (const filter of spec.filters) {
    const given = query.filters[filter.key]?.trim() ?? "";
    if (filter.type === "parent") {
      if (given && given.length <= 100) filters[filter.key] = given;
      continue;
    }
    if (filter.type === "period") {
      const fallback = filter.default ?? "any";
      filters[filter.key] = given && isPeriodValue(given) ? given : fallback;
      continue;
    }
    const fallback = filter.default ?? "any";
    if (scope?.filter === filter.key) {
      filters[filter.key] = "any";
      continue;
    }
    const offered = given === "any" || choiceOptions(filter, loadedOptions).some((option) => option.value === given);
    filters[filter.key] = given && offered ? given : fallback;
  }

  const hideable = new Set(columns.slice(1).map((column) => column.key));
  const hidden = query.hidden
    ? [...new Set(query.hidden.filter((key) => hideable.has(key)))]
    : columns.filter((column) => column.hidden && hideable.has(column.key)).map((column) => column.key);

  const page = Number.isInteger(query.page) && query.page >= 1 ? query.page : 1;
  const size = (LIST_PAGE_SIZES as readonly number[]).includes(query.size) ? (query.size as ListPageSize) : 50;

  return { tab, q: (query.q ?? "").trim().slice(0, 200), sort, group, page, size, filters, hidden };
}

/** What a loader is handed: every filter that is on, by key. Parent filters included. */
export function loaderParams(resolved: ResolvedListQuery): ReportParams {
  return Object.fromEntries(Object.entries(resolved.filters).filter(([, value]) => value !== "any"));
}

/* ──────────────────────────────────────────────────────────────────────────
   The query as a view over the rows
   ────────────────────────────────────────────────────────────────────────── */

/** Every row key a source narrows or sorts by, as a column the view can read. */
function referencedKeys(spec: ListSpec, loaded: Record<string, ListOption[]>): string[] {
  const keys = new Set<string>();
  const conditions = (list: Condition[] | undefined) => list?.forEach((condition) => keys.add(condition.column));
  for (const filter of spec.filters) {
    if ("column" in filter && filter.column) keys.add(filter.column);
    if (filter.type === "choice") choiceOptions(filter, loaded).forEach((option) => conditions(option.where));
  }
  spec.tabs?.forEach((tab) => conditions(tab.where));
  spec.sorts.forEach((sort) => sort.rules.forEach((rule) => keys.add(rule.column)));
  spec.columns.forEach((column) => column.timeKey && keys.add(column.timeKey));
  if (spec.scopeOwn) keys.add(spec.scopeOwn.column);
  return [...keys];
}

/**
 * The source's columns plus the row keys it narrows and sorts by but does not
 * draw (a cashier's id, a till's code, the time of day), so the one view engine
 * can read them. Their kind is read off the rows: a number sorts as a number.
 */
export function engineColumns(
  spec: ListSpec,
  rows: ReportRow[],
  loaded: Record<string, ListOption[]> = {},
): ReportColumn[] {
  const declared = new Set(spec.columns.map((column) => column.key));
  const extra = referencedKeys(spec, loaded)
    .filter((key) => !declared.has(key))
    .map((key): ReportColumn => {
      const sample = rows.find((row) => row[key] !== null && row[key] !== undefined && row[key] !== "")?.[key];
      const kind: ReportColumnKind = typeof sample === "number" ? "number" : "text";
      return { key, label: key, kind, hidden: true };
    });
  return [...spec.columns, ...extra];
}

/** The conditions the filters and the tab put on the rows. */
export function listConditions(
  spec: ListSpec,
  resolved: ResolvedListQuery,
  loaded: Record<string, ListOption[]>,
  now: Date,
  timeZone: string,
): Condition[] {
  const conditions: Condition[] = [];
  const tab = spec.tabs?.find((candidate) => candidate.key === resolved.tab);
  if (tab) conditions.push(...tab.where);
  for (const filter of spec.filters) {
    const value = resolved.filters[filter.key];
    if (!value || value === "any") continue;
    if (filter.type === "parent") {
      conditions.push({ column: filter.column, op: "is", value: [value] });
    } else if (filter.type === "period") {
      const range = periodRange(value, now, timeZone);
      if (range) conditions.push({ column: filter.column, op: "between", value: [range.from ?? "", range.to ?? ""] });
    } else {
      const option = choiceOptions(filter, loaded).find((candidate) => candidate.value === value);
      if (option?.where) conditions.push(...option.where);
      else if (filter.column) conditions.push({ column: filter.column, op: "is", value: [value] });
      // Neither: the loader narrowed the rows by this param already.
    }
  }
  return conditions;
}

/** The query as a `ReportView`: what `applyView` reads, and what an export prints. */
export function listQueryToView(
  spec: ListSpec,
  resolved: ResolvedListQuery,
  columns: ReportColumn[],
  ctx: Pick<ListContext, "now" | "timeZone" | "seeCost">,
  loaded: Record<string, ListOption[]> = {},
): ReportView {
  const declared = new Map(spec.columns.map((column) => [column.key, column]));
  const shown = (key: string) => {
    const column = declared.get(key);
    if (!column) return false;
    if (column.requires === "view-cost" && !ctx.seeCost) return false;
    return !resolved.hidden.includes(key);
  };
  return {
    columns: columns.map((column) => ({ key: column.key, hidden: !shown(column.key) })),
    conditions: listConditions(spec, resolved, loaded, ctx.now, ctx.timeZone),
    search: "",
    sort: sortRules(spec, resolved.sort, listColumnsFor(spec, ctx.seeCost)) ?? spec.sorts[0]?.rules ?? [],
    groupBy: resolved.group,
    totals: Object.fromEntries(
      spec.columns
        .filter((column) => column.total && (ctx.seeCost || column.requires !== "view-cost"))
        .map((column) => [column.key, column.total!]),
    ),
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   Counting
   ────────────────────────────────────────────────────────────────────────── */

/** Rows in each tab, ignoring search and filters: the sizes of the tabs. */
export function tabCounts(spec: ListSpec, rows: ReportRow[], columns: ReportColumn[]): Record<string, number> | null {
  if (!spec.tabs?.length) return null;
  const view = (where: Condition[]): ReportView => ({
    columns: columns.map((column) => ({ key: column.key, hidden: false })),
    conditions: where,
    search: "",
    sort: [],
    groupBy: null,
    totals: {},
  });
  return Object.fromEntries(spec.tabs.map((tab) => [tab.key, filterRows(rows, columns, view(tab.where)).length]));
}

/** For each state column with a summary: how many rows need looking at ("23 to check"). */
export function summaries(spec: ListSpec, rows: ReportRow[]): ListSummary {
  const out: ListSummary = {};
  for (const column of spec.columns) {
    if (!column.summary || !column.tones) continue;
    const wanted = new Set(column.summary.tones);
    const count = rows.filter((row) => {
      const tone = column.tones![String(row[column.key] ?? "")];
      return tone !== undefined && wanted.has(tone);
    }).length;
    out[column.key] = { count, label: column.summary.label, tone: "pending" };
  }
  return out;
}

/** The page asked for, or the last one when the filters left fewer. */
export function pageOf<T>(rows: T[], page: number, size: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((current - 1) * size, current * size), page: current, pages };
}

/* ──────────────────────────────────────────────────────────────────────────
   The whole thing
   ────────────────────────────────────────────────────────────────────────── */

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function blank(value: ReportValue | undefined): boolean {
  return value === null || value === undefined || value === "";
}

/** Groups in drawing order: a state column's tone order, else by name; blank last. */
function orderGroups(groups: ReportGroup[], column: ListColumn | undefined): ReportGroup[] {
  const order = column?.tones ? Object.keys(column.tones) : null;
  const rank = (group: ReportGroup) => {
    if (blank(group.value)) return Number.MAX_SAFE_INTEGER;
    const at = order ? order.indexOf(String(group.value)) : -1;
    return at === -1 ? Number.MAX_SAFE_INTEGER - 1 : at;
  };
  return [...groups].sort((a, b) => rank(a) - rank(b) || collator.compare(String(a.value ?? ""), String(b.value ?? "")));
}

function searchRows(rows: ReportRow[], keys: string[], q: string): ReportRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => keys.some((key) => !blank(row[key]) && String(row[key]).toLowerCase().includes(needle)));
}

function stripCost(spec: ListSpec, seeCost: boolean) {
  const cost = seeCost ? [] : spec.columns.filter((column) => column.requires === "view-cost").map((c) => c.key);
  const strip = <T extends Record<string, unknown>>(record: T): T => {
    if (cost.length === 0) return record;
    const copy = { ...record };
    for (const key of cost) delete copy[key];
    return copy;
  };
  return strip;
}

/** The rows this caller may see at all: a cashier's own shifts, everyone else's every one. */
export function ownRows(spec: ListSpec, rows: ReportRow[], ctx: Pick<ListContext, "role" | "userId">): ReportRow[] {
  const scope = scopedFor(spec, ctx.role);
  return scope ? rows.filter((row) => row[scope.column] === ctx.userId) : rows;
}

export type ListRun = {
  /** The page and everything the frame draws around it. */
  result: ListPageResult;
  /** Every filtered row in drawing order (grouped: by group, then by sort), cost stripped. */
  ordered: ReportRow[];
  /** The same set as an applied view, for the export. */
  applied: AppliedView;
  view: ReportView;
};

/**
 * Narrow, sort, group, total and page a source's rows for one caller.
 *
 * `rows` is everything the loader returned. The caller's own scope (a cashier's
 * shifts) and a parent filter come first and are the whole world: tab counts
 * and "nothing at all" are counted inside them. Then the tab, the filters and
 * the search narrow; totals, summaries and group subtotals are over everything
 * left; and only then is a page cut.
 */
export function runList(
  spec: ListSpec,
  rows: ReportRow[],
  resolved: ResolvedListQuery,
  ctx: ListContext,
  {
    loaded = {},
    truncated = false,
    rowIds,
  }: { loaded?: Record<string, ListOption[]>; truncated?: boolean; rowIds?: ReadonlySet<string> } = {},
): ListRun {
  const columns = engineColumns(spec, rows, loaded);
  const parents = spec.filters.filter(
    (filter): filter is Extract<ListSpec["filters"][number], { type: "parent" }> =>
      filter.type === "parent" && Boolean(resolved.filters[filter.key]),
  );

  const base = ownRows(spec, rows, ctx).filter((row) =>
    parents.every((filter) => String(row[filter.column] ?? "") === resolved.filters[filter.key]),
  );

  const view = listQueryToView(spec, resolved, columns, ctx, loaded);
  const searchKeys = spec.search.keys.filter((key) => !resolved.hidden.includes(key));
  const picked = rowIds ? base.filter((row) => rowIds.has(row.id)) : base;
  const applied = applyView(searchRows(picked, searchKeys, resolved.q), columns, view);

  const groupColumn = spec.columns.find((column) => column.key === resolved.group);
  const groups = applied.groups ? orderGroups(applied.groups, groupColumn) : null;
  const strip = stripCost(spec, ctx.seeCost);
  const ordered = (groups ? groups.flatMap((group) => group.rows) : applied.rows).map(strip);
  const paged = pageOf(ordered, resolved.page, resolved.size);

  const listGroups: ListGroup[] | null = groups
    ? groups.map((group) => ({
        value: blank(group.value) ? null : String(group.value),
        label: blank(group.value) ? "None" : String(group.value),
        tone: groupColumn?.tones?.[String(group.value ?? "")] ?? null,
        count: group.rows.length,
        totals: strip(group.totals),
      }))
    : null;

  return {
    result: {
      total: ordered.length,
      pages: paged.pages,
      page: paged.page,
      rows: paged.rows,
      groups: listGroups,
      totals: strip(applied.totals),
      summary: summaries(spec, applied.rows),
      tabs: tabCounts(spec, base, columns),
      everEmpty: base.length === 0,
      truncated,
    },
    ordered,
    applied: {
      columns: applied.columns,
      rows: ordered,
      groups: groups
        ? groups.map((group) => ({ ...group, rows: group.rows.map(strip), totals: strip(group.totals) }))
        : null,
      totals: strip(applied.totals),
    },
    view,
  };
}

/** Every matching id, in order, for "Select all". At most `LIST_IDS_CAP`. */
export function listIds(run: Pick<ListRun, "ordered">): ListIdsResponse {
  return {
    ids: run.ordered.slice(0, LIST_IDS_CAP).map((row) => row.id),
    total: run.ordered.length,
    capped: run.ordered.length > LIST_IDS_CAP,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
   What the browser is told
   ────────────────────────────────────────────────────────────────────────── */

function allowed(action: ListAction, ctx: Pick<ListContext, "can">): boolean {
  return action.requires.some((grant) => ctx.can(grant));
}

/**
 * The source as one caller sees it: their columns, their filters with the
 * company's options, their actions. No grants and no scoping rule.
 */
export function publicListSpec(
  spec: ListSpec,
  ctx: Pick<ListContext, "role" | "can" | "seeCost">,
  loaded: Record<string, ListOption[]>,
): ListSpecPublic {
  const columns = listColumnsFor(spec, ctx.seeCost);
  const keys = new Set(columns.map((column) => column.key));
  const cost = new Set(spec.columns.filter((column) => !keys.has(column.key)).map((column) => column.key));
  const scope = scopedFor(spec, ctx.role);
  const { read: _read, scopeOwn: _scopeOwn, primary, ...rest } = spec;
  void _read;
  void _scopeOwn;
  return {
    ...rest,
    columns,
    filters: spec.filters
      .filter((filter) => filter.key !== scope?.filter && !("column" in filter && filter.column && cost.has(filter.column)))
      .map((filter) => (filter.type === "choice" ? { ...filter, options: choiceOptions(filter, loaded) } : filter)),
    groups: spec.groups?.filter((key) => keys.has(key)),
    sorts: spec.sorts.filter((sort) => sort.rules.every((rule) => !cost.has(rule.column))),
    rowMenu: spec.rowMenu?.filter((action) => allowed(action, ctx)),
    bulk: spec.bulk?.filter((action) => !("requires" in action) || allowed(action, ctx)),
    primary:
      primary && primary.requires.some((grant) => ctx.can(grant))
        ? {
            label: primary.label,
            ...(primary.icon ? { icon: primary.icon } : {}),
            ...(primary.sheet ? { sheet: primary.sheet } : {}),
            ...(primary.href ? { href: primary.href } : {}),
          }
        : null,
  };
}

/** May this caller read the list at all? */
export function canReadList(spec: ListSpec, ctx: Pick<ListContext, "can">): boolean {
  return spec.read.some((grant) => ctx.can(grant));
}
