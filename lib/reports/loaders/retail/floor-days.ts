import { prisma } from "@/lib/prisma";
import { num, result } from "@/lib/reports/loaders/shared";
import type { ReportContext, ReportLoader, ReportOption, ReportRow } from "@/lib/reports/types";
import { dayFigures, daySaleSelect, dayShiftSelect, shortDayLabel, type DaySale, type DayShift } from "@/lib/retail/floor/day-close";
import { takingsWhere } from "@/lib/retail/floor/takings";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { tradingDayKey } from "@/lib/retail/z-report";

/**
 * Past days (FLR-07): one row per site per trading day that had shifts or
 * back-office documents, closed or not, and every closed day, at the sites the
 * viewer works at (End of day's own scope). A closed row reads its
 * `RetailDayClose`; the days not closed yet are added up live with End of
 * day's own `dayFigures`, from one read of their shifts and sales. A few
 * hundred rows a year, so the list is in memory.
 */

const LONG = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** What "Date" searches: "Fri 2 Oct 2026 · 2 October 2026 · 2026-10-02". */
export function dayWords(date: string): string {
  return `${shortDayLabel(date)} · ${LONG.format(new Date(`${date}T12:00:00.000Z`))} · ${date}`;
}

/** The ids a query takes at once: well under Postgres's limit on bound values. */
const CHUNK = 5000;

/** The sites the viewer works at: every site, or the ones they are given. */
async function scopedSites(ctx: ReportContext): Promise<string[] | null> {
  const scope = await siteScopeOf(ctx.companyId, ctx.userId);
  return scope.all ? null : scope.ids;
}

export async function loadDays(ctx: ReportContext) {
  const companyId = ctx.companyId;
  const siteIds = await scopedSites(ctx);
  const atSites = siteIds ? { siteId: { in: siteIds } } : {};
  const [shifts, backOffice, closes, sites] = await Promise.all([
    prisma.retailShift.findMany({ where: { companyId, ...atSites }, select: { ...dayShiftSelect, siteId: true }, orderBy: [{ openedAt: "asc" }, { id: "asc" }] }),
    prisma.retailSale.findMany({ where: { ...takingsWhere({ companyId }), ...atSites, shiftId: null }, select: { ...daySaleSelect, siteId: true, postedAt: true } }),
    prisma.retailDayClose.findMany({ where: { companyId, ...atSites } }),
    prisma.site.findMany({ where: { companyId, ...(siteIds ? { id: { in: siteIds } } : {}) }, select: { id: true, name: true } }),
  ]);
  const siteName = new Map(sites.map((site) => [site.id, site.name]));
  const closed = new Map(closes.map((close) => [`${close.siteId}|${tradingDayKey(close.businessDate)}`, close]));

  // The days not closed yet: their shifts, their back-office documents, then their shifts' sales in a few reads.
  const open = new Map<string, { shifts: DayShift[]; sales: DaySale[] }>();
  const dayOf = (key: string) => {
    let day = open.get(key);
    if (!day) open.set(key, (day = { shifts: [], sales: [] }));
    return day;
  };
  const shiftKey = new Map<string, string>();
  for (const shift of shifts) {
    const key = `${shift.siteId}|${tradingDayKey(shift.openedAt)}`;
    if (closed.has(key)) continue;
    dayOf(key).shifts.push(shift);
    shiftKey.set(shift.id, key);
  }
  for (const sale of backOffice) {
    if (!sale.postedAt) continue;
    const key = `${sale.siteId}|${tradingDayKey(sale.postedAt)}`;
    if (!closed.has(key)) dayOf(key).sales.push(sale);
  }
  const ids = [...shiftKey.keys()];
  for (let from = 0; from < ids.length; from += CHUNK) {
    const onShifts = await prisma.retailSale.findMany({ where: takingsWhere({ companyId, shiftIds: ids.slice(from, from + CHUNK) }), select: daySaleSelect });
    for (const sale of onShifts) open.get(shiftKey.get(sale.shiftId!)!)!.sales.push(sale);
  }

  const rows: ReportRow[] = [];
  const base = (siteId: string, date: string) => ({ id: `${siteId}_${date}`, siteId, site: siteName.get(siteId) ?? "", date, day: shortDayLabel(date), dayWords: dayWords(date) });
  for (const [key, close] of closed) {
    const [siteId, date] = key.split("|") as [string, string];
    const difference = num(close.cashDifference) ?? 0;
    rows.push({
      ...base(siteId, date),
      fiscalDayNo: close.fiscalDayNo === null ? null : String(close.fiscalDayNo).padStart(3, "0"),
      takings: num(close.takings) ?? 0,
      refunds: num(close.refunds) ?? 0,
      cashDifference: difference,
      differenceTone: difference < 0 ? "warn" : null,
      banked: num(close.banked) ?? 0,
      state: difference < 0 ? "Signed off short" : "Closed",
    });
  }
  for (const [key, day] of open) {
    const [siteId, date] = key.split("|") as [string, string];
    const figures = dayFigures(day.shifts, day.sales);
    const difference = Number(figures.cashDifference);
    rows.push({
      ...base(siteId, date),
      fiscalDayNo: null,
      takings: Number(figures.takings),
      refunds: Number(figures.refunds),
      cashDifference: difference,
      differenceTone: difference < 0 ? "warn" : null,
      banked: null,
      state: "Not closed",
    });
  }
  return result(rows);
}

async function dayOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const siteIds = await scopedSites(ctx);
  const sites = await prisma.site.findMany({
    where: { companyId: ctx.companyId, isActive: true, ...(siteIds ? { id: { in: siteIds } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return { site: sites.map((site) => ({ value: site.id, label: site.name })) };
}

export const FLOOR_DAY_LOADERS: Record<string, ReportLoader> = {
  "retail-days": { load: loadDays, options: dayOptions },
};
