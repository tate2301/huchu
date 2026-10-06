import { canReadReport } from "@/lib/reports/access";
import { reportMeta } from "@/lib/reports/catalog";
import {
  canReadList,
  engineColumns,
  listColumnsFor,
  listIds,
  listQueryToView,
  listShape,
  loaderParams,
  publicListSpec,
  resolveListQuery,
  runSource,
  type ListContext,
  type ListRun,
} from "@/lib/reports/list-query";
import { resolveParams } from "@/lib/reports/params";
import { getReport } from "@/lib/reports/server";
import { readReportSetting } from "@/lib/reports/settings";
import { layTemplate, templateQueryFor } from "@/lib/reports/template-query";
import { visibleColumns } from "@/lib/reports/view";
import { prisma } from "@/lib/prisma";
import {
  REPORT_ROW_LIMIT,
  type ListIdsResponse,
  type ListOption,
  type ListPageResponse,
  type ListPageResult,
  type ListQuery,
  type ListSpec,
  type ReportContext,
  type ReportDefinition,
  type ReportLoadResult,
  type ReportMeta,
  type ReportParam,
  type ReportParams,
  type ResolvedListQuery,
} from "@/lib/reports/types";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { canRetailSessionDo, canSeeRetailCostPrice, retailRoleKey } from "@/lib/retail/permissions";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

/**
 * A report, fetched for a session: the one path both the screen and the export
 * take, so they read the same rows under the same checks.
 */

export type ReportFetch = {
  meta: ReportMeta;
  params: ReportParams;
  definition: ReportDefinition;
} & ReportLoadResult;

export function contextFor(session: AuthenticatedSession): ReportContext {
  return { companyId: session.user.companyId, userId: session.user.id, role: session.user.role };
}

/** Null when there is no such report or this session may not read it — the same answer for both. */
export async function fetchReport(
  session: AuthenticatedSession,
  key: string,
  given: ReportParams,
  /** A manager arranging a switched-off report still needs its rows to see the page. */
  { preview = false }: { preview?: boolean } = {},
): Promise<ReportFetch | null> {
  const report = getReport(key);
  // A working list or a report face is read in list mode only (`?page=`).
  if (!report || report.definition.list || report.definition.report) return null;
  const { definition, loader } = report;
  if (!canReadReport(definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
    return null;
  }

  const ctx = contextFor(session);
  // A report the workspace switched off is not there for anybody, the same
  // answer as a report that does not exist.
  const saved = await readReportSetting(ctx.companyId, key);
  if (saved && !saved.enabled && !preview) return null;
  const options = loader.options ? await loader.options(ctx) : {};
  const declared: ReportParam[] = definition.params.map((param) =>
    param.type === "choice" && options[param.key] ? { ...param, options: options[param.key]! } : param,
  );
  const params = resolveParams(declared, given);
  const loaded = await loader.load(ctx, params);
  const meta = reportMeta(definition, session.user.role, declared, saved);
  return { ...loaded, params, definition, meta };
}

/** The params a request carries: everything in its query string but the view. */
export function paramsFromSearch(search: URLSearchParams): ReportParams {
  const params: ReportParams = {};
  for (const [key, value] of search) if (key !== "v" && key !== "preview" && key !== "template") params[key] = value;
  return params;
}

/* ──────────────────────────────────────────────────────────────────────────
   Lists (00-foundations 4.1)
   ────────────────────────────────────────────────────────────────────────── */

/** The caller as the list engine asks about them: the matrix, cost, the clock, the zone. */
export function listContext(session: AuthenticatedSession, now = new Date()): ListContext {
  const role = session.user.role;
  return {
    role,
    userId: session.user.id,
    now,
    timeZone: DEFAULT_TIME_ZONE,
    can: ([resource, action]) => canRetailSessionDo(session, resource, action),
    seeCost: canSeeRetailCostPrice(retailRoleKey(session)),
  };
}

/** Why a list was not answered: the same 404 for "no such list" and "not for you", 403 for the list's own check. */
export type ListRefusal = { status: 403 | 404; error: string };

type OpenList = {
  /** `list` is the spec in the shape asked for: rolled up, its columns in the order asked for. */
  definition: ReportDefinition & { list: ListSpec };
  /** The source's list or report face, as this company has it, before it is shaped. */
  spec: ListSpec;
  meta: ReportMeta;
  ctx: ListContext;
  loaded: Record<string, ListOption[]>;
  resolved: ResolvedListQuery;
  rows: () => Promise<ReportLoadResult>;
  page: ((query: ResolvedListQuery) => Promise<ListPageResult>) | null;
  parentLabel: ((filters: Record<string, string>) => Promise<string | null>) | null;
};

/** Whether a source has a column or filter that only a company with two open sites sees. */
function needsSites(spec: ListSpec): boolean {
  return (
    spec.columns.some((column) => column.requires === "multi-site") ||
    spec.filters.some((filter) => filter.type === "choice" && filter.requires === "multi-site") ||
    [...(spec.rowMenu ?? []), ...(spec.bulk ?? [])].some((action) => "sites" in action && action.sites === "multi-site")
  );
}

/**
 * The source as this company has it: with one open site, no Site column,
 * filter or site-to-site action (5.21 "a shop with one site never sees the
 * word"), values and all.
 */
async function forSites<T extends ListSpec>(spec: T, companyId: string): Promise<T | ListRefusal> {
  if (!needsSites(spec) && !spec.multiSiteOnly) return spec;
  const sites = await prisma.site.count({ where: { companyId, isActive: true } });
  if (sites >= 2) return spec;
  if (spec.multiSiteOnly) return { status: 403, error: spec.multiSiteOnly.refusal };
  return {
    ...spec,
    columns: spec.columns.filter((column) => column.requires !== "multi-site"),
    filters: spec.filters.filter((filter) => filter.type !== "choice" || filter.requires !== "multi-site"),
    groups: spec.groups?.filter((key) => spec.columns.find((column) => column.key === key)?.requires !== "multi-site"),
    rowMenu: spec.rowMenu?.filter((action) => action.sites !== "multi-site"),
    bulk: spec.bulk?.filter((action) => !("sites" in action) || action.sites !== "multi-site"),
  };
}

async function openList(session: AuthenticatedSession, key: string, query: ListQuery): Promise<OpenList | ListRefusal> {
  const report = getReport(key);
  if (!report) return { status: 404, error: "Report not found" };
  const { definition: declared, loader } = report;
  const ctx = listContext(session);

  // A template lies under the address; it is Reports', so it reads the report face.
  let asked = query;
  if (query.template) {
    const template = templateQueryFor(query.template, session);
    if (!template || template.source !== key || !declared.report || !canReadList(declared.report, ctx)) {
      return { status: 404, error: "Template not found" };
    }
    asked = layTemplate(template.query, query, declared.report);
  }

  const face = asked.face === "report" ? "report" : "list";
  const facing = face === "report" ? declared.report : declared.list;
  if (!facing) return { status: 404, error: "Report not found" };
  const reportCtx = contextFor(session);
  const spec = await forSites<ListSpec>(facing, reportCtx.companyId);
  if (refused(spec)) return spec;
  // The list's own check first, so a role it refuses is told so in words
  // ("Your role cannot view shifts") rather than that the list does not exist.
  if (!canReadList(spec, ctx)) return { status: 403, error: `Your role cannot view ${spec.noun}` };
  if (!canReadReport(declared, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
    return { status: 404, error: "Report not found" };
  }

  const saved = await readReportSetting(reportCtx.companyId, key);
  if (saved && !saved.enabled) return { status: 404, error: "Report not found" };

  const loaded: Record<string, ListOption[]> = loader.options ? await loader.options(reportCtx) : {};
  const resolved = resolveListQuery(spec, asked, loaded, ctx);
  const shape = listShape(spec, resolved);
  const definition = { ...declared, columns: shape.columns, list: shape };
  // A database-paged loader pages its source's own spec: the list, or the face of a report-only source.
  const paged = loader.page && (face === "list" || !declared.list) ? loader.page : null;
  return {
    definition,
    spec,
    meta: reportMeta(definition, session.user.role, definition.params, saved),
    ctx,
    loaded,
    resolved,
    rows: () => loader.load(reportCtx, loaderParams(resolved), face),
    page: paged ? (resolved) => paged(reportCtx, resolved) : null,
    parentLabel: loader.parentLabel ? (filters) => loader.parentLabel!(reportCtx, filters) : null,
  };
}

function refused<T extends object>(opened: T | ListRefusal): opened is ListRefusal {
  return "error" in opened;
}

/** Every filtered row, narrowed and ordered the way the page is. */
async function runOpened(opened: OpenList, rowIds?: ReadonlySet<string>): Promise<ListRun> {
  const loaded = await opened.rows();
  return runSource(opened.spec, loaded.rows, opened.resolved, opened.ctx, {
    loaded: opened.loaded,
    truncated: loaded.truncated,
    rowIds,
  });
}

/** One page of a list, with the totals, groups, summaries and tab counts of every filtered row. */
export async function fetchListPage(
  session: AuthenticatedSession,
  key: string,
  query: ListQuery,
): Promise<ListPageResponse | ListRefusal> {
  const opened = await openList(session, key, query);
  if (refused(opened)) return opened;
  const { definition, ctx, loaded, resolved } = opened;
  const result = opened.page ? await opened.page(resolved) : (await runOpened(opened)).result;
  const list = publicListSpec(definition.list, ctx, loaded);
  return {
    ...result,
    parent: await parentOf(opened),
    report: { ...opened.meta, columns: list.columns, list },
    query: { ...resolved, page: result.page },
    size: resolved.size,
  };
}

/** The record a parent filter with `all` scopes this list to, named by the loader. */
async function parentOf(opened: OpenList): Promise<ListPageResponse["parent"]> {
  const filter = opened.definition.list.filters.find(
    (candidate): candidate is Extract<ListSpec["filters"][number], { type: "parent" }> =>
      candidate.type === "parent" && Boolean(candidate.all) && Boolean(opened.resolved.filters[candidate.key]),
  );
  if (!filter || !opened.parentLabel) return null;
  const label = await opened.parentLabel(opened.resolved.filters);
  return label ? { key: filter.key, label, all: filter.all! } : null;
}

/** Every matching id, for "Select all <n>". */
export async function fetchListIds(
  session: AuthenticatedSession,
  key: string,
  query: ListQuery,
  pick: string[] = [],
): Promise<ListIdsResponse | ListRefusal> {
  const opened = await openList(session, key, query);
  if (refused(opened)) return opened;
  return listIds(await runOpened(opened), pick, listColumnsFor(opened.definition.list, opened.ctx.seeCost));
}

export type ListExport = ListRun &
  Pick<OpenList, "definition" | "meta" | "resolved" | "ctx" | "loaded">;

/**
 * A list's filtered rows, ordered and grouped as on screen, for a file. It
 * takes the page's path: a database-paged source is asked for every row at
 * once (at most `REPORT_ROW_LIMIT`). A selection is a few rows, read in memory.
 */
export async function fetchListExport(
  session: AuthenticatedSession,
  key: string,
  query: ListQuery,
  rowIds?: string[],
): Promise<ListExport | ListRefusal> {
  const opened = await openList(session, key, query);
  if (refused(opened)) return opened;
  const run =
    opened.page && !rowIds
      ? await pagedRun(opened, opened.page)
      : await runOpened(opened, rowIds ? new Set(rowIds) : undefined);
  return {
    ...run,
    definition: opened.definition,
    meta: { ...opened.meta, columns: listColumnsFor(opened.definition.list, opened.ctx.seeCost) },
    resolved: opened.resolved,
    ctx: opened.ctx,
    loaded: opened.loaded,
  };
}

/** Every row of a database-paged source as one page, made into the run an export prints. */
async function pagedRun(opened: OpenList, page: NonNullable<OpenList["page"]>): Promise<ListRun> {
  const result = await page({ ...opened.resolved, page: 1, size: REPORT_ROW_LIMIT });
  const shape = opened.definition.list;
  const columns = engineColumns(shape, result.rows, opened.loaded);
  const view = listQueryToView(shape, opened.resolved, columns, opened.ctx, opened.loaded);
  // The rows come grouped, each group's rows together in drawing order.
  let at = 0;
  const groups =
    result.groups?.map((group) => {
      const rows = result.rows.slice(at, at + group.count);
      at += group.count;
      return { value: group.value, rows, totals: group.totals };
    }) ?? null;
  return {
    result,
    ordered: result.rows,
    applied: { columns: visibleColumns(view, columns), rows: result.rows, groups, totals: result.totals },
    view,
  };
}
