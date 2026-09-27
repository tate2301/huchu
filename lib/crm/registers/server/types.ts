import type { CrmCapability } from "@/lib/crm/permissions";

import type { FilterOption, RegisterDef, ViewState } from "../types";

/**
 * Who is asking, and when. Everything a list's filters need to mean the same
 * thing on the screen and in an export made from it: `me` is this person,
 * "today" is today where they are, and what they may see is what they may
 * export.
 */
export type RegisterContext = {
  companyId: string;
  userId: string;
  role: string;
  now: Date;
  tz: string;
  can(capability: CrmCapability): boolean;
};

/** A value in an export: already in the reader's zone and units. */
export type ExportCell = string | number | boolean | null;

export type RowWindow = { skip: number; take: number };

/**
 * The server half of a list: the records a state selects, and each record as
 * the cells of an export.
 *
 * `page` feeds the screen, `count` and `scan` the export — one `where` behind
 * all three, so what was on screen is what lands in the file. `ids` narrows
 * to rows somebody ticked, inside the same access scope, so a ticked id the
 * reader may not see is simply not there.
 */
export type RegisterServer<Row extends { id: string }> = {
  def: RegisterDef;
  page(
    ctx: RegisterContext,
    state: ViewState,
    window: RowWindow,
    ids?: readonly string[],
  ): Promise<{ rows: Row[]; total: number }>;
  count(ctx: RegisterContext, state: ViewState, ids?: readonly string[]): Promise<number>;
  scan(
    ctx: RegisterContext,
    state: ViewState,
    options?: { ids?: readonly string[]; batch?: number },
  ): AsyncGenerator<Row[]>;
  cells(row: Row, ctx: RegisterContext): Record<string, ExportCell>;
  /** The answers a `facet` filter offers, read from the records the rest of the state selects. */
  facet?(ctx: RegisterContext, state: ViewState, key: string): Promise<FilterOption[]>;
};
