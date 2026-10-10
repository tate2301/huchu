import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { FLOOR_REPORTS } from "@/lib/reports/definitions/retail/floor";
import { loaderParams, periodInstants, runList, startOfDayIn } from "@/lib/reports/list-query";
import { num, result, TAKE } from "@/lib/reports/loaders/shared";
import type {
  ListPageResult,
  ReportContext,
  ReportLoader,
  ReportOption,
  ReportParams,
  ReportRow,
  ResolvedListQuery,
} from "@/lib/reports/types";
import { paidWithLabel, tenderWord } from "@/lib/retail/words";
import { addDays, dayKey, DEFAULT_TIME_ZONE, formatShortDay, formatTime, todayIn } from "@/lib/workspace/format";

/**
 * Sales (50-floor, `retail-sales`): every sale and refund the tills rang.
 *
 * A shop rings thousands a month, so the list pages in the database: one
 * query for the page, one for the count and the totals over every filtered
 * row — never the page added up — and one for the tab sizes, which ignore
 * search and filters. VOID documents never list: the sale they cancel shows
 * as Voided, and the totals leave its money out. A grouped list runs through
 * the in-memory engine over at most 5,000 rows, its totals the same rule
 * (`totalOf: "counted"`).
 */

const LIST = FLOOR_REPORTS.find((source) => source.key === "retail-sales")!.list!;
const ZONE = DEFAULT_TIME_ZONE;

/** The tender (and, for cash, the currency) each "Paid with" choice stands for. */
const PAID_WITH_SQL: Record<string, Prisma.Sql> = {
  cash: Prisma.sql`p."tenderType" = 'CASH' AND upper(p.currency) <> 'ZWG'`,
  zig: Prisma.sql`p."tenderType" = 'CASH' AND upper(p.currency) = 'ZWG'`,
  ecocash: Prisma.sql`p."tenderType" = 'ECOCASH'`,
  card: Prisma.sql`p."tenderType" = 'CARD'`,
  transfer: Prisma.sql`p."tenderType" = 'TRANSFER'`,
  innbucks: Prisma.sql`p."tenderType" = 'INNBUCKS'`,
  "on-account": Prisma.sql`p."tenderType" = 'ON_ACCOUNT'`,
  voucher: Prisma.sql`p."tenderType" = 'VOUCHER'`,
};

const FROM = Prisma.sql`
  FROM "RetailSale" s
  LEFT JOIN "RetailRegister" r ON r.id = s."registerId"
  LEFT JOIN "RetailShift" sh ON sh.id = s."shiftId"
  LEFT JOIN "User" u ON u.id = s."cashierId"
  LEFT JOIN "Customer" c ON c.id = s."customerId"
  LEFT JOIN "FiscalReceipt" f ON f."retailSaleId" = s.id`;

type Scope = { companyId: string; cashierId: string | null; shiftId: string | null; bundleId: string | null };

/** The rows a caller may see at all: this company's sales and refunds, a cashier's own, a shift's when opened from one. */
function scopeOf(ctx: ReportContext, filters: Record<string, string>): Scope {
  const own = LIST.scopeOwn && LIST.scopeOwn.roles.includes(ctx.role) ? ctx.userId : null;
  return { companyId: ctx.companyId, cashierId: own, shiftId: filters.shift || null, bundleId: filters.bundle || null };
}

function scopeSql(scope: Scope): Prisma.Sql[] {
  const parts = [Prisma.sql`s."companyId" = ${scope.companyId}`, Prisma.sql`s."saleType" IN ('SALE', 'REFUND')`];
  if (scope.cashierId) parts.push(Prisma.sql`s."cashierId" = ${scope.cashierId}`);
  if (scope.shiftId) parts.push(Prisma.sql`s."shiftId" = ${scope.shiftId}`);
  // "Every sale of it" from a bundle's record (PRD-08): the sales with a line sold under it.
  if (scope.bundleId) {
    parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "RetailSaleLine" bl WHERE bl."saleId" = s.id AND bl."bundleId" = ${scope.bundleId})`);
  }
  return parts;
}

function todayRange(now: Date) {
  const today = todayIn(ZONE, now);
  return { from: startOfDayIn(today, ZONE), to: startOfDayIn(addDays(today, 1), ZONE) };
}

function tabSql(tab: string | null, now: Date): Prisma.Sql | null {
  if (tab === "today") {
    const { from, to } = todayRange(now);
    return Prisma.sql`s."postedAt" >= ${from} AND s."postedAt" < ${to}`;
  }
  if (tab === "refunds") return Prisma.sql`s."saleType" = 'REFUND'`;
  if (tab === "voids") return Prisma.sql`s."saleType" = 'SALE' AND s.status = 'VOIDED'`;
  return null;
}

type Filters = Record<string, string>;

function filterSql(filters: Filters, q: string, now: Date): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  const on = (key: string) => filters[key] && filters[key] !== "any";
  if (on("till")) parts.push(Prisma.sql`s."registerId" = ${filters.till}`);
  if (on("cashier")) parts.push(Prisma.sql`s."cashierId" = ${filters.cashier}`);
  if (on("site")) parts.push(Prisma.sql`s."siteId" = ${filters.site}`);
  if (on("flagged")) parts.push(Prisma.sql`s."reviewReason" IS NOT NULL AND s."reviewedAt" IS NULL`);
  const paid = on("paidWith") ? PAID_WITH_SQL[filters.paidWith!] : undefined;
  if (paid) parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "RetailSalePayment" p WHERE p."saleId" = s.id AND ${paid})`);
  const range = on("when") ? periodInstants(filters.when!, now, ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`s."postedAt" >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`s."postedAt" < ${range.lt}`);
  const text = q.trim();
  if (text) {
    const like = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    parts.push(Prisma.sql`(
      s."saleNo" ILIKE ${like}
      OR f."receiptNumber" ILIKE ${like}
      OR coalesce(c.name, s."customerName") ILIKE ${like}
      OR EXISTS (SELECT 1 FROM "RetailSaleLine" l WHERE l."saleId" = s.id AND l."itemName" ILIKE ${like})
    )`);
  }
  return parts;
}

const where = (parts: Prisma.Sql[]) => Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;

function orderFor(sort: string): Prisma.Sql {
  if (sort === "oldest") return Prisma.sql`ORDER BY s."postedAt" ASC NULLS FIRST, s.id ASC`;
  if (sort === "biggest") return Prisma.sql`ORDER BY abs(s."baseAmount") DESC, s."postedAt" DESC NULLS LAST, s.id DESC`;
  return Prisma.sql`ORDER BY s."postedAt" DESC NULLS LAST, s.id DESC`;
}

type SaleRow = {
  id: string;
  saleNo: string;
  saleType: "SALE" | "REFUND";
  status: string;
  postedAt: Date | null;
  createdAt: Date;
  registerId: string | null;
  till: string | null;
  cashierId: string | null;
  cashier: string | null;
  customerId: string | null;
  customerLinked: string | null;
  customerPhone: string | null;
  customerName: string | null;
  baseAmount: Prisma.Decimal;
  siteId: string;
  shiftId: string | null;
  flagged: boolean;
  receiptNo: string | null;
  items: Prisma.Decimal | null;
  tenders: string[] | null;
  refunded: boolean;
  fullyRefunded: boolean;
  itemNames: string | null;
};

async function selectRows(whereSql: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0, names = false): Promise<SaleRow[]> {
  return prisma.$queryRaw<SaleRow[]>`
    SELECT s.id, s."saleNo", s."saleType"::text AS "saleType", s.status::text AS status, s."postedAt", s."createdAt",
           s."registerId", coalesce(r.name, sh."registerName") AS till,
           s."cashierId", coalesce(u.name, s."cashierName") AS cashier,
           s."customerId", c.name AS "customerLinked", c.phone AS "customerPhone", s."customerName",
           s."baseAmount", s."siteId", s."shiftId",
           (s."reviewReason" IS NOT NULL AND s."reviewedAt" IS NULL) AS flagged,
           f."receiptNumber" AS "receiptNo",
           (SELECT sum(abs(l.quantity)) FROM "RetailSaleLine" l WHERE l."saleId" = s.id) AS items,
           (SELECT array_agg(p."tenderType"::text || ':' || p.currency ORDER BY p."createdAt")
              FROM "RetailSalePayment" p WHERE p."saleId" = s.id) AS tenders,
           EXISTS (SELECT 1 FROM "RetailSale" x WHERE x."sourceSaleId" = s.id AND x."saleType" = 'REFUND' AND x.status = 'POSTED') AS refunded,
           NOT EXISTS (
             SELECT 1 FROM "RetailSaleLine" l WHERE l."saleId" = s.id AND abs(l.quantity) > coalesce((
               SELECT sum(abs(rl.quantity)) FROM "RetailSaleLine" rl JOIN "RetailSale" rs ON rs.id = rl."saleId"
               WHERE rl."sourceLineId" = l.id AND rs."saleType" = 'REFUND' AND rs.status = 'POSTED'), 0)
           ) AS "fullyRefunded",
           ${names ? Prisma.sql`(SELECT string_agg(l."itemName", ' · ') FROM "RetailSaleLine" l WHERE l."saleId" = s.id)` : Prisma.sql`NULL`} AS "itemNames"
    ${FROM}
    ${whereSql}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

function stateOf(row: SaleRow): string {
  if (row.saleType === "SALE" && row.status === "VOIDED") return "Voided";
  if (row.flagged) return "To look at";
  if (row.saleType === "REFUND") return "Refund";
  if (row.refunded) return row.fullyRefunded ? "Refunded" : "Part refunded";
  return "Sold";
}

export function toSaleRow(row: SaleRow, now: Date): ReportRow {
  const at = row.postedAt ?? row.createdAt;
  const today = dayKey(at, ZONE) === todayIn(ZONE, now);
  const payments = (row.tenders ?? []).map((entry) => {
    const [tenderType, currency] = entry.split(":");
    return { tenderType: tenderType!, currency: currency ?? null };
  });
  const voided = row.saleType === "SALE" && row.status === "VOIDED";
  const total = Math.round((num(row.baseAmount) ?? 0) * 100) / 100;
  const walkIn = !row.customerLinked && !row.customerName?.trim();
  return {
    id: row.id,
    saleNo: row.saleNo,
    saleType: row.saleType,
    postedAt: at.toISOString(),
    day: dayKey(at, ZONE),
    when: today ? formatTime(at, ZONE) : `${formatShortDay(at, ZONE)} ${formatTime(at, ZONE)}`,
    today: today ? "yes" : null,
    till: row.till ?? "Back office",
    tillId: row.registerId,
    cashier: row.cashier ?? "—",
    cashierId: row.cashierId,
    customer: row.customerLinked ?? (walkIn ? "Walk-in" : row.customerName!.trim()),
    customerId: row.customerId,
    customerTone: walkIn ? "faint" : null,
    customerPhone: row.customerPhone,
    items: num(row.items) ?? 0,
    paidWith: paidWithLabel(payments),
    ways: `|${[...new Set(payments.map(tenderWord))].join("|")}|`,
    total,
    counted: voided ? null : total,
    totalTone: voided ? "ink-3" : null,
    size: Math.abs(total),
    state: stateOf(row),
    voided: voided ? "yes" : null,
    flagged: row.flagged ? "yes" : null,
    siteId: row.siteId,
    shiftId: row.shiftId,
    receiptNo: row.receiptNo,
    itemNames: row.itemNames,
  };
}

/** Every row (at most 5,000) the caller may see, for the in-memory engine: "Select all", a grouped list, an export of ticked rows. */
async function loadSales(ctx: ReportContext, params: ReportParams) {
  const now = new Date();
  const scope = scopeOf(ctx, params);
  const rows = await selectRows(where(scopeSql(scope)), orderFor("newest"), TAKE, 0, true);
  // Scoped to a bundle in SQL: each row carries it, so the engine's parent condition holds.
  return result(rows.map((row) => ({ ...toSaleRow(row, now), bundleId: scope.bundleId })));
}

type Sums = { total: number; items: Prisma.Decimal | null; counted: Prisma.Decimal | null };
type Tabs = { today: number; refunds: number; voids: number; all: number };

async function pageSales(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const scope = scopeOf(ctx, query.filters);
  const base = scopeSql(scope);
  const { from, to } = todayRange(now);
  const [tabs] = await prisma.$queryRaw<Tabs[]>`
    SELECT count(*) FILTER (WHERE s."postedAt" >= ${from} AND s."postedAt" < ${to})::int AS today,
           count(*) FILTER (WHERE s."saleType" = 'REFUND')::int AS refunds,
           count(*) FILTER (WHERE s."saleType" = 'SALE' AND s.status = 'VOIDED')::int AS voids,
           count(*)::int AS "all"
    FROM "RetailSale" s
    ${where(base)}`;
  const tabCounts = { today: tabs?.today ?? 0, refunds: tabs?.refunds ?? 0, voids: tabs?.voids ?? 0, all: tabs?.all ?? 0 };

  if (query.group) {
    // The groups are words worked out in code: the in-memory engine, totals by the same rule.
    const loaded = await loadSales(ctx, loaderParams(query));
    const run = runList(LIST, loaded.rows, query, {
      role: ctx.role,
      userId: ctx.userId,
      now,
      timeZone: ZONE,
      can: () => false,
      seeCost: true,
    });
    return { ...run.result, tabs: tabCounts, truncated: loaded.truncated };
  }

  const tab = tabSql(query.tab, now);
  const whereSql = where([...base, ...(tab ? [tab] : []), ...filterSql(query.filters, query.q, now)]);
  const [sums] = await prisma.$queryRaw<Sums[]>`
    SELECT count(*)::int AS total,
           sum((SELECT sum(abs(l.quantity)) FROM "RetailSaleLine" l WHERE l."saleId" = s.id)) AS items,
           sum(s."baseAmount") FILTER (WHERE s.status <> 'VOIDED') AS counted
    ${FROM}
    ${whereSql}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectRows(whereSql, orderFor(query.sort), query.size, (page - 1) * query.size) : [];

  return {
    total,
    pages,
    page,
    rows: rows.map((row) => toSaleRow(row, now)),
    groups: null,
    totals: {
      items: num(sums?.items) ?? 0,
      total: Math.round((num(sums?.counted) ?? 0) * 100) / 100,
    },
    summary: {},
    tabs: tabCounts,
    everEmpty: tabCounts.all === 0,
    truncated: false,
  };
}

async function saleOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [tills, cashiers, sites] = await Promise.all([
    prisma.retailRegister.findMany({
      where: { companyId: ctx.companyId },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { code: "asc" }],
    }),
    // Everyone who has rung a sale.
    prisma.$queryRaw<Array<{ id: string; name: string | null }>>`
      SELECT DISTINCT s."cashierId" AS id, coalesce(u.name, s."cashierName") AS name
      FROM "RetailSale" s LEFT JOIN "User" u ON u.id = s."cashierId"
      WHERE s."companyId" = ${ctx.companyId} AND s."cashierId" IS NOT NULL`,
    prisma.site.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const people = new Map<string, string>();
  for (const cashier of cashiers) if (!people.has(cashier.id)) people.set(cashier.id, cashier.name ?? "—");
  return {
    till: tills.map((till) => ({ value: till.id, label: till.name })),
    cashier: [...people].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    site: sites.map((site) => ({ value: site.id, label: site.name })),
  };
}

export const FLOOR_SALES_LOADERS: Record<string, ReportLoader> = {
  "retail-sales": { load: loadSales, page: pageSales, options: saleOptions },
};
