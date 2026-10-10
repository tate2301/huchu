import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { saleFigures } from "@/lib/retail/products/figures";
import { loadSoldLines } from "@/lib/retail/products/sold-lines";
import { dayBalances, runOut, stockAdvice, type ChartMovement, type StockChart } from "@/lib/retail/products/stock-chart";
import { addDays, DEFAULT_TIME_ZONE, todayIn } from "@/lib/workspace/format";

/**
 * A product's stock chart (PRD-04, `GET /products/[id]/stock-chart`): its
 * lines' movements over the window, where each line stood before it, and the
 * rate it sold at over the last 30 days. Reorder at and Reorder are summed
 * over the sites that keep them, as on hand is.
 */

const sum = (values: Array<number | null>) => {
  const set = values.filter((value): value is number => value !== null);
  return set.length ? set.reduce((total, value) => total + value, 0) : null;
};

/** The chart for one product over the last `days` days; null when it is not this company's. */
export async function loadStockChart(companyId: string, productId: string, days = 30, now = new Date()): Promise<StockChart | null> {
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId },
    select: {
      supplier: { select: { name: true, leadTimeDays: true } },
      inventoryItems: { select: { id: true, currentStock: true, minStock: true, reorderQty: true } },
    },
  });
  if (!product) return null;
  const zone = DEFAULT_TIME_ZONE;
  const today = todayIn(zone, now);
  const from = addDays(today, -(days - 1));
  const start = startOfDayIn(from, zone);
  const lines = product.inventoryItems;
  const lineIds = lines.map((line) => line.id);

  const [inWindow, before, soldLines] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { itemId: { in: lineIds }, createdAt: { gte: start, lte: now } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { itemId: true, createdAt: true, reason: true, change: true, balanceAfter: true },
    }),
    Promise.all(
      lineIds.map((itemId) =>
        prisma.stockMovement.findFirst({
          where: { itemId, createdAt: { lt: start } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { balanceAfter: true },
        }),
      ),
    ),
    loadSoldLines(companyId, productId, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)),
  ]);

  const movements: ChartMovement[] = inWindow.map((row) => ({
    lineId: row.itemId,
    at: row.createdAt,
    reason: row.reason,
    change: toNumberOrZero(row.change),
    balanceAfter: row.balanceAfter === null ? null : toNumberOrZero(row.balanceAfter),
  }));
  // Each line starts the window where its last movement before it left it;
  // a line with no history before the window, where its first movement in it began.
  const openings = new Map<string, number>();
  lines.forEach((line, index) => {
    const prior = before[index]?.balanceAfter;
    const first = movements.find((movement) => movement.lineId === line.id);
    openings.set(
      line.id,
      prior !== null && prior !== undefined
        ? toNumberOrZero(prior)
        : first
          ? (first.balanceAfter ?? 0) - first.change
          : toNumberOrZero(line.currentStock),
    );
  });

  const dayRows = dayBalances({ openings, movements, from, to: today, timeZone: zone });
  const onHand = lines.reduce((total, line) => total + toNumberOrZero(line.currentStock), 0);
  const { sold30, perDay } = saleFigures(soldLines, now, startOfDayIn(today, zone));
  const out = runOut(onHand, sold30, today);
  const reorderQty = sum(lines.map((line) => (line.reorderQty === null ? null : toNumberOrZero(line.reorderQty))));
  return {
    days: dayRows,
    projection: out.projection,
    onHand,
    reorderAt: sum(lines.map((line) => (line.minStock === null ? null : toNumberOrZero(line.minStock)))),
    perDay: Math.round(perDay * 10) / 10,
    runsOutOn: out.runsOutOn,
    runsOutIn: out.runsOutIn,
    received: dayRows.filter((day) => day.received > 0).map((day) => ({ date: day.date, quantity: day.received })),
    advice: stockAdvice({ perDay, runsOutOn: out.runsOutOn, today, reorderQty, supplier: product.supplier }),
  };
}
