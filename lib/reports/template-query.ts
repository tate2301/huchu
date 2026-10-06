import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { builtInTemplate, type TemplateQuery } from "@/lib/reports/definitions/retail/templates";
import { rolledFace, rollupKeys } from "@/lib/reports/rollup";
import type { ListQuery, ReportFace, ReportParams, ReportView, SortRule } from "@/lib/reports/types";
import { canRetailSessionDo } from "@/lib/retail/permissions";

/**
 * A Reports template's query, both ways (70-insights-reports decision 6): the
 * `TemplateQuery` a built-in is written in and a run page's address carries,
 * and the `ReportView` + params a saved `ReportTemplate` row stores. Rollup
 * keys and the order of the columns survive the trip.
 */

/** `at:desc,id:desc` → rules. */
function parseRules(sort: string): SortRule[] | null {
  const rules = sort.split(",").map((part) => /^([A-Za-z0-9_]+):(asc|desc)$/.exec(part));
  if (rules.length === 0 || rules.some((match) => !match)) return null;
  return rules.map((match) => ({ column: match![1]!, dir: match![2] as SortRule["dir"] }));
}

const sameRules = (a: SortRule[], b: SortRule[]) =>
  a.length === b.length && a.every((rule, index) => rule.column === b[index]!.column && rule.dir === b[index]!.dir);

/** A template's sort as rules: a face's named sort, or rules written out. */
function rulesFor(sort: string | undefined, face: ReportFace): SortRule[] {
  if (!sort) return face.sorts[0]?.rules ?? [];
  return face.sorts.find((candidate) => candidate.key === sort)?.rules ?? parseRules(sort) ?? face.sorts[0]?.rules ?? [];
}

/** The shape's columns: rolled up by `rows`, or the face's without its rolled-up-only count. */
function shapeColumns(face: ReportFace, rows: string[]) {
  return rows.length ? rolledFace(face, rows).columns : face.columns.filter((column) => column.key !== face.rollupOnly);
}

/** What a saved template keeps → its query. */
export function toTemplateQuery(view: ReportView, params: ReportParams): TemplateQuery {
  return {
    filters: { ...params },
    ...(view.rows?.length ? { rows: [...view.rows] } : {}),
    cols: view.columns.filter((column) => !column.hidden).map((column) => column.key),
    ...(view.sort.length ? { sort: view.sort.map((rule) => `${rule.column}:${rule.dir}`).join(",") } : {}),
    group: view.groupBy ?? "none",
    ...(view.search ? { q: view.search } : {}),
  };
}

/** A query → the view and params a template keeps, over this face. */
export function fromTemplateQuery(query: TemplateQuery, face: ReportFace): { view: ReportView; params: ReportParams } {
  const rows = rollupKeys(face, query.rows);
  const columns = shapeColumns(face, rows);
  const known = new Set(columns.map((column) => column.key));
  const shown = (query.cols ?? columns.filter((column) => !column.hidden).map((column) => column.key)).filter((key) => known.has(key));
  const ordered = [
    ...shown.map((key) => ({ key, hidden: false })),
    ...columns.filter((column) => !shown.includes(column.key)).map((column) => ({ key: column.key, hidden: true })),
  ];
  return {
    view: {
      columns: ordered,
      conditions: [],
      search: query.q ?? "",
      sort: rulesFor(query.sort, face),
      groupBy: !query.group || query.group === "none" ? null : query.group,
      totals: Object.fromEntries(columns.filter((column) => column.total).map((column) => [column.key, column.total!])),
      ...(rows.length ? { rows } : {}),
    },
    params: { ...query.filters },
  };
}

/** The address's `sort` for a template's: the face's named sort with the same rules, else the first rule. */
function listSortFor(sort: string | undefined, face: ReportFace): string | undefined {
  if (!sort) return undefined;
  if (face.sorts.some((candidate) => candidate.key === sort)) return sort;
  const rules = parseRules(sort);
  if (!rules) return undefined;
  return face.sorts.find((candidate) => sameRules(candidate.rules, rules))?.key ?? `${rules[0]!.column}:${rules[0]!.dir}`;
}

/** The template's query under the address's: whatever the address says wins. */
export function layTemplate(template: TemplateQuery, query: ListQuery, face: ReportFace): ListQuery {
  const sort = query.sort ?? listSortFor(template.sort, face);
  const group = query.group ?? template.group;
  const q = query.q ?? template.q;
  return {
    ...query,
    face: "report",
    filters: { ...template.filters, ...query.filters },
    ...(sort ? { sort } : {}),
    ...(group ? { group } : {}),
    ...(q ? { q } : {}),
    ...((query.rows ?? template.rows) ? { rows: query.rows ?? template.rows } : {}),
    ...((query.cols ?? template.cols) ? { cols: query.cols ?? template.cols } : {}),
  };
}

/**
 * A template by its reference, for this session: the source it reads and its
 * query, or null when there is no such template or it is not theirs to open.
 * Reports is the owner's, manager's and bookkeeper's (C-35): `template=` needs
 * `retail.reports:view`, and both audiences are among those roles. Saved
 * templates join with the Reports pages (INS-07, INS-08).
 */
export function templateQueryFor(
  ref: string,
  session: AuthenticatedSession,
): { source: string; query: TemplateQuery } | null {
  if (!canRetailSessionDo(session, "retail.reports", "view")) return null;
  const builtIn = builtInTemplate(ref);
  return builtIn ? { source: builtIn.source, query: builtIn.query } : null;
}
