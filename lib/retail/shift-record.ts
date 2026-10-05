import { money, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { expectedCashForShift, getCashNetFromPayments } from "@/lib/retail/cash-up";
import { tenderLabel } from "@/lib/retail/words";
import { DEFAULT_TIME_ZONE, formatTime } from "@/lib/workspace/format";
import { shiftState } from "@/lib/reports/loaders/retail/floor";

/**
 * One shift as its record reads it (00-foundations 5.6.10): the drawer's
 * figures worked out from its rows, the takings per hour for the chart, the
 * tender mix, and the facts the details rail lists. `GET
 * /api/v2/retail/shifts/[id]` answers with it, and the shift's PDF prints it.
 *
 * Takings are every sale row on the shift in the base currency: a void is a
 * negative row beside the positive one it cancels, so the rows sum to what the
 * drawer netted. What should be in the drawer is the float, plus cash taken
 * net of change, plus or minus every cash movement, the same sum the close
 * makes (`expectedCashForShift`).
 */
export type ShiftRecordView = {
  id: string;
  shiftNo: string;
  status: "OPEN" | "CLOSED";
  state: "Open" | "Not counted" | "Short" | "Over" | "Balanced";
  registerName: string;
  registerCode: string;
  cashierId: string;
  cashierName: string;
  site: { id: string; name: string } | null;
  openedAt: string;
  closedAt: string | null;
  /** Minutes open, to now or to the close. */
  minutesOpen: number;
  notes: string | null;
  openingFloat: number;
  takings: number;
  saleCount: number;
  cashSales: number;
  /** Signed: what the movements did to the drawer. */
  cashMovementNet: number;
  movements: { count: number; drops: number; dropTotal: number; lastDropAt: string | null };
  expectedCash: number;
  countedCash: number | null;
  variance: number | null;
  tenders: Array<{ tender: string; label: string; amount: number; sales: number }>;
  /** One bar per hour from the hour it opened to now or the close: "08:00". */
  hourly: Array<{ hour: string; amount: number }>;
  lastCashSale: { saleNo: string; at: string } | null;
};

const HOUR_MS = 60 * 60 * 1000;

/** The shift, or null when it is not this company's (or, with `cashierId`, not theirs). */
export async function loadShiftRecord(
  companyId: string,
  id: string,
  options: { cashierId?: string; now?: Date; timeZone?: string } = {},
): Promise<ShiftRecordView | null> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const shift = await prisma.retailShift.findFirst({
    where: { id, companyId, ...(options.cashierId ? { cashierId: options.cashierId } : {}) },
  });
  if (!shift) return null;

  const [site, sales, movements] = await Promise.all([
    prisma.site.findFirst({ where: { id: shift.siteId, companyId }, select: { id: true, name: true } }),
    prisma.retailSale.findMany({
      where: { shiftId: shift.id, companyId },
      orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
      select: {
        saleNo: true,
        saleType: true,
        status: true,
        baseAmount: true,
        changeAmount: true,
        exchangeRate: true,
        postedAt: true,
        createdAt: true,
        payments: { select: { tenderType: true, baseAmount: true } },
      },
    }),
    prisma.retailCashMovement.findMany({
      where: { shiftId: shift.id, companyId },
      orderBy: { createdAt: "asc" },
      select: { type: true, baseAmount: true, createdAt: true },
    }),
  ]);

  const cashSales = sumMoney(
    sales.map((sale) =>
      getCashNetFromPayments(
        sale.payments,
        money(sale.changeAmount).div(money(sale.exchangeRate).isZero() ? 1 : money(sale.exchangeRate)),
      ),
    ),
  );
  const expected = expectedCashForShift({ openingFloat: shift.openingFloat, cashTakings: cashSales, movements });
  const movementNet = expected.minus(money(shift.openingFloat)).minus(cashSales);
  const drops = movements.filter((movement) => movement.type === "DROP_TO_SAFE");

  const tenders = new Map<string, { amount: number; sales: Set<string> }>();
  for (const sale of sales) {
    for (const payment of sale.payments) {
      const entry = tenders.get(payment.tenderType) ?? { amount: 0, sales: new Set<string>() };
      entry.amount += toNumberOrZero(payment.baseAmount);
      entry.sales.add(sale.saleNo);
      tenders.set(payment.tenderType, entry);
    }
  }

  // The hours the drawer was open, each with what it took.
  const end = shift.closedAt ?? now;
  const startHour = Math.floor(shift.openedAt.getTime() / HOUR_MS) * HOUR_MS;
  const hours: Array<{ at: number; amount: number }> = [];
  for (let at = startHour; at <= end.getTime() && hours.length < 48; at += HOUR_MS) hours.push({ at, amount: 0 });
  for (const sale of sales) {
    const when = (sale.postedAt ?? sale.createdAt).getTime();
    const slot = hours.find((hour) => when >= hour.at && when < hour.at + HOUR_MS);
    if (slot) slot.amount += toNumberOrZero(sale.baseAmount);
  }

  const lastCash = [...sales].reverse().find((sale) => sale.payments.some((payment) => payment.tenderType === "CASH"));
  const variance = shift.variance === null ? null : toNumberOrZero(shift.variance);
  const status = shift.status === "OPEN" ? "OPEN" : "CLOSED";
  const cents = (value: number) => Math.round(value * 100) / 100;

  return {
    id: shift.id,
    shiftNo: shift.shiftNo,
    status,
    state: shiftState({ status: shift.status, countedCash: shift.countedCash, variance }),
    registerName: shift.registerName,
    registerCode: shift.registerCode,
    cashierId: shift.cashierId,
    cashierName: shift.cashierName,
    site,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? null,
    minutesOpen: Math.max(0, Math.floor((end.getTime() - shift.openedAt.getTime()) / 60_000)),
    notes: shift.notes,
    openingFloat: toNumberOrZero(shift.openingFloat),
    takings: toNumberOrZero(sumMoney(sales.map((sale) => sale.baseAmount))),
    saleCount: sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED").length,
    cashSales: toNumberOrZero(cashSales),
    cashMovementNet: toNumberOrZero(movementNet),
    movements: {
      count: movements.length,
      drops: drops.length,
      dropTotal: toNumberOrZero(sumMoney(drops.map((drop) => money(drop.baseAmount).abs()))),
      lastDropAt: drops.length ? drops[drops.length - 1]!.createdAt.toISOString() : null,
    },
    // An open drawer is worked out now; a closed one is what the close stored.
    expectedCash: status === "OPEN" ? toNumberOrZero(expected) : toNumberOrZero(shift.expectedCash),
    countedCash: shift.countedCash === null ? null : toNumberOrZero(shift.countedCash),
    variance,
    tenders: [...tenders.entries()]
      .map(([tender, entry]) => ({ tender, label: tenderLabel(tender), amount: cents(entry.amount), sales: entry.sales.size }))
      .sort((a, b) => b.amount - a.amount),
    hourly: hours.map((hour) => ({ hour: formatTime(new Date(hour.at), timeZone), amount: cents(hour.amount) })),
    lastCashSale: lastCash
      ? { saleNo: lastCash.saleNo, at: (lastCash.postedAt ?? lastCash.createdAt).toISOString() }
      : null,
  };
}
