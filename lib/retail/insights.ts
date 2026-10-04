import { Prisma } from "@prisma/client";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { shopClock } from "@/lib/retail/shop-profile-rules";
import {
  missedSales,
  outSince,
  RATE_LOOKBACK_DAYS,
  type MissedSales,
  type MovementForStock,
  type SaleForRate,
} from "@/lib/retail/stockouts";

/**
 * Insights — the questions an owner asks of the shop, each answered on its
 * own page: when do we sell, what do we make, where is the cash sitting, are
 * we stocked right, where is money leaking, who comes back, where is the cash
 * going.
 *
 * Every page has the same shape: a few figures against the period before, one
 * chart that answers the page's question, tables behind it, what it says in
 * sentences, and where to go to do something about it. The figures leave here
 * as numbers with a format; the page writes them out.
 */

export const INSIGHT_TOPICS = ["sales", "profit", "products", "stock", "losses", "customers", "money"] as const;
export type InsightTopic = (typeof INSIGHT_TOPICS)[number];

export const INSIGHT_PERIODS = [7, 30, 90] as const;

export type Format = "money" | "count" | "percent" | "days" | "ratio";
export type Tone = "good" | "bad" | "warn";

export type Figure = { value: number; format: Format };

export type Kpi = {
  label: string;
  value: number;
  format: Format;
  /** Against the period before, when there is one to compare. */
  change?: { value: number; format: Format; tone?: Tone } | null;
  note?: string;
};

export type Cell = string | (Figure & { tone?: Tone }) | null;

export type InsightTable = {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string; align?: "end" }>;
  rows: Array<{ id: string; href?: string; cells: Record<string, Cell> }>;
  empty: string;
};

export type InsightChart =
  | { kind: "heat"; rows: string[]; columns: string[]; values: number[][]; format: Format }
  | { kind: "bars"; rows: Array<{ id: string; label: string; value: number; note?: string; tone?: Tone }>; format: Format }
  | {
      kind: "columns";
      /** Parts of one whole stack; two things to compare stand side by side. */
      stacked: boolean;
      series: Array<{ key: string; label: string }>;
      rows: Array<{ label: string; values: Record<string, number> }>;
      format: Format;
    };

export type Insight = {
  topic: InsightTopic;
  days: number;
  kpis: Kpi[];
  question: string;
  unit: string;
  chart: InsightChart;
  tables: InsightTable[];
  findings: string[];
  actions: Array<{ label: string; href: string }>;
};

const DAY = 86_400_000;

export function insightWindow(days: number, now = new Date()) {
  const to = now;
  const from = new Date(to.getTime() - days * DAY);
  const before = new Date(from.getTime() - days * DAY);
  return { from, to, before };
}

/**
 * The relative change from `before` to `now`, or null when there is nothing
 * fair to compare with — no trade before, or so little (under a fiftieth of
 * now) that the percentage would say more about the empty month than this one.
 */
export function relativeChange(now: number, before: number): number | null {
  if (before === 0 || Math.abs(before) * 50 < Math.abs(now)) return null;
  return (now - before) / Math.abs(before);
}

/** A figure's change and the words that say what it is against, or neither. */
function against(days: number, now: number, before: number, upIsGood = true): Pick<Kpi, "change" | "note"> {
  const result = change(now, before, upIsGood);
  return result ? { change: result, note: `on the ${days} days before` } : { change: null };
}

function change(now: number, before: number, upIsGood = true): Kpi["change"] {
  const relative = relativeChange(now, before);
  if (relative === null) return null;
  return { value: relative, format: "percent", tone: relative === 0 ? undefined : relative > 0 === upIsGood ? "good" : "bad" };
}

function n(value: Prisma.Decimal | number | null | undefined) {
  return toNumberOrZero(value ?? 0);
}

function money(value: number): Figure {
  return { value, format: "money" };
}

function count(value: number): Figure {
  return { value, format: "count" };
}

function share(part: number, whole: number) {
  return whole === 0 ? 0 : part / whole;
}

function usd(value: number) {
  return `US$${value.toFixed(2)}`;
}

/** Monday-first weekday labels, as `shopClock` names them. */
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Loading ─────────────────────────────────────────────────────────────────

const saleSelect = {
  id: true,
  saleType: true,
  totalAmount: true,
  discountAmount: true,
  depositAmount: true,
  postedAt: true,
  createdAt: true,
  cashierName: true,
  customerName: true,
  shift: { select: { registerName: true } },
  lines: {
    select: {
      productId: true,
      itemName: true,
      quantity: true,
      lineTotal: true,
      taxAmount: true,
      costTotal: true,
      product: { select: { retailCategory: { select: { id: true, name: true, targetMarginPercent: true } } } },
    },
  },
} satisfies Prisma.RetailSaleSelect;

export type LoadedSale = Prisma.RetailSaleGetPayload<{ select: typeof saleSelect }>;

async function loadSales(companyId: string, from: Date, to: Date) {
  return prisma.retailSale.findMany({
    where: { companyId, status: "POSTED", postedAt: { gte: from, lt: to } },
    select: saleSelect,
  });
}

function when(sale: Pick<LoadedSale, "postedAt" | "createdAt">) {
  return sale.postedAt ?? sale.createdAt;
}

/** Takings, baskets and items: a refund or void counts against the takings, a void against the baskets. */
export function salesTotals(
  sales: ReadonlyArray<Pick<LoadedSale, "saleType" | "totalAmount"> & { lines: ReadonlyArray<Pick<LoadedSale["lines"][number], "quantity">> }>,
) {
  let takings = 0;
  let baskets = 0;
  let items = 0;
  for (const sale of sales) {
    takings += n(sale.totalAmount);
    if (sale.saleType === "SALE") {
      baskets += 1;
      for (const line of sale.lines) items += n(line.quantity);
    }
    if (sale.saleType === "VOID") baskets -= 1;
  }
  return { takings, baskets, items, averageBasket: baskets > 0 ? takings / baskets : 0 };
}

/** Net revenue, cost and gross profit off the lines. VAT is not the shop's. */
export function profitOf(lines: readonly Pick<LoadedSale["lines"][number], "lineTotal" | "taxAmount" | "costTotal">[]) {
  let revenue = 0;
  let cost = 0;
  for (const line of lines) {
    revenue += n(line.lineTotal) - n(line.taxAmount);
    cost += n(line.costTotal);
  }
  return { revenue, cost, profit: revenue - cost, margin: share(revenue - cost, revenue) };
}

type Group = { id: string; label: string; target?: number | null };

function categoryOf(line: LoadedSale["lines"][number]): Group {
  const category = line.product?.retailCategory;
  return category
    ? { id: category.id, label: category.name, target: category.targetMarginPercent === null ? null : n(category.targetMarginPercent) / 100 }
    : { id: "none", label: "No category" };
}

// ── Sales ───────────────────────────────────────────────────────────────────

async function salesInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to, before } = insightWindow(days);
  const [now, then] = await Promise.all([loadSales(companyId, from, to), loadSales(companyId, before, from)]);
  const current = salesTotals(now);
  const previous = salesTotals(then);

  // Takings by weekday and hour, averaged over the weeks in the period.
  const weeks = Math.max(days / 7, 1);
  const grid = new Map<string, number>();
  let firstHour = 23;
  let lastHour = 0;
  for (const sale of now) {
    const clock = shopClock(when(sale));
    const hour = Math.floor(clock.minutes / 60);
    firstHour = Math.min(firstHour, hour);
    lastHour = Math.max(lastHour, hour);
    const key = `${clock.weekday}:${hour}`;
    grid.set(key, (grid.get(key) ?? 0) + n(sale.totalAmount));
  }
  if (firstHour > lastHour) [firstHour, lastHour] = [8, 20];
  const hours = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index);
  const values = WEEKDAYS.map((day) => hours.map((hour) => (grid.get(`${day}:${hour}`) ?? 0) / weeks));

  // By category, till and cashier.
  const byCategoryNow = new Map<string, { group: Group; takings: number; baskets: Set<string> }>();
  const byCategoryThen = new Map<string, number>();
  for (const sale of now) {
    for (const line of sale.lines) {
      const group = categoryOf(line);
      const entry = byCategoryNow.get(group.id) ?? { group, takings: 0, baskets: new Set<string>() };
      entry.takings += n(line.lineTotal);
      if (sale.saleType === "SALE") entry.baskets.add(sale.id);
      byCategoryNow.set(group.id, entry);
    }
  }
  for (const sale of then) {
    for (const line of sale.lines) {
      const group = categoryOf(line);
      byCategoryThen.set(group.id, (byCategoryThen.get(group.id) ?? 0) + n(line.lineTotal));
    }
  }
  const lineTakings = [...byCategoryNow.values()].reduce((sum, entry) => sum + entry.takings, 0);
  const categories = [...byCategoryNow.values()].sort((left, right) => right.takings - left.takings);

  const by = (key: (sale: LoadedSale) => string) => {
    const totals = new Map<string, { takings: number; baskets: number }>();
    for (const sale of now) {
      const name = key(sale);
      const entry = totals.get(name) ?? { takings: 0, baskets: 0 };
      entry.takings += n(sale.totalAmount);
      if (sale.saleType === "SALE") entry.baskets += 1;
      totals.set(name, entry);
    }
    return [...totals.entries()].sort((left, right) => right[1].takings - left[1].takings);
  };

  const groupTable = (id: string, label: string, rows: Array<[string, { takings: number; baskets: number }]>): InsightTable => ({
    id,
    label,
    columns: [
      { id: "name", label: label.replace("By ", "").replace(/^./, (c) => c.toUpperCase()) },
      { id: "takings", label: "Takings", align: "end" },
      { id: "share", label: "Share", align: "end" },
      { id: "baskets", label: "Baskets", align: "end" },
    ],
    rows: rows.map(([name, entry]) => ({
      id: name,
      cells: {
        name,
        takings: money(entry.takings),
        share: { value: share(entry.takings, current.takings), format: "percent" },
        baskets: count(entry.baskets),
      },
    })),
    empty: "No sales in this period.",
  });

  // What it says.
  const findings: string[] = [];
  const slots = WEEKDAYS.flatMap((day, row) => hours.map((hour, column) => ({ day, hour, value: values[row][column] })));
  const busiest = slots.reduce((best, slot) => (slot.value > best.value ? slot : best), slots[0]);
  if (busiest && busiest.value > 0) {
    findings.push(
      `${busiest.day} ${String(busiest.hour).padStart(2, "0")}:00 is the busiest hour, taking ${usd(busiest.value)} on an average week.`,
    );
  }
  const quietMornings = slots.filter((slot) => slot.hour < 10 && slot.value > 0);
  if (quietMornings.length > 0) {
    const average = quietMornings.reduce((sum, slot) => sum + slot.value, 0) / quietMornings.length;
    findings.push(`Before 10:00 the shop takes ${usd(average)} an hour on average.`);
  }
  const growing = categories
    .map((entry) => ({ entry, change: relativeChange(entry.takings, byCategoryThen.get(entry.group.id) ?? 0) }))
    .filter((row) => row.change !== null)
    .sort((left, right) => (right.change ?? 0) - (left.change ?? 0))[0];
  if (growing && (growing.change ?? 0) > 0) {
    findings.push(`${growing.entry.group.label} grew ${(growing.change! * 100).toFixed(0)}% on the period before.`);
  }

  return {
    topic: "sales",
    days,
    kpis: [
      { label: "Takings", ...money(current.takings), ...against(days, current.takings, previous.takings) },
      { label: "Sales", ...count(current.baskets), change: change(current.baskets, previous.baskets), note: "baskets" },
      { label: "Average basket", ...money(current.averageBasket), change: change(current.averageBasket, previous.averageBasket) },
      {
        label: "Items a basket",
        value: current.baskets ? current.items / current.baskets : 0,
        format: "ratio",
        change: change(current.baskets ? current.items / current.baskets : 0, previous.baskets ? previous.items / previous.baskets : 0),
      },
    ],
    question: "When do we sell?",
    unit: `Takings by day and hour, last ${days} days, on an average week`,
    chart: { kind: "heat", rows: WEEKDAYS, columns: hours.map((hour) => String(hour).padStart(2, "0")), values, format: "money" },
    tables: [
      {
        id: "category",
        label: "By category",
        columns: [
          { id: "name", label: "Category" },
          { id: "takings", label: "Takings", align: "end" },
          { id: "share", label: "Share", align: "end" },
          { id: "change", label: "Against before", align: "end" },
          { id: "baskets", label: "Baskets", align: "end" },
        ],
        rows: categories.map((entry) => {
          const relative = relativeChange(entry.takings, byCategoryThen.get(entry.group.id) ?? 0);
          return {
            id: entry.group.id,
            cells: {
              name: entry.group.label,
              takings: money(entry.takings),
              share: { value: share(entry.takings, lineTakings), format: "percent" },
              change: relative === null ? "New" : { value: relative, format: "percent", tone: relative >= 0 ? "good" : "bad" },
              baskets: count(entry.baskets.size),
            },
          };
        }),
        empty: "No sales in this period.",
      },
      groupTable("till", "By till", by((sale) => sale.shift?.registerName ?? "No till")),
      groupTable("cashier", "By cashier", by((sale) => sale.cashierName ?? "Unknown")),
    ],
    findings,
    actions: [
      { label: "See the sales", href: "/retail/sales" },
      { label: "Plan a promotion for the quiet hours", href: "/retail/merchandising/promotions" },
    ],
  };
}

// ── Profit ──────────────────────────────────────────────────────────────────

async function lossesFromCounts(companyId: string, from: Date, to: Date) {
  const adjustments = await prisma.stockMovement.findMany({
    where: {
      movementType: "ADJUSTMENT",
      createdAt: { gte: from, lt: to },
      item: { site: { companyId } },
    },
    select: { quantity: true, createdAt: true, item: { select: { unitCost: true } } },
  });
  return adjustments.map((row) => ({ at: row.createdAt, value: n(row.quantity) * n(row.item.unitCost) }));
}

async function profitInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to, before } = insightWindow(days);
  const [now, then, counts, countsBefore] = await Promise.all([
    loadSales(companyId, from, to),
    loadSales(companyId, before, from),
    lossesFromCounts(companyId, from, to),
    lossesFromCounts(companyId, before, from),
  ]);
  const lines = now.flatMap((sale) => sale.lines);
  const current = profitOf(lines);
  const previous = profitOf(then.flatMap((sale) => sale.lines));
  const promotions = now.filter((sale) => sale.saleType === "SALE").reduce((sum, sale) => sum + n(sale.discountAmount), 0);
  const lost = -counts.reduce((sum, row) => sum + Math.min(row.value, 0), 0);
  const lostBefore = -countsBefore.reduce((sum, row) => sum + Math.min(row.value, 0), 0);

  const byCategory = new Map<string, { group: Group; lines: typeof lines }>();
  for (const line of lines) {
    const group = categoryOf(line);
    const entry = byCategory.get(group.id) ?? { group, lines: [] };
    entry.lines.push(line);
    byCategory.set(group.id, entry);
  }
  const categoryRows = [...byCategory.values()]
    .map((entry) => ({ group: entry.group, ...profitOf(entry.lines) }))
    .sort((left, right) => right.profit - left.profit);

  const byProduct = new Map<string, { id: string; name: string; lines: typeof lines; quantity: number }>();
  for (const line of lines) {
    if (!line.productId) continue;
    const entry = byProduct.get(line.productId) ?? { id: line.productId, name: line.itemName, lines: [], quantity: 0 };
    entry.lines.push(line);
    entry.quantity += n(line.quantity);
    byProduct.set(line.productId, entry);
  }
  const products = [...byProduct.values()]
    .map((entry) => ({ ...entry, ...profitOf(entry.lines) }))
    .filter((entry) => entry.quantity > 0 && entry.revenue > 0);

  const productTable = (id: string, label: string, rows: typeof products): InsightTable => ({
    id,
    label,
    columns: [
      { id: "name", label: "Product" },
      { id: "sold", label: "Sold", align: "end" },
      { id: "revenue", label: "Sales, ex VAT", align: "end" },
      { id: "margin", label: "Margin", align: "end" },
      { id: "profit", label: `Profit, ${days} days`, align: "end" },
    ],
    rows: rows.slice(0, 10).map((entry) => ({
      id: entry.id,
      href: `/retail/catalog/${entry.id}`,
      cells: {
        name: entry.name,
        sold: count(entry.quantity),
        revenue: money(entry.revenue),
        margin: { value: entry.margin, format: "percent", tone: entry.margin < 0.15 ? "bad" : entry.margin < 0.2 ? "warn" : undefined },
        profit: money(entry.profit),
      },
    })),
    empty: "Nothing sold in this period.",
  });

  const findings: string[] = [];
  const belowTarget = categoryRows.filter((row) => row.group.target && row.margin < row.group.target);
  for (const row of belowTarget.slice(0, 2)) {
    findings.push(
      `${row.group.label} earns ${(row.margin * 100).toFixed(1)}%, below the ${(row.group.target! * 100).toFixed(0)}% you aim for.`,
    );
  }
  const worst = [...products].sort((left, right) => left.margin - right.margin)[0];
  if (worst) findings.push(`${worst.name} earns the least: ${(worst.margin * 100).toFixed(1)}% on what it sells for.`);
  const best = categoryRows.reduce<(typeof categoryRows)[number] | null>(
    (top, row) => (row.revenue > 0 && (!top || row.margin > top.margin) ? row : top),
    null,
  );
  if (best) findings.push(`${best.group.label} earns the best margin, ${(best.margin * 100).toFixed(1)}%.`);

  return {
    topic: "profit",
    days,
    kpis: [
      { label: "Gross profit", ...money(current.profit), ...against(days, current.profit, previous.profit) },
      {
        label: "Margin",
        value: current.margin,
        format: "percent",
        change: previous.revenue ? { value: current.margin - previous.margin, format: "percent", tone: current.margin >= previous.margin ? "good" : "bad" } : null,
      },
      { label: "Given away in promotions", ...money(promotions) },
      { label: "Lost to stock counts", ...money(lost), change: change(lost, lostBefore, false) },
    ],
    question: "What do we actually make?",
    unit: `Gross profit by category, last ${days} days, with its margin`,
    chart: {
      kind: "bars",
      format: "money",
      rows: categoryRows.map((row) => ({
        id: row.group.id,
        label: row.group.label,
        value: row.profit,
        note: `${(row.margin * 100).toFixed(1)}% margin`,
        tone: row.group.target && row.margin < row.group.target ? "warn" : undefined,
      })),
    },
    tables: [
      productTable("least", "Earning least", [...products].sort((left, right) => left.margin - right.margin)),
      productTable("most", "Earning most", [...products].sort((left, right) => right.profit - left.profit)),
    ],
    findings,
    actions: [
      { label: "Change prices", href: "/retail/merchandising/pricing" },
      { label: "Set margins you aim for", href: "/retail/catalog/categories" },
    ],
  };
}

// ── Products and stock ──────────────────────────────────────────────────────

type StockRow = {
  productId: string;
  name: string;
  category: Group;
  onHand: number;
  unitCost: number;
  reorderLevel: number | null;
  value: number;
  /** When the product was set up: it cannot have sold before then. */
  createdAt: Date;
};

async function loadStock(companyId: string): Promise<StockRow[]> {
  const items = await prisma.inventoryItem.findMany({
    where: { site: { companyId }, product: { companyId, archivedAt: null } },
    select: {
      currentStock: true,
      unitCost: true,
      minStock: true,
      product: {
        select: {
          id: true,
          name: true,
          createdAt: true,
          retailCategory: { select: { id: true, name: true, targetMarginPercent: true } },
        },
      },
    },
  });
  const byProduct = new Map<string, StockRow>();
  for (const item of items) {
    if (!item.product) continue;
    const category = item.product.retailCategory;
    const entry = byProduct.get(item.product.id) ?? {
      productId: item.product.id,
      name: item.product.name,
      category: category ? { id: category.id, label: category.name } : { id: "none", label: "No category" },
      onHand: 0,
      unitCost: n(item.unitCost),
      reorderLevel: item.minStock === null ? null : n(item.minStock),
      value: 0,
      createdAt: item.product.createdAt,
    };
    const onHand = n(item.currentStock);
    entry.onHand += onHand;
    entry.value += Math.max(onHand, 0) * n(item.unitCost);
    byProduct.set(item.product.id, entry);
  }
  return [...byProduct.values()];
}

async function lastSold(companyId: string) {
  const rows = await prisma.$queryRaw<Array<{ productId: string; last: Date }>>`
    SELECT l."productId", max(s."postedAt") AS last
    FROM "RetailSaleLine" l JOIN "RetailSale" s ON s.id = l."saleId"
    WHERE s."companyId" = ${companyId} AND s."saleType" = 'SALE' AND l."productId" IS NOT NULL
    GROUP BY l."productId"`;
  return new Map(rows.map((row) => [row.productId, row.last]));
}

function soldQuantities(sales: readonly LoadedSale[]) {
  const sold = new Map<string, { quantity: number; takings: number }>();
  for (const sale of sales) {
    for (const line of sale.lines) {
      if (!line.productId) continue;
      const entry = sold.get(line.productId) ?? { quantity: 0, takings: 0 };
      entry.quantity += n(line.quantity);
      entry.takings += n(line.lineTotal);
      sold.set(line.productId, entry);
    }
  }
  return sold;
}

function daysSince(date: Date | undefined, now: Date) {
  return date ? Math.floor((now.getTime() - date.getTime()) / DAY) : null;
}

async function productsInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to } = insightWindow(days);
  const [stock, last, sales] = await Promise.all([loadStock(companyId), lastSold(companyId), loadSales(companyId, from, to)]);
  const sold = soldQuantities(sales);
  const profitByProduct = new Map<string, number>();
  for (const line of sales.flatMap((sale) => sale.lines)) {
    if (!line.productId) continue;
    profitByProduct.set(line.productId, (profitByProduct.get(line.productId) ?? 0) + profitOf([line]).profit);
  }

  const idle = stock
    .filter((row) => row.onHand > 0)
    .map((row) => ({ ...row, since: daysSince(last.get(row.productId), to), last: last.get(row.productId) }))
    .filter((row) => row.since === null || row.since > 60)
    .sort((left, right) => right.value - left.value);
  const idleValue = idle.reduce((sum, row) => sum + row.value, 0);

  const profits = [...profitByProduct.values()].sort((left, right) => right - left);
  const totalProfit = profits.reduce((sum, value) => sum + value, 0);
  const top20 = share(profits.slice(0, 20).reduce((sum, value) => sum + value, 0), totalProfit);
  const outNow = stock.filter((row) => row.onHand <= 0).length;

  const buckets = [
    { id: "week", label: "This week", min: 0, max: 7 },
    { id: "month", label: "8 to 30 days", min: 8, max: 30 },
    { id: "two", label: "31 to 60 days", min: 31, max: 60 },
    { id: "three", label: "61 to 90 days", min: 61, max: 90 },
    { id: "older", label: "Over 90 days, or never", min: 91, max: Infinity },
  ].map((bucket) => ({
    ...bucket,
    value: stock
      .filter((row) => row.onHand > 0)
      .filter((row) => {
        const since = daysSince(last.get(row.productId), to) ?? Infinity;
        return since >= bucket.min && since <= bucket.max;
      })
      .reduce((sum, row) => sum + row.value, 0),
  }));

  const best = [...sold.entries()].sort((left, right) => right[1].takings - left[1].takings);
  const slow = stock
    .filter((row) => row.onHand > 0)
    .map((row) => ({ row, quantity: sold.get(row.productId)?.quantity ?? 0 }))
    .filter((entry) => entry.quantity > 0 && entry.quantity <= Math.max(2, days / 15))
    .sort((left, right) => left.quantity - right.quantity);
  const names = new Map(stock.map((row) => [row.productId, row.name]));

  const findings: string[] = [];
  if (idle.length > 0) {
    findings.push(`${usd(idleValue)} is sitting in ${idle.length} ${idle.length === 1 ? "product" : "products"} that have not sold in 60 days.`);
  }
  if (totalProfit > 0) findings.push(`The top 20 products make ${(top20 * 100).toFixed(0)}% of the profit.`);
  if (outNow > 0) findings.push(`${outNow} ${outNow === 1 ? "product is" : "products are"} out of stock now.`);

  return {
    topic: "products",
    days,
    kpis: [
      { label: "Products selling", ...count(sold.size), note: `of ${stock.length}, sold in ${days} days` },
      { label: "Not sold in 60 days", ...count(idle.length), note: `${usd(idleValue)} on the shelf` },
      { label: "Top 20 products", value: top20, format: "percent", note: "of profit" },
      { label: "Out of stock", ...count(outNow), note: "now" },
    ],
    question: "Where is our cash sitting?",
    unit: "Stock value at cost, by how long since each product last sold",
    chart: { kind: "bars", format: "money", rows: buckets.map(({ id, label, value }) => ({ id, label, value })) },
    tables: [
      {
        id: "idle",
        label: "Not sold in 60 days",
        columns: [
          { id: "name", label: "Product" },
          { id: "last", label: "Last sold" },
          { id: "onHand", label: "On hand", align: "end" },
          { id: "value", label: "Cash in it", align: "end" },
        ],
        rows: idle.slice(0, 15).map((row) => ({
          id: row.productId,
          href: `/retail/catalog/${row.productId}`,
          cells: {
            name: row.name,
            last: row.last ? row.last.toISOString() : "Never",
            onHand: count(row.onHand),
            value: money(row.value),
          },
        })),
        empty: "Everything on the shelf has sold in the last 60 days.",
      },
      {
        id: "best",
        label: "Best sellers",
        columns: [
          { id: "name", label: "Product" },
          { id: "sold", label: "Sold", align: "end" },
          { id: "takings", label: "Takings", align: "end" },
        ],
        rows: best.slice(0, 15).map(([productId, entry]) => ({
          id: productId,
          href: `/retail/catalog/${productId}`,
          cells: { name: names.get(productId) ?? "A removed product", sold: count(entry.quantity), takings: money(entry.takings) },
        })),
        empty: "Nothing sold in this period.",
      },
      {
        id: "slow",
        label: "Slow movers",
        columns: [
          { id: "name", label: "Product" },
          { id: "sold", label: "Sold", align: "end" },
          { id: "onHand", label: "On hand", align: "end" },
          { id: "value", label: "Cash in it", align: "end" },
        ],
        rows: slow.slice(0, 15).map(({ row, quantity }) => ({
          id: row.productId,
          href: `/retail/catalog/${row.productId}`,
          cells: { name: row.name, sold: count(quantity), onHand: count(row.onHand), value: money(row.value) },
        })),
        empty: "Nothing is selling slowly.",
      },
    ],
    findings,
    actions: [
      { label: "Run a promotion on what is not selling", href: "/retail/merchandising/promotions" },
      { label: "Order from suppliers", href: "/retail/purchasing/orders" },
    ],
  };
}

/** How many days the stock lasts at the period's rate of sale. Null when nothing sold. */
export function daysOfCover(onHand: number, soldInPeriod: number, days: number) {
  if (soldInPeriod <= 0) return null;
  return onHand / (soldInPeriod / days);
}

const COVER_AIM = 14;

/** How far back the stock movements are walked to find when a shelf ran empty. */
const STOCKOUT_REACH_DAYS = 365;

type Stockout = { outAt: Date | null } & MissedSales;

/**
 * When each empty shelf ran out, and what it has cost in the period.
 *
 * Two queries for every out-of-stock product at once: their movements, to
 * find the day each ran out, and their sales in the weeks before, for the rate.
 */
async function loadStockouts(companyId: string, out: readonly StockRow[], from: Date, to: Date) {
  const stockouts = new Map<string, Stockout>();
  if (out.length === 0) return stockouts;
  const ids = out.map((row) => row.productId);
  const movements = await prisma.stockMovement.findMany({
    where: {
      item: { productId: { in: ids }, site: { companyId } },
      createdAt: { gte: new Date(to.getTime() - STOCKOUT_REACH_DAYS * DAY) },
    },
    select: { movementType: true, quantity: true, createdAt: true, item: { select: { productId: true } } },
  });
  const byProduct = new Map<string, MovementForStock[]>();
  for (const movement of movements) {
    const productId = movement.item.productId;
    if (!productId) continue;
    const list = byProduct.get(productId) ?? [];
    list.push({ movementType: movement.movementType, quantity: n(movement.quantity), at: movement.createdAt });
    byProduct.set(productId, list);
  }

  const outAts = new Map(out.map((row) => [row.productId, outSince(row.onHand, byProduct.get(row.productId) ?? [])]));
  const known = [...outAts.values()].filter((date): date is Date => date !== null);
  const lines = known.length
    ? await prisma.retailSaleLine.findMany({
        where: {
          productId: { in: ids },
          sale: {
            companyId,
            saleType: "SALE",
            status: "POSTED",
            postedAt: { gte: new Date(Math.min(...known.map((date) => date.getTime())) - RATE_LOOKBACK_DAYS * DAY) },
          },
        },
        select: { productId: true, quantity: true, lineTotal: true, sale: { select: { postedAt: true, createdAt: true } } },
      })
    : [];
  const salesByProduct = new Map<string, SaleForRate[]>();
  for (const line of lines) {
    if (!line.productId) continue;
    const list = salesByProduct.get(line.productId) ?? [];
    list.push({ quantity: n(line.quantity), takings: n(line.lineTotal), at: when(line.sale) });
    salesByProduct.set(line.productId, list);
  }

  for (const row of out) {
    const outAt = outAts.get(row.productId) ?? null;
    if (!outAt) {
      stockouts.set(row.productId, { outAt, daysOut: 0, perDay: 0, missed: 0 });
      continue;
    }
    const sales = salesByProduct.get(row.productId) ?? [];
    stockouts.set(row.productId, {
      outAt,
      ...missedSales({
        outAt,
        from,
        to,
        // Set up before it sold — unless its sales were brought in from before.
        firstStockedAt: sales.reduce((first, sale) => (sale.at < first ? sale.at : first), row.createdAt),
        sales,
      }),
    });
  }
  return stockouts;
}

async function stockInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to } = insightWindow(days);
  const [stock, sales] = await Promise.all([loadStock(companyId), loadSales(companyId, from, to)]);
  const sold = soldQuantities(sales);
  const stockValue = stock.reduce((sum, row) => sum + row.value, 0);
  const costSold = profitOf(sales.flatMap((sale) => sale.lines)).cost;
  const cover = costSold > 0 ? stockValue / (costSold / days) : null;
  const low = stock.filter((row) => row.onHand > 0 && row.reorderLevel !== null && row.onHand <= row.reorderLevel);

  const byCategory = new Map<string, { group: Group; onHand: number; sold: number; value: number }>();
  for (const row of stock) {
    const entry = byCategory.get(row.category.id) ?? { group: row.category, onHand: 0, sold: 0, value: 0 };
    entry.onHand += Math.max(row.onHand, 0);
    entry.sold += sold.get(row.productId)?.quantity ?? 0;
    entry.value += row.value;
    byCategory.set(row.category.id, entry);
  }
  const categoryRows = [...byCategory.values()]
    .map((entry) => ({ ...entry, cover: daysOfCover(entry.onHand, entry.sold, days) }))
    .filter((entry) => entry.cover !== null)
    .sort((left, right) => (left.cover ?? 0) - (right.cover ?? 0));

  const coverLabel = (value: number) =>
    value < COVER_AIM / 2 ? "Too little" : value > COVER_AIM * 4 ? "Far too much" : value > COVER_AIM * 2 ? "Too much" : "About right";

  const stockouts = await loadStockouts(companyId, stock.filter((row) => row.onHand <= 0), from, to);
  const out = stock
    .filter((row) => row.onHand <= 0)
    .map((row) => ({ row, stockout: stockouts.get(row.productId)! }))
    // An empty shelf matters when it would have sold: it sold in the period,
    // or it sold before it ran out.
    .filter(({ row, stockout }) => stockout.missed > 0 || (sold.get(row.productId)?.quantity ?? 0) > 0)
    .sort((left, right) => right.stockout.missed - left.stockout.missed || right.stockout.perDay - left.stockout.perDay);
  const missed = out.reduce((sum, entry) => sum + entry.stockout.missed, 0);
  const tooMuch = stock
    .map((row) => ({ row, cover: daysOfCover(row.onHand, sold.get(row.productId)?.quantity ?? 0, days) }))
    .filter((entry) => entry.row.onHand > 0 && (entry.cover === null || entry.cover > COVER_AIM * 4))
    .sort((left, right) => right.row.value - left.row.value);

  const findings: string[] = [];
  const short = categoryRows.filter((row) => (row.cover ?? 0) < COVER_AIM / 2);
  for (const row of short.slice(0, 2)) {
    findings.push(`${row.group.label} has ${Math.round(row.cover!)} days of cover against the ${COVER_AIM} you aim for.`);
  }
  const heavy = categoryRows.filter((row) => (row.cover ?? 0) > COVER_AIM * 4);
  for (const row of heavy.slice(0, 1)) {
    findings.push(`${row.group.label} has ${Math.round(row.cover!)} days of cover: ${usd(row.value)} tied up in it.`);
  }
  if (low.length > 0) findings.push(`${low.length} ${low.length === 1 ? "product is" : "products are"} at or below the reorder level.`);
  if (missed > 0) {
    const worst = out[0];
    findings.push(
      out.filter((entry) => entry.stockout.missed > 0).length === 1
        ? `About ${usd(missed)} of sales were missed in ${days} days with ${worst.row.name} out of stock.`
        : `About ${usd(missed)} of sales were missed in ${days} days with shelves empty, ${usd(worst.stockout.missed)} of it on ${worst.row.name}.`,
    );
  }

  return {
    topic: "stock",
    days,
    kpis: [
      { label: "Stock at cost", ...money(stockValue) },
      { label: "Days of cover", value: cover ?? 0, format: "days", note: `at the last ${days} days' sales` },
      { label: "Running low", ...count(low.length), note: "at or below reorder level" },
      {
        label: "Sales missed",
        ...money(missed),
        note: `estimated, ${out.length} ${out.length === 1 ? "product" : "products"} out of stock`,
      },
    ],
    question: "Are we stocked right?",
    unit: `Days of cover by category at the last ${days} days' sales, against the ${COVER_AIM} days you aim for`,
    chart: {
      kind: "bars",
      format: "days",
      rows: categoryRows.map((row) => ({
        id: row.group.id,
        label: row.group.label,
        value: row.cover ?? 0,
        note: coverLabel(row.cover ?? 0),
        tone: coverLabel(row.cover ?? 0) === "About right" ? undefined : coverLabel(row.cover ?? 0) === "Far too much" ? "bad" : "warn",
      })),
    },
    tables: [
      {
        id: "out",
        label: "Out of stock",
        columns: [
          { id: "name", label: "Product" },
          { id: "outFor", label: "Out for", align: "end" },
          { id: "missed", label: "Sales missed", align: "end" },
          { id: "perDay", label: "Sold a day", align: "end" },
          { id: "reorder", label: "Reorder at", align: "end" },
        ],
        rows: out.map(({ row, stockout }) => ({
          id: row.productId,
          href: `/retail/catalog/${row.productId}`,
          cells: {
            name: row.name,
            outFor:
              stockout.outAt === null
                ? "Over a year"
                : { value: daysSince(stockout.outAt, to) ?? 0, format: "days", tone: "warn" },
            missed: stockout.outAt === null ? "Not known" : { ...money(stockout.missed), tone: stockout.missed > 0 ? "bad" : undefined },
            perDay: { value: stockout.outAt === null ? (sold.get(row.productId)?.quantity ?? 0) / days : stockout.perDay, format: "ratio" },
            reorder: row.reorderLevel === null ? "Not set" : count(row.reorderLevel),
          },
        })),
        empty: "Nothing that sells is out of stock.",
      },
      {
        id: "much",
        label: "Too much",
        columns: [
          { id: "name", label: "Product" },
          { id: "cover", label: "Days of cover", align: "end" },
          { id: "onHand", label: "On hand", align: "end" },
          { id: "value", label: "Cash in it", align: "end" },
        ],
        rows: tooMuch.slice(0, 15).map(({ row, cover: days }) => ({
          id: row.productId,
          href: `/retail/catalog/${row.productId}`,
          cells: {
            name: row.name,
            cover: days === null ? "Not selling" : { value: days, format: "days", tone: "warn" },
            onHand: count(row.onHand),
            value: money(row.value),
          },
        })),
        empty: "Nothing is overstocked.",
      },
    ],
    findings,
    actions: [
      { label: "See what is running low", href: "/retail/stock" },
      { label: "Order from suppliers", href: "/retail/purchasing/orders" },
    ],
  };
}

// ── Losses ──────────────────────────────────────────────────────────────────

function weekStarts(from: Date, to: Date) {
  const starts: Date[] = [];
  for (let at = from.getTime(); at < to.getTime(); at += 7 * DAY) starts.push(new Date(at));
  return starts;
}

function weekIndex(starts: Date[], at: Date) {
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    if (at >= starts[index]) return index;
  }
  return 0;
}

function weekLabel(date: Date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Harare" }).format(date);
}

async function lossesInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to, before } = insightWindow(days);
  const [counts, countsBefore, shifts, shiftsBefore, sales, salesBefore] = await Promise.all([
    lossesFromCounts(companyId, from, to),
    lossesFromCounts(companyId, before, from),
    prisma.retailShift.findMany({
      where: { companyId, status: "CLOSED", closedAt: { gte: from, lt: to } },
      select: { variance: true, closedAt: true, cashierName: true, registerName: true },
    }),
    prisma.retailShift.findMany({
      where: { companyId, status: "CLOSED", closedAt: { gte: before, lt: from } },
      select: { variance: true },
    }),
    loadSales(companyId, from, to),
    loadSales(companyId, before, from),
  ]);

  const countLoss = -counts.reduce((sum, row) => sum + Math.min(row.value, 0), 0);
  const drawer = -shifts.reduce((sum, row) => sum + Math.min(n(row.variance), 0), 0);
  const reversals = sales.filter((sale) => sale.saleType !== "SALE");
  const reversed = -reversals.reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const total = countLoss + drawer + reversed;
  const totalBefore =
    -countsBefore.reduce((sum, row) => sum + Math.min(row.value, 0), 0) -
    shiftsBefore.reduce((sum, row) => sum + Math.min(n(row.variance), 0), 0) -
    salesBefore.filter((sale) => sale.saleType !== "SALE").reduce((sum, sale) => sum + n(sale.totalAmount), 0);
  const takings = salesTotals(sales).takings;
  const shortShifts = shifts.filter((row) => n(row.variance) < 0).length;

  const starts = weekStarts(from, to);
  const weeks = starts.map((start) => ({ label: weekLabel(start), values: { counts: 0, drawer: 0, reversals: 0 } }));
  for (const row of counts) weeks[weekIndex(starts, row.at)].values.counts += -Math.min(row.value, 0);
  for (const row of shifts) if (row.closedAt) weeks[weekIndex(starts, row.closedAt)].values.drawer += -Math.min(n(row.variance), 0);
  for (const sale of reversals) weeks[weekIndex(starts, when(sale))].values.reversals += -n(sale.totalAmount);

  const people = new Map<string, { drawer: number; refunds: number; voids: number; short: number }>();
  const person = (name: string) => {
    const entry = people.get(name) ?? { drawer: 0, refunds: 0, voids: 0, short: 0 };
    people.set(name, entry);
    return entry;
  };
  for (const row of shifts) {
    const entry = person(row.cashierName);
    entry.drawer += n(row.variance);
    if (n(row.variance) < 0) entry.short += 1;
  }
  for (const sale of reversals) {
    const entry = person(sale.cashierName ?? "Unknown");
    if (sale.saleType === "REFUND") entry.refunds += -n(sale.totalAmount);
    else entry.voids += -n(sale.totalAmount);
  }

  const findings: string[] = [];
  const change_ = relativeChange(total, totalBefore);
  if (change_ !== null && Math.abs(change_) >= 0.1) {
    findings.push(`Losses are ${change_ > 0 ? "up" : "down"} ${(Math.abs(change_) * 100).toFixed(0)}% on the period before.`);
  }
  const biggest = [
    { label: "stock counts", value: countLoss },
    { label: "drawer differences", value: drawer },
    { label: "refunds and voids", value: reversed },
  ].sort((left, right) => right.value - left.value)[0];
  if (biggest.value > 0) findings.push(`Most of it is ${biggest.label}: ${usd(biggest.value)}.`);
  const shortest = [...people.entries()].sort((left, right) => left[1].drawer - right[1].drawer)[0];
  if (shortest && shortest[1].drawer < 0) {
    findings.push(`${shortest[0]} was short ${shortest[1].short} ${shortest[1].short === 1 ? "time" : "times"}, ${usd(-shortest[1].drawer)} in all.`);
  }

  return {
    topic: "losses",
    days,
    kpis: [
      { label: `Lost in ${days} days`, ...money(total), ...against(days, total, totalBefore, false) },
      { label: "Of takings", value: share(total, takings), format: "percent" },
      { label: "Drawer differences", ...money(drawer), note: `${shortShifts} ${shortShifts === 1 ? "shift" : "shifts"} short` },
      { label: "Refunds and voids", ...money(reversed), note: `${reversals.length} of them` },
    ],
    question: "Where is money leaking?",
    unit: "Losses each week, by kind",
    chart: {
      kind: "columns",
      stacked: true,
      format: "money",
      series: [
        { key: "counts", label: "Stock counts" },
        { key: "drawer", label: "Drawer differences" },
        { key: "reversals", label: "Refunds and voids" },
      ],
      rows: weeks,
    },
    tables: [
      {
        id: "cashier",
        label: "By cashier",
        columns: [
          { id: "name", label: "Cashier" },
          { id: "drawer", label: "Drawer differences", align: "end" },
          { id: "refunds", label: "Refunds", align: "end" },
          { id: "voids", label: "Voids", align: "end" },
        ],
        rows: [...people.entries()].map(([name, entry]) => ({
          id: name,
          cells: {
            name,
            drawer: { ...money(entry.drawer), tone: entry.drawer < 0 ? "bad" : undefined },
            refunds: money(entry.refunds),
            voids: money(entry.voids),
          },
        })),
        empty: "No losses in this period.",
      },
    ],
    findings,
    actions: [
      { label: "Count the stock", href: "/retail/stock/count" },
      { label: "Look at the shifts", href: "/retail/shifts" },
      { label: "Tighten the till rules", href: "/retail/setup/pos-policy" },
    ],
  };
}

// ── Customers ───────────────────────────────────────────────────────────────

function isMember(name: string | null) {
  return Boolean(name && name.trim() && name.trim().toLowerCase() !== "walk-in");
}

async function customersInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to, before } = insightWindow(days);
  const yearAgo = new Date(to.getTime() - 365 * DAY);
  const [year, then] = await Promise.all([loadSales(companyId, yearAgo, to), loadSales(companyId, before, from)]);
  const now = year.filter((sale) => when(sale) >= from);
  const totals = (sales: readonly LoadedSale[]) => {
    let members = 0;
    let walkIns = 0;
    let memberBaskets = 0;
    let walkInBaskets = 0;
    for (const sale of sales) {
      const amount = n(sale.totalAmount);
      if (isMember(sale.customerName)) {
        members += amount;
        if (sale.saleType === "SALE") memberBaskets += 1;
      } else {
        walkIns += amount;
        if (sale.saleType === "SALE") walkInBaskets += 1;
      }
    }
    return { members, walkIns, memberBaskets, walkInBaskets };
  };
  const current = totals(now);
  const previous = totals(then);
  const memberShare = share(current.members, current.members + current.walkIns);
  const memberShareBefore = share(previous.members, previous.members + previous.walkIns);
  const memberBasket = current.memberBaskets ? current.members / current.memberBaskets : 0;
  const walkInBasket = current.walkInBaskets ? current.walkIns / current.walkInBaskets : 0;

  const customers = new Map<string, { last: Date; visits: number; spend: number; visitsNow: number; spendNow: number }>();
  for (const sale of year) {
    if (!isMember(sale.customerName) || sale.saleType !== "SALE") continue;
    const name = sale.customerName!.trim();
    const entry = customers.get(name) ?? { last: when(sale), visits: 0, spend: 0, visitsNow: 0, spendNow: 0 };
    entry.visits += 1;
    entry.spend += n(sale.totalAmount);
    if (when(sale) > entry.last) entry.last = when(sale);
    if (when(sale) >= from) {
      entry.visitsNow += 1;
      entry.spendNow += n(sale.totalAmount);
    }
    customers.set(name, entry);
  }
  const cameBack = [...customers.values()].filter((entry) => entry.visitsNow > 0 && entry.visits > entry.visitsNow).length;
  const lapsed = [...customers.entries()]
    .filter(([, entry]) => to.getTime() - entry.last.getTime() > 30 * DAY)
    .sort((left, right) => right[1].spend - left[1].spend);

  const starts = weekStarts(from, to);
  const weeks = starts.map((start) => ({ label: weekLabel(start), values: { members: 0, walkIns: 0 } }));
  for (const sale of now) {
    const week = weeks[weekIndex(starts, when(sale))];
    if (isMember(sale.customerName)) week.values.members += n(sale.totalAmount);
    else week.values.walkIns += n(sale.totalAmount);
  }

  const customerTable = (id: string, label: string, rows: typeof lapsed, spendLabel: string): InsightTable => ({
    id,
    label,
    columns: [
      { id: "name", label: "Customer" },
      { id: "last", label: "Last came" },
      { id: "visits", label: "Visits, 12 months", align: "end" },
      { id: "spend", label: spendLabel, align: "end" },
    ],
    rows: rows.slice(0, 15).map(([name, entry]) => ({
      id: name,
      cells: { name, last: entry.last.toISOString(), visits: count(entry.visits), spend: money(id === "best" ? entry.spendNow : entry.spend) },
    })),
    empty: id === "best" ? "No members bought in this period." : "Every member has been in within 30 days.",
  });

  const findings: string[] = [];
  if (walkInBasket > 0 && memberBasket > 0) {
    findings.push(`Members spend ${(memberBasket / walkInBasket).toFixed(1)} times what a walk-in does a visit.`);
  }
  if (lapsed.length > 0) findings.push(`${lapsed.length} ${lapsed.length === 1 ? "member has" : "members have"} not been in for 30 days.`);
  findings.push(`Members brought in ${(memberShare * 100).toFixed(0)}% of takings.`);

  return {
    topic: "customers",
    days,
    kpis: [
      {
        label: "Takings from members",
        value: memberShare,
        format: "percent",
        change: memberShareBefore || memberShare ? { value: memberShare - memberShareBefore, format: "percent", tone: memberShare >= memberShareBefore ? "good" : "bad" } : null,
      },
      { label: "Members who came back", ...count(cameBack), note: `in ${days} days` },
      { label: "Member basket", ...money(memberBasket), note: walkInBasket ? `${(memberBasket / walkInBasket).toFixed(1)}× a walk-in's` : undefined },
      { label: "Not seen in 30 days", ...count(lapsed.length), note: "members" },
    ],
    question: "Who comes back?",
    unit: "Takings each week, members against walk-ins",
    chart: {
      kind: "columns",
      stacked: true,
      format: "money",
      series: [
        { key: "members", label: "Members" },
        { key: "walkIns", label: "Walk-ins" },
      ],
      rows: weeks,
    },
    tables: [
      customerTable("lapsed", "Not seen in 30 days", lapsed, "Spend, 12 months"),
      customerTable(
        "best",
        "Best customers",
        [...customers.entries()].filter(([, entry]) => entry.spendNow > 0).sort((left, right) => right[1].spendNow - left[1].spendNow),
        `Spend, ${days} days`,
      ),
    ],
    findings,
    actions: [{ label: "See the customers", href: "/retail/customers" }],
  };
}

// ── Money ───────────────────────────────────────────────────────────────────

async function moneyInsight(companyId: string, days: number): Promise<Insight> {
  const { from, to } = insightWindow(days);
  const [openShifts, sales, receipts, requisitions, orders, deposits] = await Promise.all([
    prisma.retailShift.findMany({ where: { companyId, status: "OPEN" }, select: { expectedCash: true } }),
    loadSales(companyId, from, to),
    prisma.retailGoodsReceipt.findMany({
      where: { companyId, postedAt: { gte: from, lt: to } },
      select: { postedAt: true, lines: { select: { lineTotal: true } } },
    }),
    prisma.crmRequisition.findMany({
      where: { companyId, siteId: { not: null }, status: { in: ["SUBMITTED", "APPROVED", "DISBURSED"] } },
      select: {
        id: true,
        requisitionNo: true,
        status: true,
        purpose: true,
        amount: true,
        approvedAmount: true,
        neededBy: true,
        disbursedAt: true,
        requestedBy: { select: { name: true } },
      },
    }),
    prisma.retailPurchaseOrder.findMany({
      where: { companyId, status: { in: ["DRAFT", "PARTIAL"] } },
      select: {
        id: true,
        poNo: true,
        supplierName: true,
        expectedDate: true,
        lines: { select: { quantity: true, receivedQuantity: true, unitCost: true } },
      },
    }),
    prisma.retailSale.aggregate({ where: { companyId, status: "POSTED" }, _sum: { depositAmount: true } }),
  ]);

  const inTills = openShifts.reduce((sum, row) => sum + n(row.expectedCash), 0);
  const payable = (row: (typeof requisitions)[number]) => n(row.approvedAmount ?? row.amount);
  const toPay = requisitions.filter((row) => row.status !== "DISBURSED");
  const waiting = toPay.filter((row) => row.status === "SUBMITTED").length;
  const onOrder = orders.map((order) => ({
    order,
    value: order.lines.reduce((sum, line) => sum + Math.max(n(line.quantity) - n(line.receivedQuantity), 0) * n(line.unitCost), 0),
  }));
  const onOrderValue = onOrder.reduce((sum, row) => sum + row.value, 0);

  const starts = weekStarts(from, to);
  const weeks = starts.map((start) => ({ label: weekLabel(start), values: { in: 0, out: 0 } }));
  for (const sale of sales) weeks[weekIndex(starts, when(sale))].values.in += n(sale.totalAmount) + n(sale.depositAmount);
  for (const receipt of receipts) {
    if (!receipt.postedAt) continue;
    weeks[weekIndex(starts, receipt.postedAt)].values.out += receipt.lines.reduce((sum, line) => sum + n(line.lineTotal), 0);
  }
  for (const row of requisitions) {
    if (row.status === "DISBURSED" && row.disbursedAt && row.disbursedAt >= from) {
      weeks[weekIndex(starts, row.disbursedAt)].values.out += payable(row);
    }
  }
  const inTotal = weeks.reduce((sum, week) => sum + week.values.in, 0);
  const outTotal = weeks.reduce((sum, week) => sum + week.values.out, 0);

  const findings: string[] = [];
  findings.push(
    inTotal >= outTotal
      ? `${usd(inTotal - outTotal)} more came in than went to suppliers and expenses in ${days} days.`
      : `${usd(outTotal - inTotal)} more went to suppliers and expenses than came in over ${days} days.`,
  );
  const heaviest = weeks.reduce<(typeof weeks)[number] | null>(
    (top, week) => (week.values.out > week.values.in && (!top || week.values.out - week.values.in > top.values.out - top.values.in) ? week : top),
    null,
  );
  if (heaviest) findings.push(`The week of ${heaviest.label} spent more than it took.`);
  if (waiting > 0) findings.push(`${waiting} ${waiting === 1 ? "requisition is" : "requisitions are"} waiting for a decision.`);

  return {
    topic: "money",
    days,
    kpis: [
      { label: "Cash in open tills", ...money(inTills) },
      { label: "On order from suppliers", ...money(onOrderValue), note: `${orders.length} ${orders.length === 1 ? "order" : "orders"}` },
      { label: "Requisitions to pay", ...money(toPay.reduce((sum, row) => sum + payable(row), 0)), note: `${waiting} to decide` },
      { label: "Bottle deposits held", ...money(n(deposits._sum.depositAmount)), note: "owed back on empties" },
    ],
    question: "Where is the cash going?",
    unit: "Money in and out each week",
    chart: {
      kind: "columns",
      stacked: false,
      format: "money",
      series: [
        { key: "in", label: "In: sales and deposits" },
        { key: "out", label: "Out: deliveries and requisitions" },
      ],
      rows: weeks,
    },
    tables: [
      {
        id: "due",
        label: "Still to pay or come",
        columns: [
          { id: "what", label: "What" },
          { id: "who", label: "Who" },
          { id: "due", label: "Due" },
          { id: "amount", label: "Amount", align: "end" },
        ],
        rows: [
          ...toPay.map((row) => ({
            id: row.id,
            href: `/retail/purchasing/requisitions/${row.id}`,
            cells: {
              what: `${row.requisitionNo} · ${row.purpose}`,
              who: row.requestedBy?.name ?? "—",
              due: row.neededBy ? row.neededBy.toISOString() : row.status === "SUBMITTED" ? "Waiting" : "Approved",
              amount: money(payable(row)),
            },
          })),
          ...onOrder
            .filter((row) => row.value > 0)
            .map(({ order, value }) => ({
              id: order.id,
              href: `/retail/purchasing/orders/${order.id}`,
              cells: {
                what: order.poNo,
                who: order.supplierName,
                due: order.expectedDate ? order.expectedDate.toISOString() : "No date",
                amount: money(value),
              },
            })),
        ],
        empty: "Nothing is waiting to be paid or delivered.",
      },
    ],
    findings,
    actions: [
      { label: "Decide the requisitions", href: "/retail/purchasing/requisitions" },
      { label: "See the orders", href: "/retail/purchasing/orders" },
    ],
  };
}

const BUILDERS: Record<InsightTopic, (companyId: string, days: number) => Promise<Insight>> = {
  sales: salesInsight,
  profit: profitInsight,
  products: productsInsight,
  stock: stockInsight,
  losses: lossesInsight,
  customers: customersInsight,
  money: moneyInsight,
};

export function loadInsight(companyId: string, topic: InsightTopic, days: number) {
  return BUILDERS[topic](companyId, days);
}
