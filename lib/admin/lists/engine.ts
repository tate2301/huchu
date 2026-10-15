import type { SignedInOperator } from "@/lib/operators/guards";
import { operatorCan } from "@/lib/operators/roles";
import {
  canReadList,
  listColumnsFor,
  listIds,
  listShape,
  publicListSpec,
  resolveListQuery,
  runSource,
  type ListContext,
  type ListRun,
} from "@/lib/reports/list-query";
import type {
  ListIdsResponse,
  ListOption,
  ListPageResponse,
  ListQuery,
  ListSpec,
  ReportMeta,
  ReportRow,
  ResolvedListQuery,
} from "@/lib/reports/types";
import { DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

import { getAdminList } from "./registry";

/**
 * The admin portal's working lists, on the same engine as the workspace's:
 * a source's rows are narrowed, sorted, totalled and paged in memory for one
 * operator, whose role decides the actions offered. Every action's endpoint
 * checks the role again.
 */

export type AdminListSource = {
  key: string;
  title: string;
  list: ListSpec;
  /**
   * Every row for the filters asked. A list inside one workspace reads its
   * `w` parent filter, the workspace's slug, and loads that workspace only.
   */
  load: (filters: Record<string, string>) => Promise<ReportRow[]>;
  /** Choices for `choice` filters that come from the database, by key. */
  options?: () => Promise<Record<string, ListOption[]>>;
};

export type AdminListRefusal = { status: 403 | 404; error: string };

export function adminListContext(operator: SignedInOperator, now = new Date()): ListContext {
  return {
    role: operator.role,
    userId: operator.id,
    now,
    timeZone: DEFAULT_TIME_ZONE,
    can: (grant) => grant[0] === "admin" && operatorCan(operator.role, grant[1]),
    seeCost: true,
  };
}

type Opened = {
  source: AdminListSource;
  spec: ListSpec;
  shape: ListSpec;
  ctx: ListContext;
  loaded: Record<string, ListOption[]>;
  resolved: ResolvedListQuery;
};

async function open(operator: SignedInOperator, key: string, query: ListQuery): Promise<Opened | AdminListRefusal> {
  const source = getAdminList(key);
  if (!source) return { status: 404, error: "That list does not exist." };
  const ctx = adminListContext(operator);
  if (!canReadList(source.list, ctx)) return { status: 403, error: source.list.refusal ?? `Your role cannot view ${source.list.noun}.` };
  const loaded = source.options ? await source.options() : {};
  const resolved = resolveListQuery(source.list, query, loaded, ctx);
  return { source, spec: source.list, shape: listShape(source.list, resolved), ctx, loaded, resolved };
}

function refused<T extends object>(value: T | AdminListRefusal): value is AdminListRefusal {
  return "error" in value;
}

async function run(opened: Opened, rowIds?: ReadonlySet<string>): Promise<ListRun> {
  const rows = await opened.source.load(opened.resolved.filters);
  return runSource(opened.spec, rows, opened.resolved, opened.ctx, { loaded: opened.loaded, rowIds });
}

function meta(opened: Opened): ReportMeta {
  return {
    key: opened.source.key,
    title: opened.source.title,
    area: "Admin",
    columns: listColumnsFor(opened.shape, true),
    params: [],
    defaults: {},
  };
}

export async function adminListPage(
  operator: SignedInOperator,
  key: string,
  query: ListQuery,
): Promise<ListPageResponse | AdminListRefusal> {
  const opened = await open(operator, key, query);
  if (refused(opened)) return opened;
  const { result } = await run(opened);
  const list = publicListSpec(opened.shape, opened.ctx, opened.loaded);
  return {
    ...result,
    parent: null,
    report: { ...meta(opened), columns: list.columns, list },
    query: { ...opened.resolved, page: result.page },
    size: opened.resolved.size,
  };
}

export async function adminListIds(
  operator: SignedInOperator,
  key: string,
  query: ListQuery,
  pick: string[],
): Promise<ListIdsResponse | AdminListRefusal> {
  const opened = await open(operator, key, query);
  if (refused(opened)) return opened;
  return listIds(await run(opened), pick, listColumnsFor(opened.spec, true));
}

/** Every filtered row (or only the ticked ones) in drawing order, for a file. */
export async function adminListExport(operator: SignedInOperator, key: string, query: ListQuery, rowIds?: string[]) {
  const opened = await open(operator, key, query);
  if (refused(opened)) return opened;
  const ran = await run(opened, rowIds ? new Set(rowIds) : undefined);
  return { ...ran, meta: meta(opened), resolved: opened.resolved, ctx: opened.ctx, spec: opened.shape };
}
