import { prisma } from "@/lib/prisma";
import { num, result, TAKE } from "@/lib/reports/loaders/shared";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import type { ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow } from "@/lib/reports/types";
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
async function shiftFigures(companyId: string, face: "list" | "report") {
  const scope = { companyId, shiftId: { not: null } };
  // Refunds, voids and no-sale opens are Reports' face's figures; the list does not read them.
  const forFace = face === "report";
  const [takings, settled, refunds, voided, drawer] = await Promise.all([
    prisma.retailSale.groupBy({ by: ["shiftId"], where: scope, _sum: { baseAmount: true } }),
    prisma.retailSale.groupBy({
      by: ["shiftId"],
      where: { ...scope, saleType: "SALE", status: "POSTED" },
      _count: { _all: true },
    }),
    // Reports' face: refunds rung on the shift, and the sales voided on it (a
    // void leaves its sale VOIDED, so the sale is the one figure to count).
    forFace
      ? prisma.retailSale.groupBy({
          by: ["shiftId"],
          where: { ...scope, saleType: "REFUND", status: "POSTED" },
          _sum: { baseAmount: true },
        })
      : [],
    forFace
      ? prisma.retailSale.groupBy({
          by: ["shiftId"],
          where: { ...scope, saleType: "SALE", status: { not: "POSTED" } },
          _sum: { baseAmount: true },
        })
      : [],
    // The drawer opened with no sale, on the shift that was open at the till.
    forFace
      ? prisma.$queryRaw<Array<{ shiftId: string | null; opens: number }>>`
          SELECT ("payloadJson"::jsonb ->> 'shiftId') AS "shiftId", count(*)::int AS opens
          FROM "PlatformAuditEvent"
          WHERE "companyId" = ${companyId} AND "eventType" = ${RETAIL_AUDIT_EVENTS.drawerOpened}
          GROUP BY 1`
      : [],
  ]);
  const size = (value: Parameters<typeof num>[0]) => Math.round(Math.abs(num(value) ?? 0) * 100) / 100;
  return {
    takings: new Map(takings.map((entry) => [entry.shiftId!, num(entry._sum.baseAmount) ?? 0])),
    sales: new Map(settled.map((entry) => [entry.shiftId!, entry._count._all])),
    refunds: new Map(refunds.map((entry) => [entry.shiftId!, size(entry._sum.baseAmount)])),
    voids: new Map(voided.map((entry) => [entry.shiftId!, size(entry._sum.baseAmount)])),
    noSaleOpens: new Map(drawer.filter((entry) => entry.shiftId).map((entry) => [entry.shiftId!, entry.opens])),
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

async function loadShifts(ctx: ReportContext, _params: ReportParams, face: "list" | "report" = "list") {
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
        openingFloat: true,
        expectedCash: true,
        siteId: true,
        site: { select: { name: true } },
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }],
      take: TAKE,
    }),
    shiftFigures(ctx.companyId, face),
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
        // Reports' face (70-insights-reports 5.14).
        siteId: shift.siteId,
        site: shift.site.name,
        float: num(shift.openingFloat) ?? 0,
        expected: running ? null : num(shift.expectedCash),
        counted: num(shift.countedCash),
        refunds: figures.refunds.get(shift.id) ?? 0,
        voids: figures.voids.get(shift.id) ?? 0,
        noSaleOpens: figures.noSaleOpens.get(shift.id) ?? 0,
        shifts: 1,
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
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return {
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    till: registers.map((register) => ({ value: register.code, label: register.name })),
    cashier: cashiers
      .map((cashier) => ({ value: cashier.cashierId, label: cashier.cashierName }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

export const FLOOR_LOADERS: Record<string, ReportLoader> = {
  "retail-shifts": { load: loadShifts, options: shiftOptions },
};
