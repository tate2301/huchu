/**
 * A list backed by one Prisma model: the where, the order and the row shape
 * are the list's own; paging, counting, narrowing to ticked ids and scanning
 * for an export are the same for every list, so they are written once here.
 */
import { withDefaults } from "../codec";
import { dayIn, minuteIn } from "../dates";
import type { FilterOption, RegisterDef, ViewState } from "../types";
import type { ExportCell, RegisterContext, RegisterServer, RowWindow } from "./types";

type Where = Record<string, unknown>;
type OrderBy = Record<string, unknown>;

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
};

const SCAN_BATCH = 500;

function narrowed(where: Where, ids?: readonly string[]): Where {
  return ids ? { AND: [where, { id: { in: [...ids] } }] } : where;
}

export function prismaRegister<Row extends { id: string }>(
  spec: PrismaRegisterSpec<Row>,
): RegisterServer<Row> {
  const order = (state: ViewState) => {
    const sort = withDefaults(spec.def, state).sort ?? { key: spec.def.sorts[0].key, dir: "asc" as const };
    return [...spec.orderBy(sort.key, sort.dir), { id: "asc" }];
  };

  return {
    def: spec.def,

    async page(ctx: RegisterContext, state: ViewState, window: RowWindow, ids?: readonly string[]) {
      const where = narrowed(await spec.where(ctx, state), ids);
      const [rows, total] = await Promise.all([
        spec.findMany({ where, orderBy: order(state), skip: window.skip, take: window.take }),
        spec.count({ where }),
      ]);
      return { rows, total };
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
