import { prisma } from "@/lib/prisma";
import { num, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { DEFAULT_TIME_ZONE, dayKey, formatDuration, formatShortDay, formatTime } from "@/lib/workspace/format";

/**
 * The floor's list sources, read from the database.
 *
 * Shifts are few — two a day is about 730 a year — so the list is in memory:
 * every shift the company has, each with its sales counted and its takings
 * summed by the database, and the engine narrows, totals and pages them.
 */

/** A drawer open longer than this is left over from another day, not a shift. */
export const STALE_SHIFT_MINUTES = 12 * 60;

/**
 * What a shift came to.
 *
 * Takings are every sale row on the shift in the base currency — a void is a
 * negative row beside the positive one it cancels, so the ledger sums to what
 * the drawer netted (the shift record reads it the same way). Sales are the
 * ones that still stand: posted, and a sale rather than a reversal.
 */
async function shiftFigures(companyId: string) {
  const scope = { companyId, shiftId: { not: null } };
  const [takings, settled] = await Promise.all([
    prisma.retailSale.groupBy({ by: ["shiftId"], where: scope, _sum: { baseAmount: true } }),
    prisma.retailSale.groupBy({
      by: ["shiftId"],
      where: { ...scope, saleType: "SALE", status: "POSTED" },
      _count: { _all: true },
    }),
  ]);
  return {
    takings: new Map(takings.map((entry) => [entry.shiftId!, num(entry._sum.baseAmount) ?? 0])),
    sales: new Map(settled.map((entry) => [entry.shiftId!, entry._count._all])),
  };
}

/** The judgement a closed shift's count makes. */
export function shiftState(shift: {
  status: string;
  countedCash: unknown;
  variance: number | null;
}): "Open" | "Not counted" | "Short" | "Over" | "Balanced" {
  if (shift.status === "OPEN") return "Open";
  if (shift.countedCash === null || shift.countedCash === undefined || shift.variance === null) return "Not counted";
  if (shift.variance < 0) return "Short";
  if (shift.variance > 0) return "Over";
  return "Balanced";
}

async function loadShifts(ctx: ReportContext) {
  const now = new Date();
  const timeZone = DEFAULT_TIME_ZONE;
  const [found, figures] = await Promise.all([
    prisma.retailShift.findMany({
      where: { companyId: ctx.companyId },
      select: {
        id: true,
        shiftNo: true,
        registerCode: true,
        registerName: true,
        cashierId: true,
        cashierName: true,
        status: true,
        openedAt: true,
        closedAt: true,
        countedCash: true,
        variance: true,
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      take: TAKE,
    }),
    shiftFigures(ctx.companyId),
  ]);

  return result(
    found.map((shift): ReportRow => {
      const running = shift.status === "OPEN";
      const variance = running ? null : num(shift.variance);
      const end = running ? now : (shift.closedAt ?? now);
      const durationMinutes = Math.max(0, Math.floor((end.getTime() - shift.openedAt.getTime()) / 60_000));
      const state = shiftState({ status: shift.status, countedCash: shift.countedCash, variance });
      return {
        id: shift.id,
        shiftNo: shift.shiftNo,
        cashier: shift.cashierName,
        cashierId: shift.cashierId,
        till: shift.registerName,
        tillCode: shift.registerCode,
        tillShort: shift.registerName.split(/\s+/)[0] ?? shift.registerName,
        state,
        openedAt: dayKey(shift.openedAt, timeZone),
        openedTime: formatTime(shift.openedAt, timeZone),
        durationMinutes,
        running,
        sales: figures.sales.get(shift.id) ?? 0,
        takings: Math.round((figures.takings.get(shift.id) ?? 0) * 100) / 100,
        variance: state === "Not counted" ? null : variance,
        varianceSize: state === "Not counted" || variance === null ? null : Math.abs(variance),
        // The phone card's last words: how long it has run ("live" while it is
        // still a shift, not a drawer left open from another day), or the day it ran.
        cardWhen: running
          ? `${formatDuration(durationMinutes)}${durationMinutes <= STALE_SHIFT_MINUTES ? " live" : ""}`
          : formatShortDay(shift.openedAt, timeZone),
      };
    }),
  );
}

async function shiftOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [registers, cashiers] = await Promise.all([
    prisma.retailRegister.findMany({
      where: { companyId: ctx.companyId },
      select: { code: true, name: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
    }),
    // Everyone who has opened a shift, by the name the shift carries.
    prisma.retailShift.findMany({
      where: { companyId: ctx.companyId },
      select: { cashierId: true, cashierName: true },
      distinct: ["cashierId"],
      orderBy: [{ cashierId: "asc" }, { openedAt: "desc" }],
    }),
  ]);
  return {
    till: registers.map((register) => ({ value: register.code, label: register.name })),
    cashier: cashiers
      .map((cashier) => ({ value: cashier.cashierId, label: cashier.cashierName }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export const FLOOR_LOADERS: Record<string, ReportLoader> = {
  "retail-shifts": { load: loadShifts, options: shiftOptions },
};
