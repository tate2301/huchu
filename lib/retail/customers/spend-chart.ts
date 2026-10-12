import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { addMonths } from "@/lib/retail/vouchers/dates";
import { addDays, DEFAULT_TIME_ZONE, formatShortDay, formatShortMonth, todayIn } from "@/lib/workspace/format";

/**
 * Spend per month on a customer's record (CUS-03, packet 61): what they spent
 * in each period, by the floor's takings (sales, refunds and voids, so a
 * voided sale comes to nothing), in the shop's zone.
 *
 * - `3m`: 13 weeks, Monday to Sunday, ending this week ("6 Jul").
 * - `12m`: 12 months ending this month.
 * - `all`: every month since their first visit; years past 36 months.
 *
 * The current period's bar is the last.
 */

export const SPEND_RANGES = ["3m", "12m", "all"] as const;
export type SpendRange = (typeof SPEND_RANGES)[number];

export type SpendBar = { key: string; label: string; tip: string; value: number };
export type SpendChart = { unit: "US$"; bars: SpendBar[]; yTop: number; yMid: number };

const ZONE = DEFAULT_TIME_ZONE;

/** A round top for the axis: 1, 2 or 5 times a power of ten, at least the largest bar. */
export function niceTop(max: number): number {
  if (max <= 0) return 100;
  const power = 10 ** Math.floor(Math.log10(max));
  for (const step of [1, 2, 2.5, 4, 5, 10]) if (step * power >= max) return step * power;
  return 10 * power;
}

const monthKey = (day: string) => day.slice(0, 7);
/** "Aug 2026". */
const monthTip = (key: string) => `${formatShortMonth(key)} ${key.slice(0, 4)}`;

/** Monday of the week a day falls in. */
function mondayOf(day: string): string {
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return addDays(day, -((weekday + 6) % 7));
}

type Bucketed = { bucket: string; value: number };

async function spendBy(companyId: string, customerId: string, unit: "week" | "month" | "year", from: Date | null): Promise<Map<string, number>> {
  const rows = await prisma.$queryRaw<Bucketed[]>`
    SELECT to_char(date_trunc(${unit}, s."postedAt" AT TIME ZONE ${ZONE}), 'YYYY-MM-DD') AS bucket,
           coalesce(sum(s."baseAmount"), 0)::float8 AS value
    FROM "RetailSale" s
    WHERE s."companyId" = ${companyId} AND s."customerId" = ${customerId} AND s."saleType" IN ('SALE', 'REFUND', 'VOID')
      AND s."postedAt" IS NOT NULL ${from ? Prisma.sql`AND s."postedAt" >= ${from}` : Prisma.empty}
    GROUP BY 1`;
  return new Map(rows.map((row) => [row.bucket, Math.round(Number(row.value) * 100) / 100]));
}

const harareMidnight = (day: string) => new Date(`${day}T00:00:00+02:00`);

function axis(bars: SpendBar[]): SpendChart {
  const yTop = niceTop(Math.max(0, ...bars.map((bar) => bar.value)));
  return { unit: "US$", bars, yTop, yMid: yTop / 2 };
}

export async function customerSpendChart(
  companyId: string,
  customerId: string,
  range: SpendRange,
  now: Date = new Date(),
): Promise<SpendChart> {
  const today = todayIn(ZONE, now);
  if (range === "3m") {
    const last = mondayOf(today);
    const first = addDays(last, -12 * 7);
    const spend = await spendBy(companyId, customerId, "week", harareMidnight(first));
    const bars = Array.from({ length: 13 }, (_, index) => {
      const monday = addDays(first, index * 7);
      const value = spend.get(monday) ?? 0;
      return { key: monday, label: formatShortDay(monday), tip: `Week of ${formatShortDay(monday)}`, value };
    });
    return axis(bars);
  }
  const thisMonth = `${monthKey(today)}-01`;
  if (range === "12m") {
    const first = addMonths(thisMonth, -11);
    const spend = await spendBy(companyId, customerId, "month", harareMidnight(first));
    const bars = Array.from({ length: 12 }, (_, index) => {
      const month = addMonths(first, index);
      return { key: monthKey(month), label: formatShortMonth(month), tip: monthTip(month), value: spend.get(month) ?? 0 };
    });
    return axis(bars);
  }
  const firstVisit = await prisma.retailSale.findFirst({
    where: { companyId, customerId, saleType: "SALE", postedAt: { not: null } },
    orderBy: { postedAt: "asc" },
    select: { postedAt: true },
  });
  const start = firstVisit?.postedAt ? `${monthKey(todayIn(ZONE, firstVisit.postedAt))}-01` : thisMonth;
  const months: string[] = [];
  for (let month = start; month <= thisMonth; month = addMonths(month, 1)) months.push(month);
  if (months.length > 36) {
    const spend = await spendBy(companyId, customerId, "year", null);
    const years: SpendBar[] = [];
    for (let year = Number(start.slice(0, 4)); year <= Number(today.slice(0, 4)); year += 1) {
      const key = `${year}-01-01`;
      years.push({ key: String(year), label: String(year), tip: String(year), value: spend.get(key) ?? 0 });
    }
    return axis(years);
  }
  const spend = await spendBy(companyId, customerId, "month", null);
  return axis(
    months.map((month) => ({ key: monthKey(month), label: formatShortMonth(month), tip: monthTip(month), value: spend.get(month) ?? 0 })),
  );
}
