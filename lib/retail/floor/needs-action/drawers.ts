import { formatMoney, formatShortDay, formatSigned } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow, OverviewShift } from "./types";
import { countTitle, namesByCount } from "./words";

/** Not yet accepted or recovered: no outcome, or "look into it". */
function waitsForSignOff(shift: OverviewShift): boolean {
  return shift.status === "CLOSED" && (shift.signOffOutcome === null || shift.signOffOutcome === "LOOK_INTO");
}

/** The sign-off sheet over the shift; the sheet host reads its record from `id` (decision FLR-05). */
export function signOffHref(shiftId: string): string {
  return `/retail/shifts/${shiftId}?sheet=sign-off&id=${shiftId}`;
}

function oldestFirst(a: OverviewShift, b: OverviewShift) {
  return (a.closedAt?.getTime() ?? 0) - (b.closedAt?.getTime() ?? 0);
}

/**
 * Drawers closed this week with a difference nobody has signed off, short or
 * over, as one row: "Three drawers short this week" · "Chipo Dube twice,
 * Farai Moyo once" · Σ difference, to the oldest one's sign-off.
 */
export function drawerRow(shifts: ReadonlyArray<OverviewShift>, weekStart: Date, side: "short" | "over"): NeedsActionRow | null {
  const found = shifts
    .filter((shift) => waitsForSignOff(shift) && shift.closedAt !== null && shift.closedAt >= weekStart && shift.countedCash !== null && shift.variance !== null)
    .filter((shift) => (side === "short" ? shift.variance!.isNegative() && !shift.variance!.isZero() : shift.variance!.isPositive() && !shift.variance!.isZero()))
    .sort(oldestFirst);
  if (found.length === 0) return null;
  const total = found.reduce((sum, shift) => sum + Number(shift.variance), 0);
  return {
    key: side,
    tone: side === "short" ? "bad" : "warn",
    title: `${countTitle(found.length, "drawer", "drawers")} ${side} this week`,
    meta: namesByCount(found.map((shift) => shift.cashierName)),
    figure: side === "short" ? formatMoney(total) : formatSigned(total),
    figureTone: side === "short" ? "bad" : "ink",
    href: signOffHref(found[0]!.id),
  };
}

/**
 * Drawers closed without a count that nobody has signed off, at any time:
 * "One drawer closed without a count" · "SH-00229 · Tafara Nyathi · 8 Aug"
 * (the oldest), the count, to its sign-off.
 */
export function uncountedRow(shifts: ReadonlyArray<OverviewShift>): NeedsActionRow | null {
  const found = shifts.filter((shift) => waitsForSignOff(shift) && (shift.countedCash === null || shift.variance === null)).sort(oldestFirst);
  const oldest = found[0];
  if (!oldest) return null;
  return {
    key: "uncounted",
    tone: "warn",
    title: `${countTitle(found.length, "drawer", "drawers")} closed without a count`,
    meta: `${oldest.shiftNo} · ${oldest.cashierName} · ${formatShortDay(oldest.closedAt ?? oldest.openedAt)}`,
    figure: String(found.length),
    figureTone: "ink",
    href: signOffHref(oldest.id),
  };
}

const APPROVE: NeedsActionProvider["can"] = ["retail.cash-control", "approve"];

export const shortDrawers: NeedsActionProvider = {
  key: "short",
  can: APPROVE,
  load: async (ctx) => [drawerRow(await ctx.shifts(), ctx.weekStart, "short")].filter((row) => row !== null),
};

export const overDrawers: NeedsActionProvider = {
  key: "over",
  can: APPROVE,
  load: async (ctx) => [drawerRow(await ctx.shifts(), ctx.weekStart, "over")].filter((row) => row !== null),
};

export const uncountedDrawers: NeedsActionProvider = {
  key: "uncounted",
  can: APPROVE,
  load: async (ctx) => [uncountedRow(await ctx.shifts())].filter((row) => row !== null),
};
