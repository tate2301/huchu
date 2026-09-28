/**
 * A list backed by one Prisma model: the where, the order and the row shape
 * are the list's own; paging, counting, narrowing to ticked ids and scanning
 * for an export are the same for every list, so they are written once here.
 */
import { withDefaults } from "../codec";
import { dayIn, minuteIn } from "../dates";
import type { FilterOption, RegisterDef, ViewState } from "../types";
import type { ExportCell, RegisterContext, RegisterGroup, RegisterServer, RowWindow } from "./types";

type Where = Record<string, unknown>;
type OrderBy = Record<string, unknown>;

/** The id a row with no value falls under — "Unassigned", "No company". */
export const NO_GROUP = "none";

/** How a list is grouped by one of its `groupBys`. */
export type GroupBySpec<Row> = {
  /** Brings one group's rows together, ahead of the list's own order. */
  orderBy: OrderBy[];
  /** The group a row falls in. A row with no value is `NO_GROUP`. */
  of(row: Row): { id: string; label: string };
  /** How many rows each group holds across the whole list, by group id. */
  counts(where: Where): Promise<Map<string, number>>;
};

export type PrismaRegisterSpec<Row extends { id: string }> = {
  def: RegisterDef;
  /** The records a state selects, inside the reader's scope. */
  where(ctx: RegisterContext, state: ViewState): Promise<Where>;
  /** The order for a sort key. The engine adds `id` last so pages never overlap. */
  orderBy(key: string, dir: "asc" | "desc"): OrderBy[];
  findMany(args: { where: Where; orderBy: OrderBy[]; skip: number; take: number }): Promise<Row[]>;
  count(args: { where: Where }): Promise<number>;
  cells(row: Row, ctx: RegisterContext): Record<string, ExportCell>;
  facets?: Record<string, (where: Where) => Promise<FilterOption[]>>;
  /** One per key of the definition's `groupBys`. */
  groupBys?: Record<string, GroupBySpec<Row>>;
};

const SCAN_BATCH = 500;

function narrowed(where: Where, ids?: readonly string[]): Where {
  return ids ? { AND: [where, { id: { in: [...ids] } }] } : where;
}

/** A page's rows, in the groups they fall in, in the order they came. */
function groupsOf<Row extends { id: string }>(
  rows: Row[],
  group: GroupBySpec<Row>,
  counts: Map<string, number>,
): RegisterGroup[] {
  const byId = new Map<string, RegisterGroup>();
  for (const row of rows) {
    const { id, label } = group.of(row);
    const existing = byId.get(id);
    if (existing) existing.ids.push(row.id);
    else byId.set(id, { id, label, count: counts.get(id) ?? 0, ids: [row.id] });
  }
  return [...byId.values()];
}

/** A group's id for a column's value: an empty one is `NO_GROUP`. */
export function groupId(value: unknown): string {
  return value === null || value === undefined || value === "" ? NO_GROUP : String(value);
}

/** Rows per group, from a Prisma `groupBy` on one column. */
export function countsBy<K extends string>(
  groups: Array<Record<K, unknown> & { _count: { _all: number } }>,
  key: K,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const group of groups) {
    const id = groupId(group[key]);
    counts.set(id, (counts.get(id) ?? 0) + group._count._all);
  }
  return counts;
}

/**
 * A to-one relation's column, A–Z. A row without the relation — nobody
 * assigned, no company — has nothing to join, and Postgres puts that null
 * last on an ascending sort: "Unassigned" after everybody.
 */
export function byRelation(relation: string, field: string): OrderBy {
  return { [relation]: { [field]: "asc" } };
}

export function prismaRegister<Row extends { id: string }>(
  spec: PrismaRegisterSpec<Row>,
): RegisterServer<Row> {
  const grouping = (state: ViewState) => (state.by ? spec.groupBys?.[state.by] : undefined);

  // Sort before you group (SHAPE-12): the group's own order first, so each
  // group's rows arrive together, then the list's order inside each group.
  const order = (state: ViewState) => {
    const sort = withDefaults(spec.def, state).sort ?? { key: spec.def.sorts[0].key, dir: "asc" as const };
    return [...(grouping(state)?.orderBy ?? []), ...spec.orderBy(sort.key, sort.dir), { id: "asc" }];
  };

  return {
    def: spec.def,

    async page(ctx: RegisterContext, state: ViewState, window: RowWindow, ids?: readonly string[]) {
      const where = narrowed(await spec.where(ctx, state), ids);
      const group = grouping(state);
      const [rows, total, counts] = await Promise.all([
        spec.findMany({ where, orderBy: order(state), skip: window.skip, take: window.take }),
        spec.count({ where }),
        group ? group.counts(where) : Promise.resolve(null),
      ]);
      return group && counts ? { rows, total, groups: groupsOf(rows, group, counts) } : { rows, total };
    },

    async count(ctx: RegisterContext, state: ViewState, ids?: readonly string[]) {
      return spec.count({ where: narrowed(await spec.where(ctx, state), ids) });
    },

    async *scan(ctx: RegisterContext, state: ViewState, options: { ids?: readonly string[]; batch?: number } = {}) {
      const where = narrowed(await spec.where(ctx, state), options.ids);
      const orderBy = order(state);
      const take = options.batch ?? SCAN_BATCH;
      for (let skip = 0; ; skip += take) {
        const rows = await spec.findMany({ where, orderBy, skip, take });
        if (rows.length > 0) yield rows;
        if (rows.length < take) return;
      }
    },

    cells: spec.cells,

    async facet(ctx: RegisterContext, state: ViewState, key: string) {
      const read = spec.facets?.[key];
      if (!read) return [];
      // The answers the *other* filters leave, the way a spreadsheet's column
      // filter lists what is in the column after the other columns have had
      // their say. Its own filter is left out, or ticking one city would make
      // every other city disappear from the list of cities.
      const rest = Object.fromEntries(Object.entries(state.filters).filter(([name]) => name !== key));
      return read(await spec.where(ctx, { ...state, filters: rest }));
    },
  };
}

/** A day in the reader's zone, for a `date` cell. */
export function dayCell(value: Date | null | undefined, ctx: RegisterContext): ExportCell {
  return value ? dayIn(value, ctx.tz) : null;
}

/** A wall-clock minute in the reader's zone, for a `datetime` cell. */
export function minuteCell(value: Date | null | undefined, ctx: RegisterContext): ExportCell {
  return value ? minuteIn(value, ctx.tz) : null;
}

/** Distinct non-empty values of one text column, A–Z. */
export function distinctText(values: Array<string | null>): FilterOption[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value }));
}

/** Nulls last, whichever way a column runs — an empty date is not the oldest one. */
export function nullsLast(field: string, dir: "asc" | "desc"): OrderBy {
  return { [field]: { sort: dir, nulls: "last" } };
}

/** Nulls first when ascending: "longest since contact" starts with never contacted. */
export function nullsFirstAscending(field: string, dir: "asc" | "desc"): OrderBy {
  return { [field]: { sort: dir, nulls: dir === "asc" ? "first" : "last" } };
}
