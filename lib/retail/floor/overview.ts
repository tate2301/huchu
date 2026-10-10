import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { defaultSiteFor } from "@/lib/retail/floor/default-site";
import { needsAction, type NeedsActionRow, type NeedsContext, type OverviewShift, type ShiftFigures } from "@/lib/retail/floor/needs-action";
import { hoursOpen, isStale } from "@/lib/retail/floor/needs-action/stale-shift";
import { byLeastCover } from "@/lib/retail/floor/needs-action/low-stock";
import { siteHours } from "@/lib/retail/floor/sale-view";
import { takingsWhere } from "@/lib/retail/floor/takings";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { canRetailSessionDo, retailPermissionDenial, type SessionLike } from "@/lib/retail/permission-matrix";
import { loadOnHand, type OnHandLine } from "@/lib/retail/stock/on-hand";
import { tillState, type DeviceKind } from "@/lib/retail/till-words";
import { formatQuantity } from "@/lib/retail/words";
import {
  addDays,
  dayKey,
  DEFAULT_TIME_ZONE,
  formatMoney,
  formatShortDay,
  formatSigned,
  formatTime,
  formatWhen,
} from "@/lib/workspace/format";

/**
 * The Overview (50-floor §4.1, FLR-08; board Floor): the owner's morning
 * look at one site, or every site, for today, this week or this month.
 *
 * `loadOverview` reads the rows, each tile's read in parallel; everything
 * else here is a pure function of those rows, so the words and figures are
 * tested without a database. Takings are decision 10's, through
 * `takingsWhere`: every sale, refund and void document, in the base currency.
 */

const ZONE = DEFAULT_TIME_ZONE;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const OVERVIEW_PERIODS = ["today", "week", "month"] as const;
export type OverviewPeriod = (typeof OVERVIEW_PERIODS)[number];

/* ── The response ──────────────────────────────────────────────────────── */

export type TakingsTile = {
  label: string;
  value: string;
  against: { value: string; deltaPct: number | null; label: string };
  /** The x labels under the sparkline: five hours, Mon…Sun, or five days of the month. */
  axis: string[];
  /** Each point's name, for its tooltip ("11:00", "Tue", "14"). */
  labels: string[];
  /** This period's takings per point, up to now; null after it. */
  series: Array<number | null>;
  /** The comparison's at each point, the whole span; null where it has no such point. */
  compare: Array<number | null>;
  legend: [string, string];
};

export type SalesTile = { value: number; delta: number | null; deltaLabel: string; bars: number[] };
export type BasketTile = { value: string; delta: string | null; deltaLabel: string; bars: number[] };
export type MarginTile = { valuePct: number; deltaPts: number | null; deltaLabel: string; bars: number[] };

export type TillNow = {
  id: string;
  name: string;
  state: "OPEN" | "STALE" | "OFFLINE" | "CLOSED";
  stateLabel: string;
  meta: string;
  takings: string;
  sales: number;
  href: string;
};

export type DayTakings = { date: string; label: string; value: string; sales: number };
export type PaidKey = "cash" | "ecocash" | "card" | "zig" | "other";
export type PaidPart = { key: PaidKey; name: string; value: string; share: number };
export type TopProduct = { productId: string; name: string; takings: string; qtyLabel: string; pct: number };
export type ReorderRow = { productId: string; name: string; onHandLabel: string; meta: string; pct: number; low: boolean };
export type CashierRow = { userId: string; name: string; takings: string; meta: string; pct: number };

export type OverviewResponse = {
  period: OverviewPeriod;
  site: { id: string; name: string } | null;
  sites: Array<{ id: string; name: string }>;
  updatedAt: string;
  /** What the caller may start from here: "+ Open shift". */
  can: { openShift: boolean };
  tiles: {
    takings: TakingsTile;
    sales: SalesTile;
    basket: BasketTile;
    margin?: MarginTile;
    needsAction: NeedsActionRow[];
    tillsNow: TillNow[];
    byDay: { total: string; days: DayTakings[] };
    paid: PaidPart[];
    topProducts: TopProduct[];
    /** Absent for a caller who cannot see stock. */
    toReorder?: ReorderRow[];
    cashiers: CashierRow[];
  };
};

/* ── Money in cents ────────────────────────────────────────────────────── */

/** Exact cents from a database amount. */
export function cents(value: Prisma.Decimal.Value | { toString(): string }): number {
  return Math.round(Number(String(value)) * 100);
}

/** "1284.60" on the wire. */
export const wire = (amountCents: number) => (amountCents / 100).toFixed(2);
const dollars = (amountCents: number) => amountCents / 100;

/* ── Windows ───────────────────────────────────────────────────────────── */

const startOf = (day: string) => startOfDayIn(day, ZONE);

/** 0 is Sunday. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
}

function daysInMonth(day: string): number {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month!, 0)).getUTCDate();
}

function firstOfLastMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export type OverviewWindow = {
  period: OverviewPeriod;
  /** Today, `YYYY-MM-DD` in the shop's time. */
  today: string;
  from: Date;
  to: Date;
  againstFrom: Date;
  againstTo: Date;
  /** "Takings today". */
  label: string;
  /** "on last Saturday by this hour". */
  against: string;
  /** "on last Saturday". */
  deltaLabel: string;
  legend: [string, string];
  /** "today", "this week", "this month". */
  words: string;
};

/**
 * Today is the trading day so far against the same weekday last week to the
 * same time; this week is Monday to now against last week to the same
 * weekday and time; this month is the 1st to now against last month to the
 * same day and time (its last day, when it is shorter).
 */
export function overviewWindow(period: OverviewPeriod, now: Date): OverviewWindow {
  const today = dayKey(now, ZONE);
  const startToday = startOf(today);
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
  if (period === "today") {
    const weekday = WEEKDAYS[weekdayOf(today)]!;
    return {
      period,
      today,
      from: startToday,
      to: now,
      againstFrom: startOf(addDays(today, -7)),
      againstTo: weekAgo,
      label: "Takings today",
      against: `on last ${weekday} by this hour`,
      deltaLabel: `on last ${weekday}`,
      legend: ["Today", `Last ${weekday}`],
      words: "today",
    };
  }
  if (period === "week") {
    const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
    return {
      period,
      today,
      from: startOf(monday),
      to: now,
      againstFrom: startOf(addDays(monday, -7)),
      againstTo: weekAgo,
      label: "Takings this week",
      against: "on last week by now",
      deltaLabel: "on last week",
      legend: ["This week", "Last week"],
      words: "this week",
    };
  }
  const first = `${today.slice(0, 8)}01`;
  const lastFirst = firstOfLastMonth(today);
  const date = Number(today.slice(8, 10));
  const lastLength = daysInMonth(lastFirst);
  const againstTo =
    date > lastLength
      ? startOf(first)
      : new Date(startOf(`${lastFirst.slice(0, 8)}${String(date).padStart(2, "0")}`).getTime() + (now.getTime() - startToday.getTime()));
  return {
    period,
    today,
    from: startOf(first),
    to: now,
    againstFrom: startOf(lastFirst),
    againstTo,
    label: "Takings this month",
    against: "on last month by now",
    deltaLabel: "on last month",
    legend: ["This month", "Last month"],
    words: "this month",
  };
}

/** Monday 00:00 of the week `now` is in. */
export function weekStartOf(now: Date): Date {
  const today = dayKey(now, ZONE);
  return startOf(addDays(today, -((weekdayOf(today) + 6) % 7)));
}

/* ── Rows the builders read ────────────────────────────────────────────── */

/** One sale document (decision 10): what it took, when, on which till and shift. */
export type TakingsRow = {
  at: Date;
  cents: number;
  saleType: "SALE" | "REFUND" | "VOID";
  status: "POSTED" | "VOIDED";
  registerId: string | null;
  shiftId: string | null;
};

/** A sale is a SALE document still standing. */
const isSale = (row: Pick<TakingsRow, "saleType" | "status">) => row.saleType === "SALE" && row.status === "POSTED";

function within(at: Date, from: Date, to: Date) {
  return at >= from && at < to;
}

function sumCents(rows: ReadonlyArray<TakingsRow>, from: Date, to: Date) {
  let total = 0;
  let sales = 0;
  for (const row of rows) {
    if (!within(row.at, from, to)) continue;
    total += row.cents;
    if (isSale(row)) sales += 1;
  }
  return { total, sales };
}

/** Rounded to one decimal place. */
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

/** The change on the comparison as a percentage, or null when there was nothing to compare with. */
export function deltaPct(value: number, against: number): number | null {
  if (against === 0) return null;
  return oneDecimal(((value - against) / Math.abs(against)) * 100);
}

/* ── Takings: the hero ─────────────────────────────────────────────────── */

export type Hours = { open: number; close: number };

/** The hours the sparkline spans: the site's, else the licence hours, else 07:00 to 19:00. */
export function hoursFor(openingHours: string | null, licence: { alcoholFrom: number; alcoholUntil: number } | null, weekday: number): Hours {
  if (openingHours && /\d{1,2}:\d{2}/.test(openingHours)) return siteHours(openingHours, weekday);
  if (licence && licence.alcoholUntil > licence.alcoholFrom) {
    return { open: Math.floor(licence.alcoholFrom / 60), close: Math.ceil(licence.alcoholUntil / 60) };
  }
  return { open: 7, close: 19 };
}

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

/** Five labels spread evenly over a list. */
function fiveOf<T>(items: ReadonlyArray<T>): T[] {
  if (items.length <= 5) return [...items];
  return [0, 1, 2, 3, 4].map((step) => items[Math.round((step * (items.length - 1)) / 4)]!);
}

type Spark = { labels: string[]; axis: string[]; starts: Date[]; compareStarts: Array<Date | null>; size: number };

/**
 * The sparkline's points: today per hour over the site's hours, widened to
 * any hour that took money; this week Mon…Sun; this month the 1st…the last.
 */
export function sparkPoints(window: OverviewWindow, hours: Hours, rows: ReadonlyArray<TakingsRow>): Spark {
  if (window.period === "today") {
    const startToday = window.from.getTime();
    let { open, close } = hours;
    for (const row of rows) {
      if (!within(row.at, window.from, window.to)) continue;
      const hour = Math.floor((row.at.getTime() - startToday) / HOUR_MS);
      open = Math.min(open, hour);
      close = Math.max(close, hour);
    }
    const all = Array.from({ length: close - open + 1 }, (_, index) => open + index);
    return {
      labels: all.map(hourLabel),
      axis: fiveOf(all).map(hourLabel),
      starts: all.map((hour) => new Date(startToday + hour * HOUR_MS)),
      compareStarts: all.map((hour) => new Date(window.againstFrom.getTime() + hour * HOUR_MS)),
      size: HOUR_MS,
    };
  }
  if (window.period === "week") {
    const monday = dayKey(window.from, ZONE);
    const days = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
    const lastMonday = dayKey(window.againstFrom, ZONE);
    const labels = days.map((day) => WEEKDAYS_SHORT[weekdayOf(day)]!);
    return {
      labels,
      axis: labels,
      starts: days.map(startOf),
      compareStarts: days.map((_, index) => startOf(addDays(lastMonday, index))),
      size: DAY_MS,
    };
  }
  const first = dayKey(window.from, ZONE);
  const lastFirst = dayKey(window.againstFrom, ZONE);
  const length = daysInMonth(first);
  const lastLength = daysInMonth(lastFirst);
  const labels = Array.from({ length }, (_, index) => String(index + 1));
  return {
    labels,
    axis: fiveOf(labels),
    starts: labels.map((_, index) => startOf(addDays(first, index))),
    compareStarts: labels.map((_, index) => (index < lastLength ? startOf(addDays(lastFirst, index)) : null)),
    size: DAY_MS,
  };
}

/** Takings in each [start, start + size), in dollars. */
function bucketDollars(rows: ReadonlyArray<TakingsRow>, starts: ReadonlyArray<Date | null>, size: number): Array<number | null> {
  return starts.map((start) => (start === null ? null : dollars(sumCents(rows, start, new Date(start.getTime() + size)).total)));
}

export function takingsTile(window: OverviewWindow, rows: ReadonlyArray<TakingsRow>, hours: Hours): TakingsTile {
  const now = sumCents(rows, window.from, window.to).total;
  const before = sumCents(rows, window.againstFrom, window.againstTo).total;
  const spark = sparkPoints(window, hours, rows);
  const series = bucketDollars(rows, spark.starts, spark.size).map((value, index) => (spark.starts[index]! <= window.to ? value : null));
  return {
    label: window.label,
    value: wire(now),
    against: { value: wire(before), deltaPct: deltaPct(now, before), label: window.against },
    axis: spark.axis,
    labels: spark.labels,
    series,
    compare: bucketDollars(rows, spark.compareStarts, spark.size),
    legend: window.legend,
  };
}

/* ── Sales, basket, margin ─────────────────────────────────────────────── */

/** The last seven days, today last, as [from, to) windows; today's runs to now. */
export function lastSevenDays(today: string, now: Date): Array<{ day: string; from: Date; to: Date }> {
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(today, index - 6);
    return { day, from: startOf(day), to: index === 6 ? now : startOf(addDays(day, 1)) };
  });
}

/** The basket in cents: takings over sales, or 0 with no sales. */
const basketCents = (total: number, sales: number) => (sales > 0 ? Math.round(total / sales) : 0);

export function salesTiles(window: OverviewWindow, rows: ReadonlyArray<TakingsRow>, now: Date): { sales: SalesTile; basket: BasketTile } {
  const current = sumCents(rows, window.from, window.to);
  const before = sumCents(rows, window.againstFrom, window.againstTo);
  const days = lastSevenDays(window.today, now).map((day) => sumCents(rows, day.from, day.to));
  const basket = basketCents(current.total, current.sales);
  const basketBefore = basketCents(before.total, before.sales);
  return {
    sales: {
      value: current.sales,
      delta: before.sales > 0 ? current.sales - before.sales : null,
      deltaLabel: window.deltaLabel,
      bars: days.map((day) => day.sales),
    },
    basket: {
      value: wire(basket),
      delta: before.sales > 0 && current.sales > 0 ? wire(basket - basketBefore) : null,
      deltaLabel: window.deltaLabel,
      bars: days.map((day) => dollars(basketCents(day.total, day.sales))),
    },
  };
}

/** A sale line as the margin and the top products read it. */
export type LineRow = {
  at: Date;
  saleType: "SALE" | "REFUND" | "VOID";
  status: "POSTED" | "VOIDED";
  productId: string | null;
  name: string;
  unit: string | null;
  quantity: number;
  /** With VAT: what the customer paid for the line. */
  totalCents: number;
  taxCents: number;
  costCents: number;
};

/**
 * Gross margin over a window: (Σ line net ex VAT − Σ cost) ÷ Σ line net ex
 * VAT, over the sales still standing net of refunds, in % to one decimal.
 * Null when nothing was sold.
 */
export function marginPct(lines: ReadonlyArray<LineRow>, from: Date, to: Date): number | null {
  let net = 0;
  let cost = 0;
  for (const line of lines) {
    if (!within(line.at, from, to)) continue;
    if (!((line.saleType === "SALE" && line.status === "POSTED") || line.saleType === "REFUND")) continue;
    net += line.totalCents - line.taxCents;
    cost += line.costCents;
  }
  return net > 0 ? oneDecimal(((net - cost) / net) * 100) : null;
}

export function marginTile(window: OverviewWindow, lines: ReadonlyArray<LineRow>, now: Date): MarginTile {
  const value = marginPct(lines, window.from, window.to);
  const before = marginPct(lines, window.againstFrom, window.againstTo);
  return {
    valuePct: value ?? 0,
    deltaPts: value !== null && before !== null ? oneDecimal(value - before) : null,
    deltaLabel: window.deltaLabel,
    bars: lastSevenDays(window.today, now).map((day) => marginPct(lines, day.from, day.to) ?? 0),
  };
}

/* ── Takings by day ────────────────────────────────────────────────────── */

/** "Sat 3 Oct". */
export function dayLabel(day: string): string {
  return `${WEEKDAYS_SHORT[weekdayOf(day)]} ${formatShortDay(startOf(day))}`;
}

/** The last 30 trading days to today, whatever the period, and their total. */
export function byDayTile(rows: ReadonlyArray<TakingsRow>, today: string, now: Date): { total: string; days: DayTakings[] } {
  let total = 0;
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = addDays(today, index - 29);
    const sum = sumCents(rows, startOf(day), index === 29 ? now : startOf(addDays(day, 1)));
    total += sum.total;
    return { date: day, label: dayLabel(day), value: wire(sum.total), sales: sum.sales };
  });
  return { total: wire(total), days };
}

/* ── How people paid ───────────────────────────────────────────────────── */

const PAID_NAMES: Record<PaidKey, string> = { cash: "Cash", ecocash: "EcoCash", card: "Card", zig: "ZiG", other: "Other" };

/** Cash in US$, EcoCash, Card, ZiG (cash in ZWG), and Other for every other way. */
export function paidKey(payment: { tenderType: string; currency: string | null }): PaidKey {
  const zig = ["ZWG", "ZIG"].includes((payment.currency ?? "USD").toUpperCase());
  if (payment.tenderType === "CASH") return zig ? "zig" : "cash";
  if (payment.tenderType === "ECOCASH") return "ecocash";
  if (payment.tenderType === "CARD") return "card";
  return "other";
}

/**
 * Whole-number shares of a total that add up to exactly 100 (largest
 * remainder). Nothing to share, or nothing positive: every share is 0.
 */
export function sharesTo100(values: ReadonlyArray<number>): number[] {
  const positive = values.map((value) => Math.max(0, value));
  const total = positive.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return positive.map(() => 0);
  const exact = positive.map((value) => (value / total) * 100);
  const shares = exact.map(Math.floor);
  let left = 100 - shares.reduce((sum, share) => sum + share, 0);
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    shares[index]! += 1;
    left -= 1;
  }
  return shares;
}

/**
 * What each tender took towards takings. A deposit-bearing sale's payments
 * hold the bottle deposit too (the customer paid goods plus deposit) but
 * takings never do (decision 10), so each sale's deposit comes off its
 * largest payments first and the tenders sum to the takings they split.
 * Refunds and voids carry their deposit negative, so the same sum holds.
 */
export function paymentsTowardsTakings(
  payments: ReadonlyArray<{ saleId: string; depositCents: number; tenderType: string; currency: string | null; cents: number }>,
): Array<{ tenderType: string; currency: string | null; cents: number }> {
  const bySale = new Map<string, typeof payments[number][]>();
  for (const payment of payments) bySale.set(payment.saleId, [...(bySale.get(payment.saleId) ?? []), payment]);
  const net: Array<{ tenderType: string; currency: string | null; cents: number }> = [];
  for (const group of bySale.values()) {
    let deposit = group[0]!.depositCents;
    for (const payment of [...group].sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))) {
      const take = deposit === 0 || Math.sign(deposit) !== Math.sign(payment.cents) ? 0 : Math.sign(deposit) * Math.min(Math.abs(deposit), Math.abs(payment.cents));
      deposit -= take;
      net.push({ tenderType: payment.tenderType, currency: payment.currency, cents: payment.cents - take });
    }
  }
  return net;
}

export function paidTile(payments: ReadonlyArray<{ tenderType: string; currency: string | null; cents: number }>): PaidPart[] {
  const totals = new Map<PaidKey, number>([
    ["cash", 0],
    ["ecocash", 0],
    ["card", 0],
    ["zig", 0],
    ["other", 0],
  ]);
  for (const payment of payments) {
    const key = paidKey(payment);
    totals.set(key, totals.get(key)! + payment.cents);
  }
  const keys = [...totals.keys()].filter((key) => key !== "other" || totals.get("other") !== 0);
  const shares = sharesTo100(keys.map((key) => totals.get(key)!));
  return keys.map((key, index) => ({ key, name: PAID_NAMES[key], value: wire(totals.get(key)!), share: shares[index]! }));
}

/* ── Rank lists ────────────────────────────────────────────────────────── */

/** A unit that counts: "case", "bottle"; not "each" or none. */
const countable = (unit: string | null) => Boolean(unit?.trim()) && unit!.trim().toLowerCase() !== "each";

/** The window's five best sellers by takings: "8 cases", "3 bottles", or "4 sold" for a product sold each. */
export function topProductsTile(lines: ReadonlyArray<LineRow>, from: Date, to: Date): TopProduct[] {
  const products = new Map<string, { productId: string; name: string; unit: string | null; cents: number; quantity: number }>();
  for (const line of lines) {
    if (!within(line.at, from, to)) continue;
    const key = line.productId ?? line.name;
    const product = products.get(key) ?? { productId: line.productId ?? "", name: line.name, unit: line.unit, cents: 0, quantity: 0 };
    product.cents += line.totalCents;
    product.quantity += line.quantity;
    products.set(key, product);
  }
  const ranked = [...products.values()].filter((product) => product.cents > 0).sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)).slice(0, 5);
  const first = ranked[0]?.cents ?? 0;
  return ranked.map((product) => ({
    productId: product.productId,
    name: product.name,
    takings: wire(product.cents),
    qtyLabel: countable(product.unit) ? formatQuantity(product.quantity, product.unit) : `${formatQuantity(product.quantity)} sold`,
    pct: first > 0 ? product.cents / first : 0,
  }));
}

/** Low and Out at the site, the least cover first, five: "6 left", "reorder at 12 · 6 days". */
export function toReorderTile(lines: ReadonlyArray<OnHandLine>): ReorderRow[] {
  const low = lines.filter((line) => line.level === "LOW" || line.level === "OUT").sort(byLeastCover).slice(0, 5);
  const most = Math.max(0, ...low.map((line) => line.onHand));
  return low.map((line) => {
    const atLevel = line.onHand <= 0 || (line.reorderAt !== null && line.onHand <= line.reorderAt);
    const parts = [line.reorderAt !== null ? `reorder at ${line.reorderAt.toLocaleString("en-US")}` : null];
    if (!atLevel && line.coverDays !== null) parts.push(`${line.coverDays} ${line.coverDays === 1 ? "day" : "days"}`);
    return {
      productId: line.productId,
      name: line.product,
      onHandLabel: line.onHand <= 0 ? "Out" : `${line.onHand.toLocaleString("en-US")} left`,
      meta: parts.filter(Boolean).join(" · ") || "no reorder level",
      pct: most > 0 ? Math.max(0, line.onHand) / most : 0,
      low: atLevel,
    };
  });
}

/**
 * People with shifts this week, by their shifts' takings: "5 shifts ·
 * −US$7.65" (their counted drawers' differences), "3 shifts · balanced", or
 * "1 shift · not counted yet" while none of them has been counted.
 */
export function cashiersTile(shifts: ReadonlyArray<OverviewShift>, figures: Map<string, ShiftFigures>, weekStart: Date): CashierRow[] {
  const people = new Map<string, { name: string; cents: number; shifts: number; counted: number; variance: number }>();
  for (const shift of shifts) {
    if (shift.openedAt < weekStart && shift.status !== "OPEN") continue;
    const person = people.get(shift.cashierId) ?? { name: shift.cashierName, cents: 0, shifts: 0, counted: 0, variance: 0 };
    person.shifts += 1;
    person.cents += cents(figures.get(shift.id)?.takings ?? 0);
    if (shift.variance !== null) {
      person.variance += cents(shift.variance);
      person.counted += 1;
    }
    people.set(shift.cashierId, person);
  }
  const ranked = [...people.entries()].sort((a, b) => b[1].cents - a[1].cents || a[1].name.localeCompare(b[1].name));
  const first = ranked[0]?.[1].cents ?? 0;
  return ranked.map(([userId, person]) => ({
    userId,
    name: person.name,
    takings: wire(person.cents),
    meta: `${person.shifts} ${person.shifts === 1 ? "shift" : "shifts"} · ${
      person.counted === 0 ? "not counted yet" : person.variance === 0 ? "balanced" : formatSigned(person.variance / 100)
    }`,
    pct: first > 0 ? Math.max(0, person.cents) / first : 0,
  }));
}

/* ── Tills now ─────────────────────────────────────────────────────────── */

export type OverviewTill = {
  id: string;
  name: string;
  device: { kind: DeviceKind; lastSeenAt: Date | null } | null;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/**
 * The tills at the site with an open shift, an offline device, a shift closed
 * today or a sale today (an offline till names its open shift): open first, then a drawer open more than 12 hours, then offline,
 * then closed, each by name (the Floor board's order). Figures are the open shift's, else today's
 * on that till.
 */
export function tillsNowTile(input: {
  tills: ReadonlyArray<OverviewTill>;
  shifts: ReadonlyArray<OverviewShift>;
  figures: Map<string, ShiftFigures>;
  rows: ReadonlyArray<TakingsRow>;
  today: string;
  now: Date;
}): TillNow[] {
  const { now } = input;
  const startToday = startOf(input.today);
  const rank = { OPEN: 0, STALE: 1, OFFLINE: 2, CLOSED: 3 } as const;
  const found: TillNow[] = [];
  for (const till of input.tills) {
    const open = input.shifts.find((shift) => shift.status === "OPEN" && shift.registerId === till.id) ?? null;
    const todays = input.rows.filter((row) => row.registerId === till.id && within(row.at, startToday, now));
    const state = tillState({ device: till.device, shiftOpen: open !== null }, now).state;
    const lastClosed =
      input.shifts
        .filter((shift) => shift.registerId === till.id && shift.status === "CLOSED" && shift.closedAt !== null && shift.closedAt >= startToday)
        .sort((a, b) => b.closedAt!.getTime() - a.closedAt!.getTime())[0] ?? null;
    if (!open && !lastClosed && state !== "OFFLINE" && todays.length === 0) continue;
    const stale = open !== null && isStale(open, now);
    const kind: TillNow["state"] = stale ? "STALE" : state === "OFFLINE" ? "OFFLINE" : open ? "OPEN" : "CLOSED";
    const seen = till.device?.lastSeenAt ?? null;
    const person = open?.cashierName ?? lastClosed?.cashierName ?? null;
    const meta =
      kind === "OPEN"
        ? `${open!.cashierName} · since ${formatTime(open!.openedAt)} · float ${formatMoney(Number(open!.openingFloat))}`
        : kind === "STALE"
          ? `${open!.cashierName} · since ${formatWhen(open!.openedAt)} · needs closing`
          : kind === "OFFLINE"
            ? [
                person ? firstName(person) : null,
                open ? `open since ${dayKey(open.openedAt, ZONE) === input.today ? formatTime(open.openedAt) : formatWhen(open.openedAt)}` : null,
                `last seen ${seen ? (dayKey(seen, ZONE) === input.today ? formatTime(seen) : formatWhen(seen)) : "never"}`,
              ]
                .filter(Boolean)
                .join(" · ")
            : lastClosed
              ? `Closed at ${formatTime(lastClosed.closedAt!)} · ${lastClosed.cashierName}`
              : "Closed";
    const figures = open
      ? (input.figures.get(open.id) ?? { takings: null, sales: 0 })
      : { takings: null, sales: todays.filter(isSale).length };
    const takings = open ? cents(figures.takings ?? 0) : todays.reduce((sum, row) => sum + row.cents, 0);
    const shiftId = open?.id ?? lastClosed?.id ?? [...todays].reverse().find((row) => row.shiftId)?.shiftId ?? null;
    found.push({
      id: till.id,
      name: till.name,
      state: kind,
      stateLabel: kind === "STALE" ? `Open ${hoursOpen(open!.openedAt, now)}h` : kind === "OPEN" ? "Open" : kind === "OFFLINE" ? "Offline" : "Closed",
      meta,
      takings: wire(takings),
      sales: figures.sales,
      href: shiftId ? `/retail/shifts/${shiftId}` : "/retail/shifts",
    });
  }
  return found.sort((a, b) => rank[a.state] - rank[b.state] || a.name.localeCompare(b.name));
}

/* ── Loading ───────────────────────────────────────────────────────────── */

export class OverviewRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404,
    message: string,
  ) {
    super(message);
  }
}

export type OverviewSession = SessionLike & { user: { id: string; companyId: string } };

/** A read shared by several tiles, run once. */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let running: Promise<T> | null = null;
  return () => (running ??= load());
}

function parsePeriod(value: string | null | undefined): OverviewPeriod {
  if (!value) return "today";
  if ((OVERVIEW_PERIODS as readonly string[]).includes(value)) return value as OverviewPeriod;
  throw new OverviewRefused(400, "Choose today, this week or this month.");
}

/**
 * Everything the Overview shows, for `period` at `siteId` ("all", a site, or
 * by default the caller's own site). Each tile is one read, all in parallel.
 */
export async function loadOverview(
  session: OverviewSession,
  input: { period?: string | null; siteId?: string | null },
  now: Date = new Date(),
): Promise<OverviewResponse> {
  const denied = retailPermissionDenial(session, "retail.reports", "view");
  if (denied) throw new OverviewRefused(403, denied);
  const period = parsePeriod(input.period);
  const { companyId, id: userId } = session.user;

  const scope = await siteScopeOf(companyId, userId);
  const sites = await prisma.site.findMany({
    where: { companyId, isActive: true, ...(scope.all ? {} : { id: { in: scope.ids } }) },
    select: { id: true, name: true, openingHours: true },
    orderBy: { name: "asc" },
  });
  let site: (typeof sites)[number] | null = null;
  if (input.siteId && input.siteId !== "all") {
    site = sites.find((entry) => entry.id === input.siteId) ?? null;
    if (!site) throw new OverviewRefused(404, "Site not found");
  } else if (!input.siteId && sites.length > 1) {
    const preferred = await defaultSiteFor(companyId, userId);
    site = sites.find((entry) => entry.id === preferred) ?? sites[0]!;
  }
  const siteIds = site ? [site.id] : scope.all ? null : sites.map((entry) => entry.id);
  const inSites = siteIds ? { siteId: { in: siteIds } } : {};

  const window = overviewWindow(period, now);
  const weekStart = weekStartOf(now);
  const thirtyFrom = startOf(addDays(window.today, -29));
  const sevenFrom = startOf(addDays(window.today, -6));
  const earliest = new Date(Math.min(window.from.getTime(), window.againstFrom.getTime(), thirtyFrom.getTime()));
  const linesFrom = new Date(Math.min(window.from.getTime(), window.againstFrom.getTime(), sevenFrom.getTime()));
  const canSeeCost = canRetailSessionDo(session, "retail.catalog", "view-cost");
  const canSeeStock = canRetailSessionDo(session, "retail.stock", "view");

  const shifts = once(async (): Promise<OverviewShift[]> =>
    prisma.retailShift.findMany({
      where: {
        companyId,
        ...inSites,
        OR: [
          { status: "OPEN" },
          { openedAt: { gte: weekStart } },
          { closedAt: { gte: weekStart } },
          { status: "CLOSED", signOffOutcome: null, OR: [{ countedCash: null }, { variance: null }] },
          { status: "CLOSED", signOffOutcome: "LOOK_INTO", OR: [{ countedCash: null }, { variance: null }] },
        ],
      },
      select: {
        id: true,
        shiftNo: true,
        registerId: true,
        registerName: true,
        cashierId: true,
        cashierName: true,
        openingFloat: true,
        status: true,
        openedAt: true,
        closedAt: true,
        countedCash: true,
        variance: true,
        signOffOutcome: true,
      },
      orderBy: { openedAt: "asc" },
    }),
  );
  const shiftFigures = once(async () => {
    const ids = (await shifts()).map((shift) => shift.id);
    const grouped = ids.length
      ? await prisma.retailSale.groupBy({
          by: ["shiftId", "saleType", "status"],
          where: takingsWhere({ companyId, shiftIds: ids }),
          _sum: { baseAmount: true },
          _count: { _all: true },
        })
      : [];
    const figures = new Map<string, ShiftFigures>();
    for (const group of grouped) {
      if (!group.shiftId) continue;
      const entry = figures.get(group.shiftId) ?? { takings: new Prisma.Decimal(0), sales: 0 };
      entry.takings = entry.takings.plus(group._sum.baseAmount ?? 0);
      if (group.saleType === "SALE" && group.status === "POSTED") entry.sales += group._count._all;
      figures.set(group.shiftId, entry);
    }
    return figures;
  });
  const lowStock = once(async () =>
    (await loadOnHand(companyId)).filter(
      (line) => (line.level === "LOW" || line.level === "OUT") && (siteIds === null || siteIds.includes(line.siteId)),
    ),
  );
  const ctx: NeedsContext = {
    companyId,
    siteIds,
    now,
    weekStart,
    tomorrow: addDays(window.today, 1),
    shifts,
    shiftFigures,
    lowStock,
  };

  const [takingsRows, lineRows, payments, tills, licence, needs, onHand] = await Promise.all([
    prisma.retailSale.findMany({
      where: { ...takingsWhere({ companyId, from: earliest, to: now }), ...inSites },
      select: { postedAt: true, baseAmount: true, saleType: true, status: true, registerId: true, shiftId: true },
    }),
    prisma.retailSaleLine.findMany({
      where: { companyId, sale: { ...takingsWhere({ companyId, from: canSeeCost ? linesFrom : window.from, to: now }), ...inSites } },
      select: {
        productId: true,
        itemName: true,
        quantity: true,
        lineTotal: true,
        taxAmount: true,
        costTotal: true,
        inventoryItem: { select: { unit: true } },
        sale: { select: { postedAt: true, saleType: true, status: true } },
      },
    }),
    prisma.retailSalePayment.findMany({
      where: { companyId, sale: { ...takingsWhere({ companyId, from: window.from, to: now }), ...inSites } },
      select: { saleId: true, tenderType: true, currency: true, baseAmount: true, sale: { select: { depositAmount: true } } },
    }),
    prisma.retailRegister.findMany({
      where: { companyId, isActive: true, ...inSites },
      select: {
        id: true,
        name: true,
        devices: { where: { unpairedAt: null }, select: { kind: true, lastSeenAt: true }, orderBy: { pairedAt: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
    site && !/\d{1,2}:\d{2}/.test(site.openingHours ?? "")
      ? prisma.retailLicenceHours.findFirst({
          where: { companyId, siteId: site.id, weekday: weekdayOf(window.today) },
          select: { alcoholFrom: true, alcoholUntil: true },
        })
      : Promise.resolve(null),
    needsAction(session, ctx),
    canSeeStock ? lowStock() : Promise.resolve(null),
  ]);
  const [shiftRows, figures] = await Promise.all([shifts(), shiftFigures()]);

  const rows: TakingsRow[] = takingsRows.map((row) => ({
    at: row.postedAt!,
    cents: cents(row.baseAmount),
    saleType: row.saleType,
    status: row.status,
    registerId: row.registerId,
    shiftId: row.shiftId,
  }));
  const lines: LineRow[] = lineRows.map((line) => ({
    at: line.sale.postedAt!,
    saleType: line.sale.saleType,
    status: line.sale.status,
    productId: line.productId,
    name: line.itemName,
    unit: line.inventoryItem?.unit ?? null,
    quantity: Number(line.quantity),
    totalCents: cents(line.lineTotal),
    taxCents: cents(line.taxAmount),
    costCents: cents(line.costTotal),
  }));
  // With every site in view the hours run from the earliest opening to the latest close.
  const hours = site
    ? hoursFor(site.openingHours, licence, weekdayOf(window.today))
    : sites
        .map((entry) => hoursFor(entry.openingHours, null, weekdayOf(window.today)))
        .reduce<Hours>((all, each) => ({ open: Math.min(all.open, each.open), close: Math.max(all.close, each.close) }), { open: 24, close: 0 });
  const { sales, basket } = salesTiles(window, rows, now);

  return {
    period,
    site: site ? { id: site.id, name: site.name } : null,
    sites: sites.map((entry) => ({ id: entry.id, name: entry.name })),
    updatedAt: now.toISOString(),
    can: { openShift: canRetailSessionDo(session, "retail.cash-control", "open-shift") },
    tiles: {
      takings: takingsTile(window, rows, hours.close > hours.open ? hours : { open: 7, close: 19 }),
      sales,
      basket,
      ...(canSeeCost ? { margin: marginTile(window, lines, now) } : {}),
      needsAction: needs,
      tillsNow: tillsNowTile({
        tills: tills.map((till) => ({ id: till.id, name: till.name, device: till.devices[0] ?? null })),
        shifts: shiftRows,
        figures,
        rows,
        today: window.today,
        now,
      }),
      byDay: byDayTile(rows, window.today, now),
      paid: paidTile(
        paymentsTowardsTakings(
          payments.map((payment) => ({
            saleId: payment.saleId,
            depositCents: cents(payment.sale.depositAmount ?? 0),
            tenderType: payment.tenderType,
            currency: payment.currency,
            cents: cents(payment.baseAmount),
          })),
        ),
      ),
      topProducts: topProductsTile(lines, window.from, window.to),
      ...(onHand ? { toReorder: toReorderTile(onHand) } : {}),
      cashiers: cashiersTile(shiftRows, figures, weekStart),
    },
  };
}
