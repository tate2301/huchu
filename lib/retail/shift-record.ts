import { money, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { getCashNetFromPayments, sumCashMovementDeltas } from "@/lib/retail/cash-up";
import { loadPaymentSettings } from "@/lib/retail/payment-settings";
import { canRetailSessionDo, type SessionLike } from "@/lib/retail/permission-matrix";
import { tenderLabel } from "@/lib/retail/words";
import { DEFAULT_TIME_ZONE, dayKey, formatTime, formatWhen } from "@/lib/workspace/format";
import { needsSignOff, shiftState } from "@/lib/reports/loaders/retail/floor";

/**
 * One shift as its record reads it (00-foundations 5.6.10): the drawer's
 * figures worked out from its rows, the takings per hour for the chart, the
 * tender mix, and the facts the details rail lists. `GET
 * /api/v2/retail/shifts/[id]` answers with it, and the shift's PDF prints it.
 *
 * Takings are every sale row on the shift in the base currency: a void is a
 * negative row beside the positive one it cancels, so the rows sum to what the
 * drawer netted. What should be in the drawer is the shift's running
 * `expectedCash`: the float (dollars, and ZiG at the rate of the morning it
 * was counted in), plus cash taken net of change, plus or minus every cash
 * movement — each written as it happens, and what the close counts against.
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
  /** ZiG counted in at opening, in ZiG (FLR-03). */
  openingFloatZig: number;
  takings: number;
  /** Posted sales; the Sales tab also lists the refunds and voids beside them. */
  saleCount: number;
  refundCount: number;
  /** Void rows and the sales they voided. */
  voidCount: number;
  cashSales: number;
  /** Signed: what the movements did to the drawer. */
  cashMovementNet: number;
  movements: { count: number; drops: number; dropTotal: number; lastDropAt: string | null };
  /** Null while the viewer counts this drawer blind (`countsBlind`): it shows once the close answers. */
  expectedCash: number | null;
  countedCash: number | null;
  variance: number | null;
  /** The close (FLR-04): who closed it, what happened, the float left for tomorrow and what went to the safe. */
  close: { byName: string | null; note: string | null; floatLeft: number | null; toSafe: number | null } | null;
  /** A manager's decision on a drawer that closed out (FLR-05); LOOK_INTO is not final. */
  signOff: { outcome: "ACCEPT" | "RECOVER" | "LOOK_INTO"; by: string | null; at: string | null; note: string | null; recover: number | null } | null;
  /** Closed short, over or uncounted, and not yet accepted or recovered. */
  needsSignOff: boolean;
  tenders: Array<{ tender: string; label: string; amount: number; sales: number }>;
  /** Takings over the time it was open, for the chart: see `takingsOverTime`. */
  takingsOverTime: TakingsOverTime;
  lastCashSale: { saleNo: string; at: string } | null;
  /** Times the drawer was opened with no sale on this shift (SET-06 records them). */
  noSaleOpens: number;
  /** Whether the shop takes ZiG cash, so Cash in or out offers it. */
  takesZig: boolean;
  /** What the viewer may do: record cash in or out (open shift, own drawer or cash control), message the cashier. */
  can: { move: boolean; message: boolean };
};

const HOUR_MS = 60 * 60 * 1000;

/**
 * A cashier counting her own open drawer counts blind (FLR-04): what should
 * be in it stays hidden, on the close page, the record and the X-report,
 * until the close answers. Cash control sees it on every drawer.
 */
export function countsBlind(
  shift: { status: string; cashierId: string },
  viewer: SessionLike & { user: { id: string } },
): boolean {
  return shift.status === "OPEN" && viewer.user.id === shift.cashierId && !canRetailSessionDo(viewer, "retail.cash-control", "close-shift");
}

/** At most this many bars: each stays wide enough to see and to point at. */
const MAX_BARS = 24;
/** Bucket sizes in hours, each dividing a day. */
const BUCKET_HOURS = [1, 2, 3, 4, 6, 8, 12, 24];

export type TakingsOverTime = {
  /** Hours a bar covers: 1 for a shift within a day, more for one left open for days. */
  hoursEach: number;
  bars: Array<{
    /** The bar's name in the tooltip: "08:00", "08:00–11:00", "3 Oct 08:00–11:00". */
    label: string;
    /** Its x label, or "" when the axis skips it to stay readable. */
    tick: string;
    amount: number;
  }>;
};

/**
 * Takings from the hour the drawer opened to now or the close, one bar an
 * hour; a drawer left open for days is bucketed by the smallest of 2, 3, 4, 6,
 * 8, 12 or 24 hours that keeps it to 24 bars, and its labels carry the day
 * ("3 Oct 08:00"). Every bar is labelled in the tooltip; the axis labels every
 * k-th bar so the labels never run into each other.
 */
export function takingsOverTime(
  openedAt: Date,
  end: Date,
  sales: ReadonlyArray<{ at: Date; amount: number }>,
  timeZone: string = DEFAULT_TIME_ZONE,
): TakingsOverTime {
  const start = Math.floor(openedAt.getTime() / HOUR_MS) * HOUR_MS;
  const spanHours = Math.max(1, Math.floor((Math.max(end.getTime(), start) - start) / HOUR_MS) + 1);
  const hoursEach =
    BUCKET_HOURS.find((size) => Math.ceil(spanHours / size) <= MAX_BARS) ?? 24 * Math.ceil(spanHours / 24 / MAX_BARS);
  const size = hoursEach * HOUR_MS;
  const count = Math.ceil(spanHours / hoursEach);
  const amounts = Array.from({ length: count }, () => 0);
  for (const sale of sales) {
    const index = Math.floor((sale.at.getTime() - start) / size);
    if (index >= 0 && index < count) amounts[index] += sale.amount;
  }
  const days = dayKey(new Date(start), timeZone) !== dayKey(new Date(start + count * size - 1), timeZone);
  const name = (at: number) => (days ? formatWhen(new Date(at), timeZone) : formatTime(new Date(at), timeZone));
  // Hour labels ("08:00") fit twelve to a plot; day labels ("3 Oct 08:00") six.
  const every = Math.ceil(count / (days ? 6 : 12));
  return {
    hoursEach,
    bars: amounts.map((amount, index) => {
      const at = start + index * size;
      return {
        label: hoursEach === 1 ? name(at) : `${name(at)}–${formatTime(new Date(at + size), timeZone)}`,
        tick: index % every === 0 ? name(at) : "",
        amount: Math.round(amount * 100) / 100,
      };
    }),
  };
}

/** The shift, or null when it is not this company's (or, with `cashierId`, not theirs). */
export async function loadShiftRecord(
  companyId: string,
  id: string,
  options: {
    cashierId?: string;
    now?: Date;
    timeZone?: string;
    /** Who is reading, for `can`; none reads as nobody may act. */
    viewer?: SessionLike & { user: { id: string } };
  } = {},
): Promise<ShiftRecordView | null> {
  const now = options.now ?? new Date();
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const shift = await prisma.retailShift.findFirst({
    where: { id, companyId, ...(options.cashierId ? { cashierId: options.cashierId } : {}) },
    include: { closedBy: { select: { name: true } }, signedOffBy: { select: { name: true } } },
  });
  if (!shift) return null;

  const [site, sales, movements, noSaleOpens, settings] = await Promise.all([
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
    prisma.platformAuditEvent.count({
      where: { companyId, eventType: RETAIL_AUDIT_EVENTS.drawerOpened, payloadJson: { contains: `"shiftId":"${shift.id}"` } },
    }),
    loadPaymentSettings(companyId),
  ]);

  const cashSales = sumMoney(
    sales.map((sale) =>
      getCashNetFromPayments(
        sale.payments,
        money(sale.changeAmount).div(money(sale.exchangeRate).isZero() ? 1 : money(sale.exchangeRate)),
      ),
    ),
  );
  const movementNet = sumCashMovementDeltas(movements);
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

  const end = shift.closedAt ?? now;
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
    openingFloatZig: toNumberOrZero(shift.openingFloatZig),
    takings: toNumberOrZero(sumMoney(sales.map((sale) => sale.baseAmount))),
    saleCount: sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED").length,
    refundCount: sales.filter((sale) => sale.saleType === "REFUND").length,
    voidCount: sales.filter((sale) => sale.saleType === "VOID" || (sale.saleType === "SALE" && sale.status !== "POSTED")).length,
    cashSales: toNumberOrZero(cashSales),
    cashMovementNet: toNumberOrZero(movementNet),
    movements: {
      count: movements.length,
      drops: drops.length,
      dropTotal: toNumberOrZero(sumMoney(drops.map((drop) => money(drop.baseAmount).abs()))),
      lastDropAt: drops.length ? drops[drops.length - 1]!.createdAt.toISOString() : null,
    },
    expectedCash: options.viewer && countsBlind(shift, options.viewer) ? null : toNumberOrZero(shift.expectedCash),
    countedCash: shift.countedCash === null ? null : toNumberOrZero(shift.countedCash),
    variance,
    close:
      status === "CLOSED"
        ? {
            byName: shift.closedBy?.name ?? null,
            note: shift.closeNote,
            floatLeft: shift.floatLeft === null ? null : toNumberOrZero(shift.floatLeft),
            toSafe: shift.toSafe === null ? null : toNumberOrZero(shift.toSafe),
          }
        : null,
    signOff: shift.signOffOutcome
      ? {
          outcome: shift.signOffOutcome,
          by: shift.signedOffBy?.name ?? null,
          at: shift.signedOffAt?.toISOString() ?? null,
          note: shift.signOffNote,
          recover: shift.recoverAmount === null ? null : toNumberOrZero(shift.recoverAmount),
        }
      : null,
    needsSignOff: needsSignOff(shift),
    tenders: [...tenders.entries()]
      .map(([tender, entry]) => ({ tender, label: tenderLabel(tender), amount: cents(entry.amount), sales: entry.sales.size }))
      .sort((a, b) => b.amount - a.amount),
    takingsOverTime: takingsOverTime(
      shift.openedAt,
      end,
      sales.map((sale) => ({ at: sale.postedAt ?? sale.createdAt, amount: toNumberOrZero(sale.baseAmount) })),
      timeZone,
    ),
    lastCashSale: lastCash
      ? { saleNo: lastCash.saleNo, at: (lastCash.postedAt ?? lastCash.createdAt).toISOString() }
      : null,
    noSaleOpens,
    takesZig: settings.tenders.cashZig,
    can: {
      move:
        status === "OPEN" &&
        Boolean(options.viewer) &&
        (options.viewer!.user.id === shift.cashierId
          ? canRetailSessionDo(options.viewer!, "retail.sell", "create")
          : canRetailSessionDo(options.viewer!, "retail.cash-control", "update")),
      message: Boolean(options.viewer) && canRetailSessionDo(options.viewer!, "retail.people", "update"),
    },
  };
}
