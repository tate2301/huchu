import { Prisma } from "@prisma/client";

import { money, multiplyMoney, sumMoney, taxOn, ZERO, type MoneyLike } from "@/lib/money";
import { dayKey } from "@/lib/workspace/format";

/**
 * Buying's figures (40-buying 3.2): pure functions over plain rows, money in
 * `Prisma.Decimal` rounded to the cent per line, days in Africa/Harare.
 * Suppliers use the supplier figures now (BUY-01); orders, deliveries and
 * bills reuse the line and order figures as their units land, and only feed
 * the rows.
 */

export type OrderState = "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CLOSED" | "CANCELLED";

export type FigureLine = {
  quantity: MoneyLike;
  /** Units come in so far. */
  receivedQuantity?: MoneyLike;
  /** What the supplier was asked for when the order was sent (fill rate's denominator). */
  sentQuantity?: MoneyLike;
  /** Cost a unit, ex VAT. */
  unitCost: MoneyLike;
  /** Percent: 15.5. */
  vatRate: MoneyLike;
  /** The rest of this line will not come. */
  closedShort?: boolean;
};

export type FigureOrder = {
  state: OrderState;
  binned?: boolean;
  /** The day it was first expected (Expected as first set). */
  firstExpectedDate: Date | null;
  /** When the last delivery against it was posted. */
  lastDeliveryAt: Date | null;
  /** When it was done (received or closed). */
  doneAt: Date | null;
  lines: FigureLine[];
};

export type FigureDelivery = {
  postedAt: Date;
  lines: Array<{ quantity: MoneyLike; unitCost: MoneyLike; vatRate: MoneyLike }>;
};

export type FigureBill = {
  total: MoneyLike;
  amountPaid: MoneyLike;
  debitNoteTotal?: MoneyLike;
  writeOffTotal?: MoneyLike;
  dueDate: Date | null;
  binned?: boolean;
};

const DAY_MS = 86_400_000;
const OPEN_STATES: ReadonlySet<OrderState> = new Set(["DRAFT", "SENT", "PARTIAL"]);
const DONE_STATES: ReadonlySet<OrderState> = new Set(["RECEIVED", "CLOSED"]);

const num = (value: MoneyLike | undefined) => (value === undefined || value === null ? 0 : Number(money(value).toString()));
const units = (value: MoneyLike | undefined) => (value === undefined || value === null ? 0 : Number(value.toString()));

/* ── Lines and orders ───────────────────────────────────────────────────── */

/** Quantity × unit cost (ex VAT), to the cent. */
export function lineValue(quantity: MoneyLike, unitCost: MoneyLike): Prisma.Decimal {
  return multiplyMoney(quantity, unitCost);
}

/** round(line value × rate ÷ 100). */
export function lineVat(value: MoneyLike, vatRate: MoneyLike): Prisma.Decimal {
  return taxOn(value, vatRate);
}

/** An order's "Lines", "VAT" and "Total" (the list's Value). */
export function orderTotals(lines: FigureLine[]): { lines: Prisma.Decimal; vat: Prisma.Decimal; total: Prisma.Decimal } {
  const values = lines.map((line) => lineValue(line.quantity, line.unitCost));
  const vats = lines.map((line, index) => lineVat(values[index]!, line.vatRate));
  const net = sumMoney(values);
  const vat = sumMoney(vats);
  return { lines: net, vat, total: net.plus(vat) };
}

/** "300 of 780": Σ received and Σ ordered. */
export function orderedDelivered(lines: FigureLine[]): { ordered: number; delivered: number } {
  return {
    ordered: lines.reduce((sum, line) => sum + units(line.quantity), 0),
    delivered: lines.reduce((sum, line) => sum + units(line.receivedQuantity), 0),
  };
}

/** Σ received × cost with VAT: "US$240.00 delivered". */
export function deliveredValue(lines: FigureLine[]): Prisma.Decimal {
  return sumMoney(
    lines.map((line) => {
      const value = lineValue(line.receivedQuantity ?? 0, line.unitCost);
      return value.plus(lineVat(value, line.vatRate));
    }),
  );
}

/** Units and value with VAT still to come: none once the order is done or called off. */
export function stillToCome(order: Pick<FigureOrder, "state" | "lines">): { units: number; value: Prisma.Decimal } {
  if (!OPEN_STATES.has(order.state)) return { units: 0, value: ZERO };
  let count = 0;
  const values: Prisma.Decimal[] = [];
  for (const line of order.lines) {
    if (line.closedShort) continue;
    const left = Math.max(0, units(line.quantity) - (order.state === "DRAFT" ? 0 : units(line.receivedQuantity)));
    if (left === 0) continue;
    count += left;
    const value = lineValue(left, line.unitCost);
    values.push(value.plus(lineVat(value, line.vatRate)));
  }
  return { units: count, value: sumMoney(values) };
}

/** Whole days from one Harare calendar day to another. */
function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / DAY_MS);
}

/** Late: sent or part delivered, something still to come, and today (Harare) after the day first expected. */
export function lateness(order: Pick<FigureOrder, "state" | "lines" | "firstExpectedDate">, now: Date): { late: boolean; days: number } {
  if ((order.state !== "SENT" && order.state !== "PARTIAL") || !order.firstExpectedDate) return { late: false, days: 0 };
  if (stillToCome(order).units <= 0) return { late: false, days: 0 };
  const days = daysBetween(dayKey(order.firstExpectedDate), dayKey(now));
  return days > 0 ? { late: true, days } : { late: false, days: 0 };
}

/* ── A supplier ─────────────────────────────────────────────────────────── */

/** A delivery's value with VAT: what the bill is compared with, and what Spend counts. */
export function deliveryValueWithVat(delivery: FigureDelivery): Prisma.Decimal {
  return sumMoney(
    delivery.lines.map((line) => {
      const value = lineValue(line.quantity, line.unitCost);
      return value.plus(lineVat(value, line.vatRate));
    }),
  );
}

export type Delta = { text: string; tone: "ok" | "bad" | "plain" };

/** "+6%" ok, "−4%" bad, "0%" plain; "New this year" when nothing came the 365 days before. */
export function spendDelta(spend: MoneyLike, before: MoneyLike): Delta {
  const now = num(spend);
  const then = num(before);
  if (then === 0) return { text: "New this year", tone: "plain" };
  const pct = Math.round(((now - then) / then) * 100);
  if (pct > 0) return { text: `+${pct}%`, tone: "ok" };
  if (pct < 0) return { text: `−${-pct}%`, tone: "bad" };
  return { text: "0%", tone: "plain" };
}

/** "Spend, 12 months": posted deliveries' value with VAT in the last 365 days, and the 365 before. */
export function spend12(deliveries: FigureDelivery[], now: Date): { spend: Prisma.Decimal; before: Prisma.Decimal; delta: Delta } {
  const yearAgo = now.getTime() - 365 * DAY_MS;
  const twoYearsAgo = now.getTime() - 730 * DAY_MS;
  const spend = sumMoney(
    deliveries.filter((d) => d.postedAt.getTime() > yearAgo && d.postedAt.getTime() <= now.getTime()).map(deliveryValueWithVat),
  );
  const before = sumMoney(
    deliveries.filter((d) => d.postedAt.getTime() > twoYearsAgo && d.postedAt.getTime() <= yearAgo).map(deliveryValueWithVat),
  );
  return { spend, before, delta: spendDelta(spend, before) };
}

/** "Orders": non-binned orders; "open" are draft, sent or part delivered (the list's Open). */
export function orderCounts(orders: FigureOrder[]): { orders: number; open: number } {
  const live = orders.filter((order) => !order.binned);
  return { orders: live.length, open: live.filter((order) => OPEN_STATES.has(order.state)).length };
}

/** Late orders: the strip's "1 order late" and the phone card's badge. */
export function lateOrders(orders: FigureOrder[], now: Date): number {
  return orders.filter((order) => !order.binned && lateness(order, now).late).length;
}

function doneBetween(orders: FigureOrder[], from: number, to: number): FigureOrder[] {
  return orders.filter(
    (order) => !order.binned && DONE_STATES.has(order.state) && order.doneAt && order.doneAt.getTime() > from && order.doneAt.getTime() <= to,
  );
}

function onTimePct(done: FigureOrder[]): number | null {
  if (done.length === 0) return null;
  const onTime = done.filter(
    (order) => order.firstExpectedDate && order.lastDeliveryAt && dayKey(order.lastDeliveryAt) <= dayKey(order.firstExpectedDate),
  ).length;
  return Math.round((onTime / done.length) * 100);
}

/** "On time": of the orders done in the last 12 months, the % whose last delivery came on or before the day first expected. */
export function onTime(orders: FigureOrder[], now: Date): { pct: number | null; before: number | null; delta: Delta | null } {
  const t = now.getTime();
  const pct = onTimePct(doneBetween(orders, t - 365 * DAY_MS, t));
  const before = onTimePct(doneBetween(orders, t - 730 * DAY_MS, t - 365 * DAY_MS));
  if (pct === null || before === null) return { pct, before, delta: null };
  const pts = pct - before;
  return {
    pct,
    before,
    delta: pts > 0 ? { text: `+${pts} pts`, tone: "ok" } : pts < 0 ? { text: `−${-pts} pts`, tone: "bad" } : { text: "0 pts", tone: "plain" },
  };
}

/**
 * "Fill rate": Σ received ÷ Σ sent over the orders done in the last 12
 * months; deliveries but no orders → 100%; nothing → null ("No deliveries yet").
 */
export function fillRate(orders: FigureOrder[], deliveries: FigureDelivery[], now: Date): number | null {
  const t = now.getTime();
  const done = doneBetween(orders, t - 365 * DAY_MS, t);
  let sent = 0;
  let received = 0;
  for (const order of done) {
    for (const line of order.lines) {
      sent += units(line.sentQuantity ?? line.quantity);
      received += units(line.receivedQuantity);
    }
  }
  if (sent > 0) return Math.round((received / sent) * 100);
  return deliveries.length > 0 ? 100 : null;
}

/** "12 units short this year": Σ max(0, sent − received) over orders done this calendar year (Harare). */
export function unitsShortThisYear(orders: FigureOrder[], now: Date): number {
  const year = dayKey(now).slice(0, 4);
  let short = 0;
  for (const order of orders) {
    if (order.binned || !DONE_STATES.has(order.state) || !order.doneAt || dayKey(order.doneAt).slice(0, 4) !== year) continue;
    for (const line of order.lines) short += Math.max(0, units(line.sentQuantity ?? line.quantity) - units(line.receivedQuantity));
  }
  return short;
}

/** "Last delivery": the latest posted delivery, or null ("—"). */
export function lastDelivery(deliveries: FigureDelivery[]): Date | null {
  return deliveries.reduce<Date | null>((latest, d) => (!latest || d.postedAt > latest ? d.postedAt : latest), null);
}

/** A bill's balance: total − paid − debit notes − written off. */
export function billBalance(bill: FigureBill): Prisma.Decimal {
  return money(bill.total)
    .minus(money(bill.amountPaid))
    .minus(money(bill.debitNoteTotal ?? 0))
    .minus(money(bill.writeOffTotal ?? 0));
}

/**
 * "Owed": Σ bill balances − unallocated payment credits − open return
 * credits. Negative is a credit ("US$40.00 credit").
 */
export function owed(bills: FigureBill[], credits: { payments?: MoneyLike[]; returns?: MoneyLike[] } = {}): Prisma.Decimal {
  const balances = sumMoney(bills.filter((bill) => !bill.binned).map(billBalance));
  return balances.minus(sumMoney(credits.payments ?? [])).minus(sumMoney(credits.returns ?? []));
}

const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Harare" });

/** The Owed KPI's note: the earliest due day with a balance ("15 Oct due"), else "Nothing due". */
export function owedNote(bills: FigureBill[]): string {
  const due = bills
    .filter((bill) => !bill.binned && bill.dueDate && billBalance(bill).greaterThan(0))
    .map((bill) => bill.dueDate!)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return due ? `${SHORT_DAY.format(due)} due` : "Nothing due";
}

/** "Bought per month": posted delivery value with VAT per Harare month, oldest first, from `from` to `now`'s month. */
export function boughtPerMonth(deliveries: FigureDelivery[], now: Date, months: number): Array<{ month: string; value: Prisma.Decimal }> {
  const [year, month] = dayKey(now).split("-").map(Number) as [number, number];
  const keys: string[] = [];
  for (let back = months - 1; back >= 0; back -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - back, 15));
    keys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const totals = new Map<string, Prisma.Decimal[]>(keys.map((key) => [key, []]));
  for (const delivery of deliveries) totals.get(dayKey(delivery.postedAt).slice(0, 7))?.push(deliveryValueWithVat(delivery));
  return keys.map((key) => ({ month: key, value: sumMoney(totals.get(key)!) }));
}

/** How many months "All time" draws: from the first delivery's month, at least 12. */
export function monthsSince(deliveries: FigureDelivery[], now: Date): number {
  const first = deliveries.reduce<Date | null>((earliest, d) => (!earliest || d.postedAt < earliest ? d.postedAt : earliest), null);
  if (!first) return 12;
  const [y1, m1] = dayKey(first).split("-").map(Number) as [number, number];
  const [y2, m2] = dayKey(now).split("-").map(Number) as [number, number];
  return Math.max(12, (y2 - y1) * 12 + (m2 - m1) + 1);
}
