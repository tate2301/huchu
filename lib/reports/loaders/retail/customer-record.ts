import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { periodInstants } from "@/lib/reports/list-query";
import { num, personName, result, TAKE } from "@/lib/reports/loaders/shared";
import type { ListPageResult, ParentNamed, ReportContext, ReportLoader, ReportParams, ReportRow, ResolvedListQuery } from "@/lib/reports/types";
import { pointsWorth } from "@/lib/retail/loyalty/format";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { paidWithLabel, pointsKindLabel } from "@/lib/retail/words";
import { dayKey, DEFAULT_TIME_ZONE, formatCount, formatWhen } from "@/lib/workspace/format";

/**
 * A customer's record tabs (CUS-03, packet 61): the points ledger
 * (`retail-points`), their purchases (`retail-customer-purchases`) and their
 * notes (`retail-customer-notes`), each scoped by the `customer` parent.
 *
 * The ledger and the purchases page in the database. The ledger's balance is
 * a running sum over the customer's whole ledger in (createdAt, seq) order,
 * worked out before any filter or page is applied, so each row says what it
 * left whatever is shown around it.
 */

const ZONE = DEFAULT_TIME_ZONE;
const isId = (value: string | undefined): value is string => Boolean(value && /^[0-9a-f-]{36}$/i.test(value));

/* ── The points ledger ─────────────────────────────────────────────────── */

type PointsFilters = { customer?: string; what?: string; when?: string; q?: string };

/** "What" as SQL over the ledger row `l`. */
const WHAT_SQL: Record<string, Prisma.Sql> = {
  earned: Prisma.sql`l.kind = 'EARNED'`,
  spent: Prisma.sql`l.kind = 'SPENT'`,
  adjusted: Prisma.sql`(l.kind = 'ADJUSTED' AND l.reason IS DISTINCT FROM 'BIRTHDAY')`,
  birthday: Prisma.sql`(l.kind = 'BIRTHDAY' OR (l.kind = 'ADJUSTED' AND l.reason = 'BIRTHDAY'))`,
  expired: Prisma.sql`l.kind = 'EXPIRED'`,
  refunds: Prisma.sql`l.kind = 'REVERSED'`,
};

/** The customer's whole ledger with its running balance: the CTE every page reads. */
function ledgerSql(companyId: string, customerId: string): Prisma.Sql {
  return Prisma.sql`
    ledger AS (
      SELECT e.id, e.seq, e."createdAt", e.kind::text AS kind, e.reason::text AS reason, e.points, e.note,
             e."saleId", e."actorName", e."customerId",
             sum(e.points) OVER (PARTITION BY e."customerId" ORDER BY e."createdAt", e.seq ROWS UNBOUNDED PRECEDING)::int AS balance
      FROM "RetailPointsEntry" e
      WHERE e."companyId" = ${companyId} AND e."customerId" = ${customerId}
    )`;
}

function pointsWhere(filters: PointsFilters, now: Date): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  const what = filters.what && filters.what !== "any" ? WHAT_SQL[filters.what] : undefined;
  if (what) parts.push(what);
  const range = filters.when && filters.when !== "any" ? periodInstants(filters.when, now, ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`l."createdAt" >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`l."createdAt" < ${range.lt}`);
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    parts.push(Prisma.sql`(s."saleNo" ILIKE ${like} OR l.note ILIKE ${like})`);
  }
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

function pointsOrder(sort: string): Prisma.Sql {
  switch (sort) {
    case "oldest":
    case "at:asc":
      return Prisma.sql`ORDER BY l."createdAt" ASC, l.seq ASC`;
    case "biggest":
    case "size:desc":
      return Prisma.sql`ORDER BY abs(l.points) DESC, l."createdAt" DESC, l.seq DESC`;
    default:
      return Prisma.sql`ORDER BY l."createdAt" DESC, l.seq DESC`;
  }
}

type PointsRow = {
  id: string;
  createdAt: Date;
  kind: string;
  reason: string | null;
  points: number;
  note: string | null;
  saleId: string | null;
  saleNo: string | null;
  actorName: string | null;
  customerId: string;
  balance: number;
};

async function selectPoints(companyId: string, customerId: string, where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0) {
  return prisma.$queryRaw<PointsRow[]>`
    WITH ${ledgerSql(companyId, customerId)}
    SELECT l.id, l."createdAt", l.kind, l.reason, l.points, l.note, l."saleId", s."saleNo", l."actorName", l."customerId", l.balance
    FROM ledger l
    LEFT JOIN "RetailSale" s ON s.id = l."saleId"
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

export function toPointsRow(row: PointsRow): ReportRow {
  const words = pointsKindLabel({ kind: row.kind, points: row.points, reason: row.reason });
  const at = row.createdAt.toISOString();
  return {
    id: row.id,
    at,
    day: dayKey(row.createdAt, ZONE),
    whenText: formatWhen(row.createdAt),
    what: words.label,
    tone: words.tone,
    note: row.note,
    ref: row.saleNo,
    saleId: row.saleId,
    by: row.actorName ?? "Automatic",
    points: row.points,
    balance: row.balance,
    size: Math.abs(row.points),
    customerId: row.customerId,
  };
}

const pointsFilters = (filters: Record<string, string>, q?: string): PointsFilters => ({
  customer: filters.customer,
  what: filters.what,
  when: filters.when,
  q,
});

async function loadPoints(ctx: ReportContext, params: ReportParams) {
  const filters = pointsFilters(params);
  if (!isId(filters.customer)) return result([]);
  const rows = await selectPoints(ctx.companyId, filters.customer, pointsWhere(filters, new Date()), pointsOrder("newest"), TAKE);
  return result(rows.map(toPointsRow));
}

type PointsSums = {
  total: number;
  net: number | null;
  earned: number | null;
  spent: number | null;
  expired: number | null;
  adjusted: number | null;
  takenBack: number | null;
};

export async function pagePoints(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const filters = pointsFilters(query.filters, query.q);
  const empty: ListPageResult = {
    total: 0,
    pages: 1,
    page: 1,
    rows: [],
    groups: null,
    totals: { points: 0, balance: 0 },
    summary: {},
    tabs: null,
    everEmpty: true,
    truncated: false,
  };
  if (!isId(filters.customer)) return empty;
  const customerId = filters.customer;
  const where = pointsWhere(filters, now);
  const [sums] = await prisma.$queryRaw<PointsSums[]>`
    WITH ${ledgerSql(ctx.companyId, customerId)}
    SELECT count(*)::int AS total,
           sum(l.points)::int AS net,
           sum(l.points) FILTER (WHERE l.kind IN ('EARNED', 'BIRTHDAY') OR (l.kind = 'ADJUSTED' AND l.reason = 'BIRTHDAY'))::int AS earned,
           sum(l.points) FILTER (WHERE l.kind = 'SPENT')::int AS spent,
           sum(l.points) FILTER (WHERE l.kind = 'EXPIRED')::int AS expired,
           sum(l.points) FILTER (WHERE l.kind = 'ADJUSTED' AND l.reason IS DISTINCT FROM 'BIRTHDAY')::int AS adjusted,
           sum(l.points) FILTER (WHERE l.kind = 'REVERSED')::int AS "takenBack"
    FROM ledger l
    LEFT JOIN "RetailSale" s ON s.id = l."saleId"
    ${where}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const [rows, balance] = await Promise.all([
    total ? selectPoints(ctx.companyId, customerId, where, pointsOrder(query.sort), query.size, (page - 1) * query.size) : Promise.resolve([]),
    prisma.retailPointsEntry.aggregate({ where: { companyId: ctx.companyId, customerId }, _sum: { points: true } }),
  ]);
  const everEmpty = total > 0 ? false : (await prisma.retailPointsEntry.count({ where: { companyId: ctx.companyId, customerId } })) === 0;
  return {
    ...empty,
    total,
    pages,
    page,
    rows: rows.map(toPointsRow),
    totals: {
      points: sums?.net ?? 0,
      earned: sums?.earned ?? 0,
      spent: sums?.spent ?? 0,
      expired: sums?.expired ?? 0,
      adjusted: sums?.adjusted ?? 0,
      takenBack: sums?.takenBack ?? 0,
      balance: balance._sum.points ?? 0,
    },
    everEmpty,
  };
}

/** The customer, and what their points are worth: "3,021 points, worth US$30.21". */
async function pointsParent(ctx: ReportContext, filters: Record<string, string>): Promise<ParentNamed | null> {
  if (!isId(filters.customer)) return null;
  const [customer, sum, settings] = await Promise.all([
    prisma.customer.findFirst({ where: { id: filters.customer, companyId: ctx.companyId }, select: { name: true } }),
    prisma.retailPointsEntry.aggregate({ where: { companyId: ctx.companyId, customerId: filters.customer }, _sum: { points: true } }),
    loadLoyaltySettings(ctx.companyId),
  ]);
  if (!customer) return null;
  const points = sum._sum.points ?? 0;
  return { label: customer.name, sub: `${formatCount(points)} ${points === 1 ? "point" : "points"}, worth ${pointsWorth(points, settings.pointValue)}` };
}

/* ── Their purchases ───────────────────────────────────────────────────── */

type PurchaseRow = {
  id: string;
  saleNo: string;
  saleType: string;
  sourceSaleId: string | null;
  postedAt: Date | null;
  createdAt: Date;
  baseAmount: Prisma.Decimal;
  items: Prisma.Decimal | null;
  points: number | null;
  tenders: Array<{ tenderType: string; currency: string | null }> | null;
  customerId: string;
};

function purchasesWhere(companyId: string, customerId: string, q?: string, when?: string, now: Date = new Date()): Prisma.Sql {
  const parts = [
    Prisma.sql`s."companyId" = ${companyId}`,
    Prisma.sql`s."customerId" = ${customerId}`,
    Prisma.sql`s."saleType" IN ('SALE', 'REFUND', 'VOID')`,
  ];
  // The record's tab reads the same 12 months as its Visits figure.
  const range = when && when !== "any" ? periodInstants(when, now, ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`coalesce(s."postedAt", s."createdAt") >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`coalesce(s."postedAt", s."createdAt") < ${range.lt}`);
  const text = q?.trim();
  if (text) parts.push(Prisma.sql`s."saleNo" ILIKE ${`%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`}`);
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

async function selectPurchases(where: Prisma.Sql, limit: number, offset = 0) {
  return prisma.$queryRaw<PurchaseRow[]>`
    SELECT s.id, s."saleNo", s."saleType"::text AS "saleType", s."sourceSaleId", s."postedAt", s."createdAt", s."baseAmount", s."customerId",
           (SELECT sum(abs(l.quantity)) FROM "RetailSaleLine" l WHERE l."saleId" = s.id) AS items,
           (SELECT sum(e.points)::int FROM "RetailPointsEntry" e WHERE e."saleId" = s.id AND e.kind = 'EARNED') AS points,
           (SELECT json_agg(json_build_object('tenderType', p."tenderType", 'currency', p.currency))
              FROM "RetailSalePayment" p WHERE p."saleId" = s.id) AS tenders
    FROM "RetailSale" s
    ${where}
    ORDER BY coalesce(s."postedAt", s."createdAt") DESC, s.id DESC
    LIMIT ${limit} OFFSET ${offset}`;
}

function toPurchaseRow(row: PurchaseRow): ReportRow {
  const at = row.postedAt ?? row.createdAt;
  return {
    id: row.id,
    at: at.toISOString(),
    whenText: formatWhen(at),
    day: dayKey(at, ZONE),
    ref: row.saleNo,
    // A void opens the sale it cancelled.
    saleId: row.saleType === "VOID" ? (row.sourceSaleId ?? row.id) : row.id,
    items: num(row.items) ?? 0,
    paidWith: paidWithLabel(row.tenders ?? []) || "—",
    points: row.points,
    total: Math.round((num(row.baseAmount) ?? 0) * 100) / 100,
    customerId: row.customerId,
  };
}

async function loadPurchases(ctx: ReportContext, params: ReportParams) {
  if (!isId(params.customer)) return result([]);
  const rows = await selectPurchases(purchasesWhere(ctx.companyId, params.customer, undefined, params.when), TAKE);
  return result(rows.map(toPurchaseRow));
}

type PurchaseSums = { total: number; items: Prisma.Decimal | null; points: number | null; amount: Prisma.Decimal | null };

async function pagePurchases(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const customerId = query.filters.customer;
  const base: ListPageResult = {
    total: 0,
    pages: 1,
    page: 1,
    rows: [],
    groups: null,
    totals: { items: 0, points: 0, total: 0 },
    summary: {},
    tabs: null,
    everEmpty: true,
    truncated: false,
  };
  if (!isId(customerId)) return base;
  const where = purchasesWhere(ctx.companyId, customerId, query.q, query.filters.when);
  const [sums] = await prisma.$queryRaw<PurchaseSums[]>`
    SELECT count(*)::int AS total,
           sum((SELECT sum(abs(l.quantity)) FROM "RetailSaleLine" l WHERE l."saleId" = s.id)) AS items,
           sum((SELECT sum(e.points) FROM "RetailPointsEntry" e WHERE e."saleId" = s.id AND e.kind = 'EARNED'))::int AS points,
           sum(s."baseAmount") AS amount
    FROM "RetailSale" s
    ${where}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectPurchases(where, query.size, (page - 1) * query.size) : [];
  return {
    ...base,
    total,
    pages,
    page,
    rows: rows.map(toPurchaseRow),
    totals: {
      items: num(sums?.items) ?? 0,
      points: sums?.points ?? 0,
      total: Math.round((num(sums?.amount) ?? 0) * 100) / 100,
    },
    everEmpty: total === 0,
  };
}

/* ── Their notes ───────────────────────────────────────────────────────── */

async function loadNotes(ctx: ReportContext, params: ReportParams) {
  if (!isId(params.customer)) return result([]);
  const notes = await prisma.retailCustomerNote.findMany({
    where: { companyId: ctx.companyId, customerId: params.customer },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: TAKE,
    select: { id: true, body: true, createdAt: true, customerId: true, createdBy: { select: { name: true, email: true } } },
  });
  return result(
    notes.map((note) => ({
      id: note.id,
      at: note.createdAt.toISOString(),
      whenText: formatWhen(note.createdAt),
      body: note.body,
      by: personName(note.createdBy) ?? "—",
      customerId: note.customerId,
    })),
  );
}

async function customerName(ctx: ReportContext, filters: Record<string, string>) {
  if (!isId(filters.customer)) return null;
  const customer = await prisma.customer.findFirst({ where: { id: filters.customer, companyId: ctx.companyId }, select: { name: true } });
  return customer?.name ?? null;
}

export const CUSTOMER_RECORD_LOADERS: Record<string, ReportLoader> = {
  "retail-points": { load: loadPoints, page: pagePoints, parentLabel: pointsParent },
  "retail-customer-purchases": { load: loadPurchases, page: pagePurchases, parentLabel: customerName },
  "retail-customer-notes": { load: loadNotes, parentLabel: customerName },
};

export { customerName as customerParentName };
