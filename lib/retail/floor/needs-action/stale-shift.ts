import { formatMoney, formatShortDay } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow, OverviewShift, ShiftFigures } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/** A drawer open longer than this has not been cashed up. */
export const STALE_AFTER_HOURS = 12;

/** Whole hours a shift has been open. */
export function hoursOpen(openedAt: Date, now: Date): number {
  return Math.floor((now.getTime() - openedAt.getTime()) / HOUR_MS);
}

export function isStale(shift: Pick<OverviewShift, "status" | "openedAt">, now: Date): boolean {
  return shift.status === "OPEN" && now.getTime() - shift.openedAt.getTime() > STALE_AFTER_HOURS * HOUR_MS;
}

/**
 * One row per drawer open more than 12 hours: "Back till open for 52 hours"
 * · "SH-00240 · Farai Moyo · not cashed up since 17 Aug", its takings, to
 * its close page. The longest open first.
 */
export function staleShiftRows(shifts: ReadonlyArray<OverviewShift>, figures: Map<string, ShiftFigures>, now: Date): NeedsActionRow[] {
  return shifts
    .filter((shift) => isStale(shift, now))
    .sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime())
    .map((shift) => ({
      key: "stale-shift",
      tone: "warn",
      title: `${shift.registerName} open for ${hoursOpen(shift.openedAt, now)} hours`,
      meta: `${shift.shiftNo} · ${shift.cashierName} · not cashed up since ${formatShortDay(shift.openedAt)}`,
      figure: formatMoney(Number(figures.get(shift.id)?.takings ?? 0)),
      figureTone: "ink",
      href: `/retail/shifts/${shift.id}/close`,
    }));
}

export const staleShift: NeedsActionProvider = {
  key: "stale-shift",
  can: ["retail.cash-control", "close-shift"],
  load: async (ctx) => {
    const [shifts, figures] = await Promise.all([ctx.shifts(), ctx.shiftFigures()]);
    return staleShiftRows(shifts, figures, ctx.now);
  },
};
