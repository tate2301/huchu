import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { takingsWhere } from "@/lib/retail/floor/takings";
import { shopFiscalDevice } from "@/lib/retail/fiscalisation";
import { canRetailRoleDo } from "@/lib/retail/permission-matrix";
import { readsEveryCashier } from "@/lib/retail/own-rows";
import { tenderWord } from "@/lib/retail/words";
import { addDays, dayKey, DEFAULT_TIME_ZONE, formatTime } from "@/lib/workspace/format";

/**
 * A sale, or a refund document, as its record page reads it (50-floor,
 * SaleRecord board). A VOID document is never shown: its sale carries the
 * void. A cashier reads only the sales they rang; anyone else's is missing.
 */

export type SaleState = "SOLD" | "PART_REFUNDED" | "REFUNDED" | "VOIDED" | "REFUND";
export type FiscalState = "SIGNED" | "WAITING" | "FAILED" | "OFF";

export type SaleView = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND";
  state: SaleState;
  till: { id: string | null; name: string };
  cashier: { id: string | null; name: string };
  site: { id: string; name: string };
  /** Null: a walk-in, or a name typed at the till with no customer behind it (`customerName`). */
  customer: { id: string; name: string; phone: string | null } | null;
  customerName: string | null;
  priceList: string;
  postedAt: string;
  /** Money as "44.20" strings. */
  total: string;
  vat: string;
  /** The one VAT rate on the sale's taxed lines (15.5), or null for mixed or none. */
  vatRatePct: number | null;
  items: number;
  /** Null for roles that may not see cost. */
  margin: { value: string; onCostPct: number | null } | null;
  discount: string;
  discountLines: number;
  deposit: string;
  change: string;
  lines: Array<{
    id: string;
    name: string;
    quantity: number;
    price: string;
    discount: string;
    total: string;
    refundedQty: number;
    productId: string | null;
  }>;
  payments: Array<{
    id: string;
    tender: string;
    label: string;
    reference: string | null;
    currency: string;
    amount: string;
    baseAmount: string;
  }>;
  fiscal: { state: FiscalState; receipt: string | null; dayNo: number | null; signedAt: string | null; error: string | null };
  idCheckedAt: string | null;
  source: { id: string; saleNo: string } | null;
  refunds: Array<{ id: string; saleNo: string; total: string; postedAt: string }>;
  void: { reason: string | null; approvedBy: string | null; at: string } | null;
  refund: { reason: string | null; restocked: boolean; approvedBy: string | null } | null;
  review: { reason: string; reviewedAt: string | null } | null;
  hourly: {
    today: { labels: string[]; values: number[]; mark: number };
    week: { labels: string[]; values: number[]; mark: number };
  };
  can: { refund: boolean; void: boolean; voidableToday: boolean; update: boolean; send: boolean };
};

export type SaleViewer = { userId: string; role: string | null };

const SALE_INCLUDE = {
  lines: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" } },
  fiscalReceipt: { select: { status: true, receiptNumber: true, fiscalNumber: true, issuedAt: true, lastError: true, fiscalDay: { select: { fiscalDayNo: true } } } },
  register: { select: { id: true, name: true } },
  shift: { select: { registerName: true } },
  cashier: { select: { name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  site: { select: { id: true, name: true, openingHours: true } },
  sourceSale: { select: { id: true, saleNo: true } },
  reversals: {
    where: { status: "POSTED" },
    select: {
      id: true,
      saleNo: true,
      saleType: true,
      totalAmount: true,
      postedAt: true,
      createdAt: true,
      overrideReason: true,
      voidReason: true,
      approvedByName: true,
      lines: { select: { sourceLineId: true, quantity: true } },
    },
    orderBy: { postedAt: "asc" },
  },
} satisfies Prisma.RetailSaleInclude;

const ZONE = DEFAULT_TIME_ZONE;
const money = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0).toFixed(2);
const num = (value: Prisma.Decimal.Value | null | undefined) => new Prisma.Decimal(value ?? 0).toNumber();

/* ── Hours the site keeps ────────────────────────────────────────────────── */

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_HOURS = { open: 7, close: 19 };

function weekdayIndex(word: string): number | null {
  const at = WEEKDAYS.indexOf(word.slice(0, 3).toLowerCase() as (typeof WEEKDAYS)[number]);
  return at < 0 ? null : at;
}

/** Does a day spec ("Mon to Sat", "Sun", "Mon-Fri", "Daily") take this weekday? */
function daysTake(spec: string, weekday: number): boolean {
  const words = spec.trim();
  if (!words || /daily|every day|all week/i.test(words)) return true;
  const range = /^([a-z]+)\s*(?:to|-|–)\s*([a-z]+)$/i.exec(words);
  if (range) {
    const from = weekdayIndex(range[1]!);
    const to = weekdayIndex(range[2]!);
    if (from === null || to === null) return false;
    return from <= to ? weekday >= from && weekday <= to : weekday >= from || weekday <= to;
  }
  return words.split(/[,&/ ]+/).some((word) => weekdayIndex(word) === weekday);
}

/**
 * The hours a site opens on a weekday, from its hours as written ("Mon to Sat
 * 08:00 to 21:00, Sun 10:00 to 17:00"); 07:00 to 19:00 when they do not say.
 */
export function siteHours(openingHours: string | null | undefined, weekday: number): { open: number; close: number } {
  const segments = (openingHours ?? "").split(/[,;\n]/);
  let first: { open: number; close: number } | null = null;
  for (const segment of segments) {
    const match = /^(.*?)(\d{1,2}):(\d{2})\s*(?:to|-|–)\s*(\d{1,2}):(\d{2})/i.exec(segment.trim());
    if (!match) continue;
    const hours = { open: Number(match[2]), close: Number(match[4]) + (Number(match[5]) > 0 ? 1 : 0) };
    if (hours.close <= hours.open) continue;
    first ??= hours;
    if (daysTake(match[1]!, weekday)) return hours;
  }
  return first ?? DEFAULT_HOURS;
}

function hourIn(value: Date): number {
  return Number(formatTime(value, ZONE).slice(0, 2));
}

/** 0 = Sunday, in the shop's zone. */
function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, date!)).getUTCDay();
}

const WEEK_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * This till's takings by hour on the sale's day and by day over its week
 * (decision 10), the sale's own hour and day marked. Hours run over the
 * site's hours that day, widened to any hour that took money, and stop at
 * the current hour while the day is still going.
 */
async function hourlyTakings(input: {
  companyId: string;
  siteId: string;
  registerId: string | null;
  postedAt: Date;
  openingHours: string | null;
  now: Date;
}): Promise<SaleView["hourly"]> {
  const day = dayKey(input.postedAt, ZONE);
  const weekday = weekdayOf(day);
  const monday = addDays(day, -((weekday + 6) % 7));
  const weekStart = startOfDayIn(monday, ZONE);
  const weekEnd = startOfDayIn(addDays(monday, 7), ZONE);
  const till = input.registerId ? { registerId: input.registerId } : { siteId: input.siteId, registerId: null };
  const rows = await prisma.retailSale.findMany({
    where: { ...takingsWhere({ companyId: input.companyId, from: weekStart, to: weekEnd }), ...till },
    select: { postedAt: true, baseAmount: true },
  });

  const byHour = new Map<number, Prisma.Decimal>();
  const byDay = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    if (!row.postedAt) continue;
    const rowDay = dayKey(row.postedAt, ZONE);
    byDay.set(rowDay, (byDay.get(rowDay) ?? new Prisma.Decimal(0)).plus(row.baseAmount));
    if (rowDay !== day) continue;
    const hour = hourIn(row.postedAt);
    byHour.set(hour, (byHour.get(hour) ?? new Prisma.Decimal(0)).plus(row.baseAmount));
  }

  const hours = siteHours(input.openingHours, weekday);
  const saleHour = hourIn(input.postedAt);
  const took = [...byHour.keys()];
  const start = Math.min(hours.open, saleHour, ...took);
  let end = Math.max(hours.close - 1, saleHour, ...took);
  if (day === dayKey(input.now, ZONE)) end = Math.max(Math.min(end, hourIn(input.now)), saleHour, ...took);
  const todayLabels: string[] = [];
  const todayValues: number[] = [];
  for (let hour = start; hour <= end; hour += 1) {
    todayLabels.push(`${String(hour).padStart(2, "0")}:00`);
    todayValues.push(byHour.get(hour)?.toNumber() ?? 0);
  }

  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  return {
    today: { labels: todayLabels, values: todayValues, mark: saleHour - start },
    week: {
      labels: WEEK_LABELS,
      values: weekDays.map((each) => byDay.get(each)?.toNumber() ?? 0),
      mark: weekDays.indexOf(day),
    },
  };
}

/* ── The view ────────────────────────────────────────────────────────────── */

function fiscalOf(
  receipt: { status: string; receiptNumber: string | null; fiscalNumber: string | null; issuedAt: Date | null; lastError: string | null; fiscalDay: { fiscalDayNo: number } | null } | null,
  waitsSince: Date | null,
  deviceOn: boolean,
): SaleView["fiscal"] {
  const base = {
    receipt: receipt?.receiptNumber ?? receipt?.fiscalNumber ?? null,
    dayNo: receipt?.fiscalDay?.fiscalDayNo ?? null,
    signedAt: receipt?.issuedAt?.toISOString() ?? null,
    error: null as string | null,
  };
  if (receipt?.status === "SUCCESS") return { ...base, state: "SIGNED" };
  if (receipt?.status === "FAILED") return { ...base, state: "FAILED", error: receipt.lastError };
  if (receipt?.status === "PENDING" || waitsSince) return { ...base, state: "WAITING" };
  if (!receipt && !deviceOn) return { ...base, state: "OFF" };
  return { ...base, state: receipt ? "WAITING" : "OFF" };
}

/** The rate the taxed lines were charged at, to the half per cent ("15.5"), else null when nothing was taxed. */
function vatRate(lines: ReadonlyArray<{ lineTotal: Prisma.Decimal; taxAmount: Prisma.Decimal }>): number | null {
  let tax = new Prisma.Decimal(0);
  let net = new Prisma.Decimal(0);
  for (const line of lines) {
    const lineTax = new Prisma.Decimal(line.taxAmount).abs();
    if (lineTax.isZero()) continue;
    tax = tax.plus(lineTax);
    net = net.plus(new Prisma.Decimal(line.lineTotal).abs().minus(lineTax));
  }
  if (tax.isZero() || net.lte(0)) return null;
  return Math.round(tax.dividedBy(net).times(200).toNumber()) / 2;
}

export async function loadSaleView(
  companyId: string,
  id: string,
  viewer: SaleViewer,
  now: Date = new Date(),
): Promise<SaleView | null> {
  const sale = await prisma.retailSale.findFirst({ where: { id, companyId }, include: SALE_INCLUDE });
  if (!sale || sale.saleType === "VOID") return null;
  if (!readsEveryCashier(viewer.role) && sale.cashierId !== viewer.userId) return null;

  const postedAt = sale.postedAt ?? sale.createdAt;
  const refundDocs = sale.reversals.filter((reversal) => reversal.saleType === "REFUND");
  const voidDoc = sale.reversals.find((reversal) => reversal.saleType === "VOID") ?? null;

  const refunded = new Map<string, number>();
  for (const doc of refundDocs) {
    for (const line of doc.lines) {
      if (!line.sourceLineId) continue;
      refunded.set(line.sourceLineId, (refunded.get(line.sourceLineId) ?? 0) + Math.abs(num(line.quantity)));
    }
  }
  const lines = sale.lines.map((line) => ({
    id: line.id,
    name: line.itemName,
    quantity: num(line.quantity),
    price: money(line.unitPrice),
    discount: money(line.discountAmount),
    total: money(line.lineTotal),
    refundedQty: refunded.get(line.id) ?? 0,
    productId: line.productId,
  }));

  let state: SaleState;
  if (sale.saleType === "REFUND") state = "REFUND";
  else if (sale.status === "VOIDED") state = "VOIDED";
  else if (refundDocs.length === 0) state = "SOLD";
  else state = lines.every((line) => line.refundedQty >= Math.abs(line.quantity)) ? "REFUNDED" : "PART_REFUNDED";

  const seeCost = canRetailRoleDo(viewer.role, "retail.catalog", "view-cost");
  const cost = sale.lines.reduce((sum, line) => sum.plus(line.costTotal), new Prisma.Decimal(0));
  const netExVat = sale.lines.reduce((sum, line) => sum.plus(line.lineTotal).minus(line.taxAmount), new Prisma.Decimal(0));
  const marginValue = netExVat.minus(cost);
  const discounted = sale.lines.filter((line) => !new Prisma.Decimal(line.discountAmount).isZero());

  const [device, hourly] = await Promise.all([
    shopFiscalDevice(companyId),
    hourlyTakings({
      companyId,
      siteId: sale.siteId,
      registerId: sale.registerId,
      postedAt,
      openingHours: sale.site.openingHours,
      now,
    }),
  ]);

  const voidableToday =
    sale.saleType === "SALE" &&
    sale.status === "POSTED" &&
    sale.reversals.length === 0 &&
    dayKey(postedAt, ZONE) === dayKey(now, ZONE);
  const role = viewer.role;
  const own = sale.cashierId === viewer.userId;
  const update = canRetailRoleDo(role, "retail.sell", "update") && sale.status !== "VOIDED";

  return {
    id: sale.id,
    saleNo: sale.saleNo,
    saleType: sale.saleType === "REFUND" ? "REFUND" : "SALE",
    state,
    till: { id: sale.register?.id ?? null, name: sale.register?.name ?? sale.shift?.registerName ?? "Back office" },
    cashier: { id: sale.cashierId, name: sale.cashier?.name ?? sale.cashierName ?? "—" },
    site: { id: sale.site.id, name: sale.site.name },
    customer: sale.customer ? { id: sale.customer.id, name: sale.customer.name, phone: sale.customer.phone } : null,
    customerName: sale.customerName,
    priceList: "Retail",
    postedAt: postedAt.toISOString(),
    total: money(sale.totalAmount),
    vat: money(sale.taxAmount),
    vatRatePct: vatRate(sale.lines),
    items: sale.lines.reduce((sum, line) => sum + Math.abs(num(line.quantity)), 0),
    margin: seeCost
      ? {
          value: marginValue.toFixed(2),
          onCostPct: cost.isZero() ? null : Math.round(marginValue.dividedBy(cost).times(1000).toNumber()) / 10,
        }
      : null,
    discount: money(sale.discountAmount),
    discountLines: discounted.length,
    deposit: money(sale.depositAmount),
    change: money(sale.changeAmount),
    lines,
    payments: sale.payments.map((payment) => ({
      id: payment.id,
      tender: payment.tenderType,
      label: tenderWord(payment),
      reference: payment.reference,
      currency: payment.currency,
      amount: money(payment.amount),
      baseAmount: money(payment.baseAmount),
    })),
    fiscal: fiscalOf(sale.fiscalReceipt, sale.fiscalWaitsSince, Boolean(device?.isActive)),
    idCheckedAt: sale.idCheckedAt?.toISOString() ?? null,
    source: sale.sourceSale ? { id: sale.sourceSale.id, saleNo: sale.sourceSale.saleNo } : null,
    refunds: refundDocs.map((doc) => ({
      id: doc.id,
      saleNo: doc.saleNo,
      total: money(doc.totalAmount),
      postedAt: (doc.postedAt ?? doc.createdAt).toISOString(),
    })),
    void:
      sale.status === "VOIDED"
        ? {
            reason: voidDoc?.overrideReason ?? sale.voidReason,
            approvedBy: voidDoc?.approvedByName ?? sale.approvedByName,
            at: (voidDoc?.postedAt ?? sale.updatedAt).toISOString(),
          }
        : null,
    refund:
      sale.saleType === "REFUND"
        ? { reason: sale.overrideReason, restocked: sale.restocked, approvedBy: sale.approvedByName }
        : null,
    review: sale.reviewReason ? { reason: sale.reviewReason, reviewedAt: sale.reviewedAt?.toISOString() ?? null } : null,
    hourly,
    can: {
      refund: canRetailRoleDo(role, "retail.sell", "refund") && (state === "SOLD" || state === "PART_REFUNDED"),
      void: canRetailRoleDo(role, "retail.sell", "void") && voidableToday,
      voidableToday,
      update,
      send: readsEveryCashier(role) || own,
    },
  };
}
