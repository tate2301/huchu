import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { dayFigures, loadDayRows, shortDayLabel } from "@/lib/retail/floor/day-close";
import { tradingDayKey } from "@/lib/retail/z-report";

/**
 * Past days (FLR-07): one row per site per trading day that had shifts,
 * closed or not, and every closed day. A closed row reads its
 * `RetailDayClose`; one not closed yet is added up live with End of day's own
 * `dayFigures`. A few hundred rows a year, so the list is in memory.
 */

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What "Date" searches: "Fri 2 Oct 2026 · 2 October 2026 · 2026-10-02". */
export function dayWords(date: string): string {
  return `${shortDayLabel(date)} · ${LONG.format(new Date(`${date}T12:00:00.000Z`))} · ${date}`;
}

export async function loadDays(ctx: ReportContext) {
  const companyId = ctx.companyId;
  const [shifts, closes, sites] = await Promise.all([
    prisma.retailShift.findMany({ where: { companyId }, select: { siteId: true, openedAt: true } }),
    prisma.retailDayClose.findMany({ where: { companyId } }),
    prisma.site.findMany({ where: { companyId }, select: { id: true, name: true } }),
  ]);
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const closed = new Map(closes.map((close) => [`${close.siteId}|${tradingDayKey(close.businessDate)}`, close]));
  const keys = new Set([...shifts.map((shift) => `${shift.siteId}|${tradingDayKey(shift.openedAt)}`), ...closed.keys()]);

  const rows: ReportRow[] = [];
  for (const key of keys) {
    const [siteId, date] = key.split("|") as [string, string];
    const base = { id: `${siteId}_${date}`, siteId, site: siteName.get(siteId) ?? "", date, day: shortDayLabel(date), dayWords: dayWords(date) };
    const close = closed.get(key);
    if (close) {
      const difference = num(close.cashDifference) ?? 0;
      rows.push({
        ...base,
        fiscalDayNo: close.fiscalDayNo === null ? null : String(close.fiscalDayNo).padStart(3, "0"),
        takings: num(close.takings) ?? 0,
        refunds: num(close.refunds) ?? 0,
        cashDifference: difference,
        banked: num(close.banked) ?? 0,
        state: difference < 0 ? "Signed off short" : "Closed",
      });
      continue;
    }
    const { shifts: own, sales } = await loadDayRows(companyId, siteId, date);
    const figures = dayFigures(own, sales);
    rows.push({
      ...base,
      fiscalDayNo: null,
      takings: Number(figures.takings),
      refunds: Number(figures.refunds),
      cashDifference: Number(figures.cashDifference),
      banked: null,
      state: "Not closed",
    });
  }
  return result(rows);
}

async function dayOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { site: sites.map((site) => ({ value: site.id, label: site.name })) };
}

export const FLOOR_DAY_LOADERS: Record<string, ReportLoader> = {
  "retail-days": { load: loadDays, options: dayOptions },
};
