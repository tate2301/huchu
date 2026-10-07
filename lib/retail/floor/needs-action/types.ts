import type { Prisma } from "@prisma/client";

import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";
import type { OnHandLine } from "@/lib/retail/stock/on-hand";

/**
 * Needs action (50-floor §4.1, FLR-08): one row a thing somebody has to do,
 * each from its own provider. A row exists only when there is something in
 * it, and only for a caller who may act on it.
 */

export type NeedsActionKey =
  | "stale-shift"
  | "short"
  | "over"
  | "uncounted"
  | "low-stock"
  | "not-fiscalised"
  | "flagged-sales"
  | "order-due"
  | "promotion-ending"
  | "laybys-overdue";

export type NeedsActionRow = {
  key: NeedsActionKey;
  /** The dot: bad for money missing, warn for a job not done, info for what is coming. */
  tone: "warn" | "bad" | "info";
  title: string;
  meta: string;
  figure: string;
  figureTone: "ink" | "bad" | "warn";
  href: string;
};

/** A shift as the Overview reads it: open now, this week's, or closed and still waiting for a count's sign-off. */
export type OverviewShift = {
  id: string;
  shiftNo: string;
  registerId: string;
  registerName: string;
  cashierId: string;
  cashierName: string;
  openingFloat: Prisma.Decimal;
  status: "OPEN" | "CLOSED";
  openedAt: Date;
  closedAt: Date | null;
  countedCash: Prisma.Decimal | null;
  variance: Prisma.Decimal | null;
  signOffOutcome: "ACCEPT" | "RECOVER" | "LOOK_INTO" | null;
};

/** Takings and sales rung on one shift (decision 10). */
export type ShiftFigures = { takings: Prisma.Decimal; sales: number };

/**
 * What every provider is handed: the scope, the clock, and the reads more
 * than one tile shares, each run once however many providers ask.
 */
export type NeedsContext = {
  companyId: string;
  /** The sites in view; null is every site of the company. */
  siteIds: string[] | null;
  now: Date;
  /** Monday 00:00 in the shop's time. */
  weekStart: Date;
  /** Tomorrow, as `YYYY-MM-DD` in the shop's time. */
  tomorrow: string;
  shifts: () => Promise<OverviewShift[]>;
  shiftFigures: () => Promise<Map<string, ShiftFigures>>;
  /** Low and Out lines at the sites in view. */
  lowStock: () => Promise<OnHandLine[]>;
};

export type NeedsActionProvider = {
  key: NeedsActionKey;
  /** Who may act on the row; anybody else is not shown it. */
  can: [RetailResource, RetailAction];
  load: (ctx: NeedsContext) => Promise<NeedsActionRow[]>;
};
