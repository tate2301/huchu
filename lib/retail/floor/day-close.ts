import { Prisma, type RetailTenderType } from "@prisma/client";
import { z } from "zod";

import { errorResponse, fieldErrorResponse, successResponse } from "@/lib/api-response";
import { money, sumMoney, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { RETAIL_AUDIT_EVENTS, auditAmount, writeRetailAuditEvent, type RetailAuditActor } from "@/lib/retail/audit";
import { closeShopFiscalDay, loadFiscalSettings } from "@/lib/retail/fiscal-settings";
import { shopFiscalDevice } from "@/lib/retail/fiscalisation";
import { siteScopeOf } from "@/lib/retail/people/scope";
import { canRetailSessionDo, retailPermissionDenial } from "@/lib/retail/permission-matrix";
import { postedChange } from "@/lib/retail/sale-totals";
import { tenderLabel } from "@/lib/retail/words";
import { parseTradingDay, tradingDayAsDate, tradingDayKey, tradingDayWindow } from "@/lib/retail/z-report";
import { generateRetailZReportTransaction } from "@/lib/retail/z-report-generate";
import { needsSignOff } from "@/lib/reports/loaders/retail/floor";
import { formatMoney, formatTime } from "@/lib/workspace/format";
import { postRetailJournal } from "@/app/api/v2/retail/_helpers";

import { defaultSiteFor } from "./default-site";
import type { ShiftSession } from "./shifts";
import { sumTakings, takingsWhere } from "./takings";

/**
 * End of day (50-floor W-43, FLR-07; boards EndOfDay and DaysList).
 *
 * A site's trading day is the shifts opened at the site in the trading day's
 * window (`tradingDayWindow`, the Z-report's own rule: a drawer belongs to the
 * day it opened) and the back-office documents — sales, refunds and voids at
 * the site rung on no drawer, posted in the window. One function reads its
 * figures (`dayFigures`) for the page, the close and Past days.
 *
 * Closing the day happens once per site and day, in one transaction: every
 * till's Z-report taken, the figures frozen in `RetailDayClose`, the cash
 * banked written to the bank register; after the commit the vault-to-bank
 * journal posts and, when the fiscal day closes by hand and no drawer is open
 * at any site, the fiscal day closes with it.
 */

type Db = typeof prisma | Prisma.TransactionClient;

/* ── Words ─────────────────────────────────────────────────────────────── */

const LONG_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

const noon = (date: string) => new Date(`${date}T12:00:00.000Z`);
/** "Saturday 3 October". */
export const dayLabel = (date: string) => LONG_DAY.format(noon(date)).replace(",", "");
/** "Fri 2 Oct 2026", "Wed 30 Sep 2026". */
export function shortDayLabel(date: string): string {
  const day = noon(date);
  return `${WEEKDAYS[day.getUTCDay()]} ${day.getUTCDate()} ${MONTHS[day.getUTCMonth()]} ${day.getUTCFullYear()}`;
}
const dayMonth = (date: string) => DAY_MONTH.format(noon(date));

const usd = (value: Prisma.Decimal.Value) => formatMoney(toNumberOrZero(money(value)));
/** "ZiG 4,288", or "ZiG 4,288.50" with cents. */
export function zigWords(value: Prisma.Decimal.Value): string {
  const amount = toNumberOrZero(money(value));
  const text = formatMoney(amount, "ZWG");
  return Number.isInteger(amount) ? text.replace(/\.00$/, "") : text;
}
const andList = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export const PICK_A_DAY = "Pick a day up to today.";
export const BANKED_WORDS = "Write the amount banked, like 2610.00.";
export const NO_BANK = "Add a bank account in Posting to the books first.";
export const closedAlready = (date: string) => `${dayLabel(date)} is closed already.`;

/* ── The day's rows ────────────────────────────────────────────────────── */

const shiftSelect = {
  id: true,
  shiftNo: true,
  registerId: true,
  registerCode: true,
  registerName: true,
  cashierName: true,
  status: true,
  openedAt: true,
  closedAt: true,
  countedCash: true,
  variance: true,
  signOffOutcome: true,
} satisfies Prisma.RetailShiftSelect;

const saleSelect = {
  id: true,
  shiftId: true,
  saleType: true,
  baseAmount: true,
  totalAmount: true,
  depositAmount: true,
  tenderedAmount: true,
  changeAmount: true,
  changeZig: true,
  payments: { select: { tenderType: true, amount: true, baseAmount: true, currency: true } },
} satisfies Prisma.RetailSaleSelect;

export type DayShift = Prisma.RetailShiftGetPayload<{ select: typeof shiftSelect }>;
export type DaySale = Prisma.RetailSaleGetPayload<{ select: typeof saleSelect }>;

export async function loadDayRows(companyId: string, siteId: string, date: string, db: Db = prisma) {
  const { start, end } = tradingDayWindow(date);
  const shifts = await db.retailShift.findMany({
    where: { companyId, siteId, openedAt: { gte: start, lt: end } },
    select: shiftSelect,
    orderBy: [{ openedAt: "asc" }, { id: "asc" }],
  });
  const [onShifts, backOffice] = await Promise.all([
    shifts.length ? db.retailSale.findMany({ where: takingsWhere({ companyId, shiftIds: shifts.map((shift) => shift.id) }), select: saleSelect }) : [],
    db.retailSale.findMany({ where: { ...takingsWhere({ companyId, siteId, from: start, to: end }), shiftId: null }, select: saleSelect }),
  ]);
  return { shifts, sales: [...onShifts, ...backOffice] };
}

/* ── The figures ───────────────────────────────────────────────────────── */

export type TillRow = {
  key: string;
  name: string;
  /** The last shift's cashier; null on the back-office row. */
  cashier: string | null;
  registerCode: string | null;
  registerId: string | null;
  /** "open" while a shift is open on it; "none" for the back office. */
  state: "open" | "closed" | "none";
  closedAt: string | null;
  openShiftId: string | null;
  takings: string;
  refunds: string;
  /** Σ variance of its closed shifts; null while one is open, or nothing was counted. */
  difference: string | null;
};

export type PaidTile = { tender: string; label: string; currency: "USD" | "ZWG"; amount: string };

export type DayFigures = {
  tills: TillRow[];
  takings: string;
  refunds: string;
  cashDifference: string;
  cashUsd: string;
  cashZig: string;
  paid: PaidTile[];
};

/** The tiles' order: cash in dollars, cash in ZiG, then the other tenders. */
const TENDER_ORDER: RetailTenderType[] = ["ECOCASH", "CARD", "ON_ACCOUNT", "TRANSFER", "INNBUCKS", "VOUCHER"];

const isReversal = (saleType: string) => saleType === "REFUND" || saleType === "VOID";

/**
 * One site's day, added up: per till its takings, refunds and difference;
 * the day's takings (packet 50's definition), refunds as a magnitude, the
 * shifts' differences, the cash in each currency net of change, and how
 * people paid. A refund or void takes its tenders back.
 */
export function dayFigures(shifts: DayShift[], sales: DaySale[]): DayFigures {
  const byShift = new Map<string, DaySale[]>();
  const backOffice: DaySale[] = [];
  for (const sale of sales) {
    if (!sale.shiftId) backOffice.push(sale);
    else byShift.set(sale.shiftId, [...(byShift.get(sale.shiftId) ?? []), sale]);
  }
  const refundsOf = (rows: DaySale[]) => sumTakings(rows.filter((sale) => sale.saleType === "REFUND")).abs();

  const tills = new Map<string, DayShift[]>();
  for (const shift of shifts) tills.set(shift.registerId, [...(tills.get(shift.registerId) ?? []), shift]);

  const rows: TillRow[] = [...tills.entries()].map(([registerId, own]) => {
    const last = own[own.length - 1]!;
    const open = own.find((shift) => shift.status === "OPEN") ?? null;
    const own$ = own.flatMap((shift) => byShift.get(shift.id) ?? []);
    const counted = own.filter((shift) => shift.variance !== null);
    const lastClose = own.reduce<Date | null>((latest, shift) => (shift.closedAt && (!latest || shift.closedAt > latest) ? shift.closedAt : latest), null);
    return {
      key: registerId,
      name: last.registerName,
      cashier: last.cashierName,
      registerCode: last.registerCode,
      registerId,
      state: open ? "open" : "closed",
      closedAt: open || !lastClose ? null : lastClose.toISOString(),
      openShiftId: open?.id ?? null,
      takings: sumTakings(own$).toFixed(2),
      refunds: refundsOf(own$).toFixed(2),
      difference: open || counted.length === 0 ? null : sumMoney(counted.map((shift) => money(shift.variance!))).toFixed(2),
    };
  });
  if (backOffice.length) {
    rows.push({
      key: "back-office",
      name: "Back office",
      cashier: null,
      registerCode: null,
      registerId: null,
      state: "none",
      closedAt: null,
      openShiftId: null,
      takings: sumTakings(backOffice).toFixed(2),
      refunds: refundsOf(backOffice).toFixed(2),
      difference: null,
    });
  }

  let cashUsd = new Prisma.Decimal(0);
  let cashZig = new Prisma.Decimal(0);
  const tenders = new Map<RetailTenderType, Prisma.Decimal>();
  for (const sale of sales) {
    const sign = isReversal(sale.saleType) ? -1 : 1;
    const change = postedChange(sale);
    let usdIn = new Prisma.Decimal(0);
    let zigIn = new Prisma.Decimal(0);
    for (const payment of sale.payments) {
      if (payment.tenderType === "CASH") {
        if ((payment.currency ?? "USD").toUpperCase() === "ZWG") zigIn = zigIn.plus(money(payment.amount).abs());
        else usdIn = usdIn.plus(money(payment.amount).abs());
      } else {
        tenders.set(payment.tenderType, (tenders.get(payment.tenderType) ?? new Prisma.Decimal(0)).plus(money(payment.baseAmount).abs().times(sign)));
      }
    }
    cashUsd = cashUsd.plus(usdIn.minus(change.usd).times(sign));
    cashZig = cashZig.plus(zigIn.minus(money(sale.changeZig).abs()).times(sign));
  }

  const paid: PaidTile[] = [
    { tender: "CASH_USD", label: "Cash, US$", currency: "USD" as const, amount: cashUsd },
    { tender: "CASH_ZWG", label: "Cash, ZiG", currency: "ZWG" as const, amount: cashZig },
    ...TENDER_ORDER.map((tender) => ({ tender, label: tenderLabel(tender), currency: "USD" as const, amount: tenders.get(tender) ?? new Prisma.Decimal(0) })),
  ]
    .filter((tile) => !tile.amount.isZero())
    .map((tile) => ({ ...tile, amount: tile.amount.toFixed(2) }));

  return {
    tills: rows,
    takings: sumTakings(sales).toFixed(2),
    refunds: refundsOf(sales).toFixed(2),
    cashDifference: sumMoney(shifts.filter((shift) => shift.status !== "OPEN").map((shift) => money(shift.variance ?? 0))).toFixed(2),
    cashUsd: cashUsd.toFixed(2),
    cashZig: cashZig.toFixed(2),
    paid,
  };
}

/* ── The checklist ─────────────────────────────────────────────────────── */

export type CheckItem = {
  key: "shifts" | "signoff" | "fiscal" | "banked";
  label: string;
  detail: string;
  done: boolean;
  blocking: boolean;
  action: { label: string; href: string } | null;
};

const tillOf = (shift: DayShift) => shift.registerName;

/** "Back till is US$4.50 short.", "… over.", "… not counted." */
function differenceWords(shift: DayShift): string {
  if (shift.variance === null || shift.countedCash === null) return `${tillOf(shift)} was not counted.`;
  const variance = money(shift.variance);
  return `${tillOf(shift)} is ${usd(variance.abs())} ${variance.isNegative() ? "short" : "over"}.`;
}

export function shiftsCheck(shifts: DayShift[]): CheckItem {
  const open = shifts.filter((shift) => shift.status === "OPEN");
  const closed = shifts.length - open.length;
  const names = [...new Set(open.map(tillOf))];
  return {
    key: "shifts",
    label: "All shifts closed",
    detail: open.length
      ? `${closed} of ${shifts.length}. ${andList(names)} ${names.length === 1 ? "is" : "are"} still open.`
      : `${shifts.length} of ${shifts.length}.`,
    done: open.length === 0,
    blocking: true,
    action: open[0] ? { label: "Close it", href: `/retail/shifts/${open[0].id}/close` } : null,
  };
}

export function signOffCheck(shifts: DayShift[]): CheckItem {
  const closed = shifts.filter((shift) => shift.status === "CLOSED");
  const differing = closed.filter((shift) => shift.variance === null || shift.countedCash === null || !money(shift.variance).isZero());
  const waiting = closed.filter((shift) => needsSignOff(shift));
  const detail = waiting.length
    ? waiting.length === 1
      ? differenceWords(waiting[0]!)
      : `${waiting.length} drawers to sign off.`
    : differing.length === 0
      ? "Nothing to sign off."
      : `All ${differing.length} signed off.`;
  return {
    key: "signoff",
    label: "Drawer differences signed off",
    detail,
    done: waiting.length === 0,
    blocking: true,
    // 98-decisions FLR-05: every link to the sheet carries the shift's id twice.
    action: waiting[0] ? { label: "Sign off", href: `/retail/shifts/${waiting[0].id}?sheet=sign-off&id=${waiting[0].id}` } : null,
  };
}

type FiscalDayFacts = { id: string; fiscalDayNo: number; status: string; closedAt: Date | null };

function fiscalCheck(day: FiscalDayFacts, dayClose: "WITH_LAST_SHIFT" | "BY_HAND"): CheckItem {
  const done = day.status === "CLOSED";
  return {
    key: "fiscal",
    label: `Fiscal day ${day.fiscalDayNo} closed`,
    detail: done
      ? `Closed at ${day.closedAt ? formatTime(day.closedAt) : "—"}. ZIMRA has the Z-report.`
      : day.status === "CLOSING"
        ? "Its Z-report is on its way to ZIMRA."
        : dayClose === "BY_HAND"
          ? "Closes when you close the day."
          : "Closes with the last shift and sends the Z-report to ZIMRA.",
    done,
    blocking: false,
    action: null,
  };
}

/**
 * The shop device's fiscal day the day's receipts were signed into (the
 * latest when several); a closed day's own; today with no receipt yet, the
 * day the tills sign into. Null with no fiscal device.
 */
async function fiscalDayFor(companyId: string, date: string, saleIds: string[], frozenNo: number | null, db: Db = prisma): Promise<FiscalDayFacts | null> {
  const device = await shopFiscalDevice(companyId, db);
  if (!device) return null;
  const select = { id: true, fiscalDayNo: true, status: true, closedAt: true } as const;
  if (frozenNo !== null) return db.fiscalDay.findFirst({ where: { companyId, providerConfigId: device.id, fiscalDayNo: frozenNo }, select });
  const signed = saleIds.length
    ? await db.fiscalReceipt.findMany({ where: { companyId, retailSaleId: { in: saleIds }, fiscalDayId: { not: null } }, select: { fiscalDayId: true }, distinct: ["fiscalDayId"] })
    : [];
  if (signed.length) {
    return db.fiscalDay.findFirst({
      where: { companyId, id: { in: signed.map((row) => row.fiscalDayId!) } },
      orderBy: { fiscalDayNo: "desc" },
      select,
    });
  }
  if (date !== tradingDayKey(new Date())) return null;
  return db.fiscalDay.findFirst({ where: { companyId, providerConfigId: device.id, status: { not: "CLOSED" } }, orderBy: { fiscalDayNo: "desc" }, select });
}

/* ── The page ──────────────────────────────────────────────────────────── */

export type EndOfDayView = {
  site: { id: string; name: string };
  sites: Array<{ id: string; name: string }>;
  date: string;
  today: string;
  dateLabel: string;
  closed: {
    at: string;
    by: string;
    banked: string;
    slipUrl: string | null;
    zReports: Array<{ id: string; reportNo: string; registerCode: string; registerName: string }>;
  } | null;
  /** Anything sold or any drawer opened that day. */
  traded: boolean;
  takings: string;
  tills: TillRow[];
  totals: { tills: number; takings: string; refunds: string; difference: string };
  paid: PaidTile[];
  checklist: CheckItem[];
  thingsLeft: number;
  banked: { default: string; account: string | null; bank: string | null };
  can: { close: boolean };
};

/** A refusal in the page's words: the status, the sentence, and the field it belongs under. */
export class DayRefused extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    message: string,
    readonly field?: "banked",
  ) {
    super(message);
    this.name = "DayRefused";
  }
}

/** `YYYY-MM-DD` up to today, or the refusal. */
export function checkDay(value: string | null | undefined, today: string = tradingDayKey(new Date())): string {
  let date: string;
  try {
    date = parseTradingDay(value ?? "");
  } catch {
    throw new DayRefused(400, PICK_A_DAY);
  }
  if (date > today) throw new DayRefused(400, PICK_A_DAY);
  return date;
}

/** The sites this person works at, open ones, by name. */
async function sitesFor(companyId: string, userId: string) {
  const scope = await siteScopeOf(companyId, userId);
  return prisma.site.findMany({
    where: { companyId, isActive: true, ...(scope.all ? {} : { id: { in: scope.ids } }) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

async function siteFor(actor: ShiftSession, siteId: string | null | undefined) {
  const companyId = actor.user.companyId;
  const sites = await sitesFor(companyId, actor.user.id);
  const id = siteId || (await defaultSiteFor(companyId, actor.user.id));
  const site = sites.find((entry) => entry.id === id) ?? (siteId ? null : sites[0]);
  if (!site) throw new DayRefused(404, "Site not found");
  return { site, sites };
}

async function defaultBank(companyId: string, db: Db = prisma) {
  const settings = await db.accountingSettings.findUnique({
    where: { companyId },
    select: { defaultBankAccount: { select: { id: true, name: true, bankName: true, isActive: true } } },
  });
  const account = settings?.defaultBankAccount;
  return account?.isActive ? account : null;
}

const bankShort = (account: { name: string; bankName: string | null } | null) => account?.bankName?.trim() || account?.name || null;

export async function endOfDayView(actor: ShiftSession, input: { siteId?: string | null; date?: string | null }): Promise<EndOfDayView> {
  const denied = retailPermissionDenial(actor, "retail.end-of-day", "view");
  if (denied) throw new DayRefused(403, denied);
  const companyId = actor.user.companyId;
  const today = tradingDayKey(new Date());
  const date = input.date ? checkDay(input.date, today) : today;
  const { site, sites } = await siteFor(actor, input.siteId);

  const [{ shifts, sales }, frozen, account, settings] = await Promise.all([
    loadDayRows(companyId, site.id, date),
    prisma.retailDayClose.findUnique({ where: { companyId_siteId_businessDate: { companyId, siteId: site.id, businessDate: tradingDayAsDate(date) } } }),
    defaultBank(companyId),
    loadFiscalSettings(companyId),
  ]);
  const live = dayFigures(shifts, sales);
  const zReports = frozen?.zReportIds.length
    ? await prisma.retailZReport.findMany({
        where: { companyId, id: { in: frozen.zReportIds } },
        select: { id: true, reportNo: true, registerCode: true, registerName: true },
        orderBy: { registerName: "asc" },
      })
    : [];
  const fiscal = await fiscalDayFor(companyId, date, sales.map((sale) => sale.id), frozen ? frozen.fiscalDayNo : null);

  const tenders = frozen ? (frozen.tenders as unknown as PaidTile[]) : live.paid;
  const bank = bankShort(account);
  const checklist: CheckItem[] = [shiftsCheck(shifts), signOffCheck(shifts)];
  if (fiscal) checklist.push(fiscalCheck(fiscal, settings.dayClose));
  const banked = frozen ? money(frozen.banked) : null;
  const frozenBank = frozen?.bankAccountId ? await prisma.bankAccount.findUnique({ where: { id: frozen.bankAccountId }, select: { name: true, bankName: true } }) : null;
  checklist.push({
    key: "banked",
    label: "Cash banked",
    detail: frozen
      ? banked!.isZero()
        ? "Nothing banked."
        : `${usd(banked!)} to ${bankShort(frozenBank) ?? "the bank"}${frozen.slipUrl ? ", slip photo." : "."}`
      : bank
        ? `${usd(live.cashUsd)} to ${bank}. No slip yet.`
        : NO_BANK,
    done: Boolean(frozen && !banked!.isZero()),
    blocking: false,
    action: null,
  });

  const traded = shifts.length > 0 || live.tills.length > 0;
  const thingsLeft = frozen ? 0 : checklist.filter((item) => item.blocking && !item.done).length;
  return {
    site,
    sites,
    date,
    today,
    dateLabel: dayLabel(date),
    closed: frozen
      ? {
          at: frozen.closedAt.toISOString(),
          by: frozen.closedByName,
          banked: money(frozen.banked).toFixed(2),
          slipUrl: frozen.slipUrl,
          zReports,
        }
      : null,
    traded,
    takings: frozen ? money(frozen.takings).toFixed(2) : live.takings,
    tills: live.tills,
    totals: {
      tills: live.tills.filter((row) => row.state !== "none").length,
      takings: frozen ? money(frozen.takings).toFixed(2) : live.takings,
      refunds: frozen ? money(frozen.refunds).toFixed(2) : live.refunds,
      difference: frozen ? money(frozen.cashDifference).toFixed(2) : live.cashDifference,
    },
    paid: tenders,
    checklist,
    thingsLeft,
    banked: { default: live.cashUsd, account: account?.name ?? null, bank },
    can: { close: !frozen && traded && canRetailSessionDo(actor, "retail.end-of-day", "create") },
  };
}

/* ── Closing the day ───────────────────────────────────────────────────── */

export const closeDayInput = z.object({
  siteId: z.string().uuid(),
  date: z.string(),
  banked: z.string(),
  slipUrl: z.string().url().optional(),
});

export type CloseDayInput = z.infer<typeof closeDayInput>;

export type CloseDayResult = { closedAt: string; zReports: Array<{ id: string; reportNo: string; registerName: string }> };

const isUnique = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

export async function closeDay(actor: ShiftSession, input: CloseDayInput, options: { now?: Date } = {}): Promise<CloseDayResult> {
  const denied = retailPermissionDenial(actor, "retail.end-of-day", "create");
  if (denied) throw new DayRefused(403, denied);
  const companyId = actor.user.companyId;
  const closedAt = options.now ?? new Date();
  const date = checkDay(input.date, tradingDayKey(closedAt));
  const { site } = await siteFor(actor, input.siteId);
  const typed = input.banked.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(typed)) throw new DayRefused(400, BANKED_WORDS, "banked");
  const banked = money(typed);
  const account = banked.isZero() ? null : await defaultBank(companyId);
  if (!banked.isZero() && !account) throw new DayRefused(400, NO_BANK);

  const actorName = actor.user.name || actor.user.email || "Manager";
  const auditActor: RetailAuditActor = { companyId, userId: actor.user.id, userName: actorName, userRole: actor.user.role ?? null };
  const label = dayLabel(date);

  let result: { id: string; fiscalDayNo: number | null; zReports: CloseDayResult["zReports"] };
  try {
    result = await prisma.$transaction(
      async (tx) => {
        const businessDate = tradingDayAsDate(date);
        const already = await tx.retailDayClose.findUnique({ where: { companyId_siteId_businessDate: { companyId, siteId: site.id, businessDate } }, select: { id: true } });
        if (already) throw new DayRefused(409, closedAlready(date));
        const { shifts, sales } = await loadDayRows(companyId, site.id, date, tx);
        if (shifts.length === 0 && sales.length === 0) throw new DayRefused(409, `Nothing was sold at ${site.name} on ${label}.`);
        const open = shifts.find((shift) => shift.status === "OPEN");
        if (open) throw new DayRefused(409, `${open.registerName} is still open. Close it first.`);
        const waiting = shifts.find((shift) => needsSignOff(shift));
        if (waiting) {
          const what = waiting.variance === null || waiting.countedCash === null ? "uncounted drawer" : usd(money(waiting.variance).abs());
          throw new DayRefused(409, `${waiting.registerName}’s ${what} is not signed off yet.`);
        }

        const figures = dayFigures(shifts, sales);
        const reports: CloseDayResult["zReports"] = [];
        for (const registerCode of [...new Set(shifts.map((shift) => shift.registerCode))]) {
          const { report } = await generateRetailZReportTransaction(
            { actor: { companyId, userId: actor.user.id, userName: actorName, userEmail: actor.user.email ?? null }, registerCode, businessDate: date },
            tx,
          );
          reports.push({ id: report.id, reportNo: report.reportNo, registerName: report.registerName });
        }
        const fiscal = await fiscalDayFor(companyId, date, sales.map((sale) => sale.id), null, tx);

        const close = await tx.retailDayClose.create({
          data: {
            companyId,
            siteId: site.id,
            businessDate,
            takings: figures.takings,
            refunds: figures.refunds,
            cashDifference: figures.cashDifference,
            cashUsd: figures.cashUsd,
            cashZig: figures.cashZig,
            tenders: figures.paid,
            banked,
            bankAccountId: account?.id ?? null,
            slipUrl: input.slipUrl ?? null,
            fiscalDayNo: fiscal?.fiscalDayNo ?? null,
            zReportIds: reports.map((report) => report.id),
            closedAt,
            closedById: actor.user.id,
            closedByName: actorName,
          },
          select: { id: true },
        });
        if (account) {
          // The bank register is what reconciliation matches the deposit against. `amount` is a Float column:
          // the exact two-decimal value goes in.
          await tx.bankTransaction.create({
            data: {
              companyId,
              bankAccountId: account.id,
              txnDate: closedAt,
              description: `Takings banked, ${site.name}, ${dayMonth(date)}`,
              reference: close.id,
              amount: Number(banked.toFixed(2)),
              direction: "DEBIT",
              sourceType: "RETAIL_DAY_BANKED",
              sourceId: close.id,
            },
          });
        }
        await writeRetailAuditEvent(tx, {
          actor: auditActor,
          eventType: RETAIL_AUDIT_EVENTS.dayClosed,
          entityType: "RetailDayClose",
          entityId: close.id,
          payload: { siteId: site.id, businessDate: date, takings: auditAmount(figures.takings), banked: auditAmount(banked) },
        });
        return { id: close.id, fiscalDayNo: fiscal?.status === "OPENED" ? fiscal.fiscalDayNo : null, zReports: reports };
      },
      { timeout: 30_000 },
    );
  } catch (error) {
    // A second close racing this one: the day's unique (or a till's Z-report) refused it.
    if (isUnique(error)) throw new DayRefused(409, closedAlready(date));
    throw error;
  }

  // Σ banked moves from the vault to the bank in the books. Posted after the commit, as the shifts' journals are.
  if (!banked.isZero()) {
    const value = toNumberOrZero(banked);
    await postRetailJournal({
      companyId,
      sourceType: "RETAIL_DAY_BANKED",
      sourceId: result.id,
      siteId: site.id,
      entryDate: closedAt,
      createdById: actor.user.id,
      actorRole: actor.user.role ?? undefined,
      description: `Retail day banked ${site.name} ${date}`,
      amount: value,
      netAmount: value,
      grossAmount: value,
      taxAmount: 0,
    });
  }

  // By hand, the fiscal day closes with the shop's day — only once no drawer is open at any site, since one
  // fiscal device serves the company (SET-08). A refusal from ZIMRA leaves the fiscal day as SET-08 decides;
  // the day's close stands.
  if (result.fiscalDayNo !== null) {
    try {
      const settings = await loadFiscalSettings(companyId);
      const openAnywhere = await prisma.retailShift.count({ where: { companyId, status: "OPEN" } });
      if (settings.dayClose === "BY_HAND" && openAnywhere === 0) {
        const day = await fiscalDayFor(companyId, date, [], result.fiscalDayNo);
        if (day && day.status === "OPENED") await closeShopFiscalDay(auditActor, day.id, "HAND");
      }
    } catch (error) {
      console.error("[retail] closing the fiscal day with the shop's day failed:", error);
    }
  }

  return { closedAt: closedAt.toISOString(), zReports: result.zReports };
}

/* ── Answers ───────────────────────────────────────────────────────────── */

/** A refusal as the page reads it: the sentence, and `fieldErrors.banked` for the amount. */
export function dayRefusalResponse(error: DayRefused) {
  return error.field ? fieldErrorResponse(error.message, { [error.field]: error.message }, error.status) : errorResponse(error.message, error.status);
}

/** `POST /api/v2/retail/end-of-day/close`. */
export async function answerCloseDay(input: { session: ShiftSession; body: unknown }) {
  const denied = retailPermissionDenial(input.session, "retail.end-of-day", "create");
  if (denied) return errorResponse(denied, 403);
  const parsed = closeDayInput.safeParse(input.body ?? {});
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    if (field === "banked") return fieldErrorResponse(BANKED_WORDS, { banked: BANKED_WORDS });
    if (field === "date") return errorResponse(PICK_A_DAY, 400);
    if (field === "slipUrl") return fieldErrorResponse("Add the slip again.", { slip: "Add the slip again." });
    return errorResponse("Pick a site.", 400);
  }
  try {
    return successResponse({ data: await closeDay(input.session, parsed.data) });
  } catch (error) {
    if (error instanceof DayRefused) return dayRefusalResponse(error);
    throw error;
  }
}
