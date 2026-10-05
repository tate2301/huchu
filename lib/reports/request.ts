import { canReadReport } from "@/lib/reports/access";
import { reportMeta } from "@/lib/reports/catalog";
import {
  canReadList,
  listColumnsFor,
  ownRows,
  listIds,
  loaderParams,
  publicListSpec,
  resolveListQuery,
  runList,
  type ListContext,
  type ListRun,
} from "@/lib/reports/list-query";
import { resolveParams } from "@/lib/reports/params";
import { getReport } from "@/lib/reports/server";
import { readReportSetting } from "@/lib/reports/settings";
import type {
  ListIdsResponse,
  ListOption,
  ListPageResponse,
  ListPageResult,
  ListQuery,
  ListSpec,
  ReportContext,
  ReportDefinition,
  ReportLoadResult,
  ReportMeta,
  ReportParam,
  ReportParams,
  ResolvedListQuery,
} from "@/lib/reports/types";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { canRetailRoleDo, canSeeRetailCostPrice } from "@/lib/retail/permissions";
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
  if (!report) return null;
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
  if (!definition.list) return { ...loaded, params, definition, meta };

  // A working list read as a report keeps the list's rules: its read check,
  // a cashier's own rows only, and no cost for roles that may not see it.
  const list = listContext(session);
  if (!canReadList(definition.list, list)) return null;
  const columns = listColumnsFor(definition.list, list.seeCost);
  const kept = new Set(columns.map((column) => column.key));
  const cost = definition.list.columns.filter((column) => !kept.has(column.key)).map((column) => column.key);
  return {
    rows: ownRows(definition.list, loaded.rows, list).map((row) => {
      const copy = { ...row };
      for (const key of cost) delete copy[key];
      return copy;
    }),
    truncated: loaded.truncated,
    params,
    definition,
    meta: { ...meta, columns: meta.columns.filter((column) => kept.has(column.key)) },
  };
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
    can: ([resource, action]) => canRetailRoleDo(role, resource, action),
    seeCost: canSeeRetailCostPrice(role),
  };
}

/** Why a list was not answered: the same 404 for "no such list" and "not for you", 403 for the list's own check. */
export type ListRefusal = { status: 403 | 404; error: string };

type OpenList = {
  definition: ReportDefinition & { list: ListSpec };
  meta: ReportMeta;
  ctx: ListContext;
  loaded: Record<string, ListOption[]>;
  resolved: ResolvedListQuery;
  rows: () => Promise<ReportLoadResult>;
  page: ((query: ResolvedListQuery) => Promise<ListPageResult>) | null;
};

async function openList(session: AuthenticatedSession, key: string, query: ListQuery): Promise<OpenList | ListRefusal> {
  const report = getReport(key);
  if (!report?.definition.list) return { status: 404, error: "Report not found" };
  const { definition, loader } = report;
  const spec = definition.list!;
  // The list's own check first, so a role it refuses is told so in words
  // ("Your role cannot view shifts") rather than that the list does not exist.
  const ctx = listContext(session);
  if (!canReadList(spec, ctx)) return { status: 403, error: `Your role cannot view ${spec.noun}` };
  if (!canReadReport(definition, { role: session.user.role, enabledFeatures: session.user.enabledFeatures })) {
    return { status: 404, error: "Report not found" };
  }

  const reportCtx = contextFor(session);
  const saved = await readReportSetting(reportCtx.companyId, key);
  if (saved && !saved.enabled) return { status: 404, error: "Report not found" };

  const loaded: Record<string, ListOption[]> = loader.options ? await loader.options(reportCtx) : {};
  const resolved = resolveListQuery(spec, query, loaded, ctx);
  return {
    definition: definition as OpenList["definition"],
    meta: reportMeta(definition, session.user.role, definition.params, saved),
    ctx,
    loaded,
    resolved,
    rows: () => loader.load(reportCtx, loaderParams(resolved)),
    page: loader.page ? (resolved) => loader.page!(reportCtx, resolved) : null,
  };
}

function refused(opened: OpenList | ListRefusal): opened is ListRefusal {
  return "error" in opened;
}

/** Every filtered row, narrowed and ordered the way the page is. */
async function runOpened(opened: OpenList, rowIds?: ReadonlySet<string>): Promise<ListRun> {
  const loaded = await opened.rows();
  return runList(opened.definition.list, loaded.rows, opened.resolved, opened.ctx, {
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
    report: { ...opened.meta, columns: list.columns, list },
    query: { ...resolved, page: result.page },
    size: resolved.size,
  };
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

/** A list's filtered rows, ordered and grouped as on screen, for a file. */
export async function fetchListExport(
  session: AuthenticatedSession,
  key: string,
  query: ListQuery,
  rowIds?: string[],
): Promise<ListExport | ListRefusal> {
  const opened = await openList(session, key, query);
  if (refused(opened)) return opened;
  const run = await runOpened(opened, rowIds ? new Set(rowIds) : undefined);
  return {
    ...run,
    definition: opened.definition,
    meta: { ...opened.meta, columns: listColumnsFor(opened.definition.list, opened.ctx.seeCost) },
    resolved: opened.resolved,
    ctx: opened.ctx,
    loaded: opened.loaded,
  };
}
