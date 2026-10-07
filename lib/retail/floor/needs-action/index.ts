import { canRetailSessionDo, type SessionLike } from "@/lib/retail/permission-matrix";

import { overDrawers, shortDrawers, uncountedDrawers } from "./drawers";
import { flaggedSales } from "./flagged-sales";
import { lowStock } from "./low-stock";
import { notFiscalised } from "./not-fiscalised";
import { promotionEnding } from "./promotion-ending";
import { staleShift } from "./stale-shift";
import type { NeedsActionProvider, NeedsActionRow, NeedsContext } from "./types";

/**
 * Needs action's rows, in the order the Overview lists them (50-floor
 * §4.1). A new kind of row is one file here and one line below.
 *
 * Two of the spec's rows have no source yet, so no provider: `order-due`
 * waits for BUY-02's purchase orders (the order model is being replaced) and
 * `laybys-overdue` for FLR-06's lay-bys. Their keys are in `NeedsActionKey`
 * and their places are marked below.
 */
export const NEEDS_ACTION_PROVIDERS: ReadonlyArray<NeedsActionProvider> = [
  staleShift,
  shortDrawers,
  overDrawers,
  uncountedDrawers,
  lowStock,
  notFiscalised,
  flaggedSales,
  // order-due: BUY-02
  promotionEnding,
  // laybys-overdue: FLR-06
];

/** Every row the caller may act on, in order; a provider the caller may not act on is not asked. */
export async function needsAction(session: SessionLike, ctx: NeedsContext): Promise<NeedsActionRow[]> {
  const allowed = NEEDS_ACTION_PROVIDERS.filter((provider) => canRetailSessionDo(session, ...provider.can));
  const rows = await Promise.all(allowed.map((provider) => provider.load(ctx)));
  return rows.flat();
}

export type { NeedsActionKey, NeedsActionRow, NeedsContext, OverviewShift, ShiftFigures } from "./types";
