import type { StockMovementReason } from "@prisma/client";

import { coverDays } from "@/lib/retail/products/figures";
import { addDays, daysBetween, DEFAULT_TIME_ZONE, dayKey } from "@/lib/workspace/format";

/**
 * When it runs out (20-products 3.2, PRD-04): a product's on hand day by day
 * over the last 30 days, the days ahead at the rate it sells, the reorder
 * level, what came in, and what to order by when.
 *
 * On hand is every line's own `balanceAfter` (the last of each day), summed
 * over the product's lines and carried over days nothing moved; it is never
 * rebuilt by adding quantities up. A move between two of the shop's sites is
 * neither sold nor received: the product's on hand does not change.
 *
 * Browser safe; `stock-chart-load.ts` reads it for one product.
 */

export type StockChartDay = { date: string; onHand: number; sold: number; received: number };

export type StockChart = {
  days: StockChartDay[];
  /** From today to the day it runs out, two weeks at most, at `perDay`. */
  projection: Array<{ date: string; onHand: number }>;
  onHand: number;
  reorderAt: number | null;
  perDay: number;
  /** Null while it is not selling. */
  runsOutOn: string | null;
  /** Days from today to `runsOutOn`. */
  runsOutIn: number | null;
  received: Array<{ date: string; quantity: number }>;
  advice: { sentence: string; orderQuantity: number } | null;
};

export type ChartMovement = {
  lineId: string;
  at: Date;
  reason: StockMovementReason | null;
  change: number;
  balanceAfter: number | null;
};

const SOLD: ReadonlySet<string> = new Set(["SALE", "REFUND", "VOID"]);
const RECEIVED: ReadonlySet<string> = new Set(["RECEIVED", "OPENING"]);

/** Every day from `from` to `to`: on hand at its close over every line, units sold, units received. */
export function dayBalances(input: {
  openings: Map<string, number>;
  /** In the order they happened. */
  movements: ChartMovement[];
  from: string;
  to: string;
  timeZone?: string;
}): StockChartDay[] {
  const zone = input.timeZone ?? DEFAULT_TIME_ZONE;
  const balances = new Map(input.openings);
  const byDay = new Map<string, ChartMovement[]>();
  for (const movement of input.movements) {
    const day = dayKey(movement.at, zone);
    byDay.set(day, [...(byDay.get(day) ?? []), movement]);
  }
  const days: StockChartDay[] = [];
  for (let day = input.from; day <= input.to; day = addDays(day, 1)) {
    let sold = 0;
    let received = 0;
    for (const movement of byDay.get(day) ?? []) {
      const before = balances.get(movement.lineId) ?? 0;
      balances.set(movement.lineId, movement.balanceAfter ?? before + movement.change);
      if (movement.reason && SOLD.has(movement.reason)) sold -= movement.change;
      if (movement.reason && RECEIVED.has(movement.reason) && movement.change > 0) received += movement.change;
    }
    const onHand = [...balances.values()].reduce((sum, value) => sum + value, 0);
    days.push({ date: day, onHand: round(onHand), sold: round(sold), received: round(received) });
  }
  return days;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The day it runs out at the rate it sells (the cover the KPI reads, so the
 * two never disagree) and the dashed line to it from today, two weeks at most.
 */
export function runOut(onHand: number, sold30: number, today: string) {
  const perDay = sold30 / 30;
  if (onHand <= 0) return { runsOutOn: today, runsOutIn: 0, projection: [] as StockChart["projection"] };
  const cover = coverDays(onHand, sold30);
  if (cover === null || perDay <= 0) return { runsOutOn: null, runsOutIn: null, projection: [] as StockChart["projection"] };
  const span = Math.min(14, Math.ceil(onHand / perDay));
  const projection = Array.from({ length: span + 1 }, (_, step) => ({
    date: addDays(today, step),
    onHand: Math.max(0, Math.round((onHand - perDay * step) * 10) / 10),
  }));
  return { runsOutOn: addDays(today, cover), runsOutIn: cover, projection };
}

const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
const noon = (day: string) => new Date(`${day}T12:00:00Z`);

/** "Monday" up to six days ahead, "3 October" from a week on: a weekday seven days off would read as today's. */
export function dayWords(day: string, today: string): string {
  return daysBetween(today, day) - 1 < 7 ? WEEKDAY.format(noon(day)) : DAY_MONTH.format(noon(day));
}

/**
 * What to order by when: the product's Reorder quantity, else two weeks at
 * the rate it sells, ordered the supplier's lead time before it runs out.
 * Only with a supplier or a Reorder quantity, and only while it sells.
 */
export function stockAdvice(input: {
  perDay: number;
  runsOutOn: string | null;
  today: string;
  reorderQty: number | null;
  supplier: { name: string; leadTimeDays: number | null } | null;
}): StockChart["advice"] {
  if (!input.supplier && input.reorderQty === null) return null;
  if (input.runsOutOn === null || !(input.perDay > 0)) return null;
  const orderQuantity = input.reorderQty ?? Math.ceil(input.perDay * 14);
  if (!(orderQuantity > 0)) return null;
  const lead = input.supplier?.leadTimeDays ?? null;
  const orderBy = lead ? addDays(input.runsOutOn, -lead) : input.runsOutOn;
  const when = orderBy <= input.today ? "today" : `by ${dayWords(orderBy, input.today)}`;
  const order = `Order ${orderQuantity} ${when} to cover the next two weeks`;
  if (!input.supplier || !lead) return { sentence: `${order}.`, orderQuantity };
  const who = input.supplier.name.trim().split(/\s+/)[0] ?? input.supplier.name;
  return { sentence: `${order}; ${who} delivers in ${lead} ${lead === 1 ? "day" : "days"}.`, orderQuantity };
}

/** The panel's chip: "Around 9 October, in 6 days"; "Out now"; nothing while it does not sell. */
export function runOutChip(chart: Pick<StockChart, "onHand" | "runsOutOn" | "runsOutIn">): { label: string; tone: "warn" | "bad" } | null {
  if (chart.onHand <= 0) return { label: "Out now", tone: "bad" };
  if (chart.runsOutOn === null || chart.runsOutIn === null) return null;
  const when = chart.runsOutIn === 0 ? "today" : `in ${chart.runsOutIn} ${chart.runsOutIn === 1 ? "day" : "days"}`;
  return { label: `Around ${DAY_MONTH.format(noon(chart.runsOutOn))}, ${when}`, tone: "warn" };
}
