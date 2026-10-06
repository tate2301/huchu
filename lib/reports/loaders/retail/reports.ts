import { Prisma, RetailTenderType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { REPORT_ONLY_REPORTS } from "@/lib/reports/definitions/retail/reports";
import { listShape, periodInstants, runRolled, runSource, type ListContext } from "@/lib/reports/list-query";
import { num, personName, result, TAKE } from "@/lib/reports/loaders/shared";
import { rolledRow } from "@/lib/reports/rollup";
import type {
  ListPageResult,
  ReportContext,
  ReportFace,
  ReportLoader,
  ReportOption,
  ReportParams,
  ReportRow,
  ReportValue,
  ResolvedListQuery,
} from "@/lib/reports/types";
import { canSeeRetailCostPrice } from "@/lib/retail/permissions";
import { tenderLabel } from "@/lib/retail/words";
import { DEFAULT_TIME_ZONE, formatTime, formatWhen } from "@/lib/workspace/format";

/**
 * Items sold and Payments (`retail-items-sold`, `retail-payments`), paged in
 * the database: every sale line and every payment is a row, so a page is one
 * query and its totals another, over every filtered row. Rolled up ("One row
 * for each"), the database groups them (`GROUP BY`) and each group becomes the
 * row `rollUp` would make of the same lines; grouped, at most 5,000 rows run
 * through the in-memory engine.
 *
 * Both read posted SALE and REFUND documents only. A refund's quantity and
 * money are negative whatever sign was stored; a voided sale is VOIDED, and a
 * VOID document is neither, so the pair adds nothing.
 */

const ITEMS = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-items-sold")!.report!;
const PAYMENTS = REPORT_ONLY_REPORTS.find((report) => report.key === "retail-payments")!.report!;

const TZ = DEFAULT_TIME_ZONE;

/** When the document was posted. */
const AT = Prisma.sql`coalesce(s."postedAt", s."createdAt")`;
/** Its calendar day in the shop's zone. */
const DAY = Prisma.sql`to_char(timezone(${TZ}, ${AT} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`;
/** −1 for a refund, whatever sign it was stored with. */
const SIGN = Prisma.sql`(CASE WHEN s."saleType" = 'REFUND' THEN -1 ELSE 1 END)`;

const POSTED = Prisma.sql`s.status = 'POSTED' AND s."saleType" IN ('SALE', 'REFUND')`;

type Filters = Record<string, string | undefined>;

function on(value: string | undefined): value is string {
  return Boolean(value) && value !== "any";
}

function likeOf(q: string): string {
  return `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** The conditions both sources share: company, posted, period, shop, cashier, and a cashier's own. */
function saleWhere(ctx: ReportContext, filters: Filters, own: string | null, now: Date): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [Prisma.sql`s."companyId" = ${ctx.companyId}`, POSTED];
  const range = on(filters.when) ? periodInstants(filters.when, now, TZ) : undefined;
  if (range?.gte) parts.push(Prisma.sql`${AT} >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`${AT} < ${range.lt}`);
  if (on(filters.site)) parts.push(Prisma.sql`s."siteId" = ${filters.site}`);
  if (on(filters.cashier)) parts.push(Prisma.sql`s."cashierId" = ${filters.cashier}`);
  if (own) parts.push(Prisma.sql`s."cashierId" = ${own}`);
  return parts;
}

const whereOf = (parts: Prisma.Sql[]) => Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;

/** The engine's view of the caller, for the in-memory paths. */
function listCtx(ctx: ReportContext, now: Date): ListContext {
  return { role: ctx.role, userId: ctx.userId, now, timeZone: TZ, can: () => false, seeCost: canSeeRetailCostPrice(ctx.role) };
}

function ownOf(face: ReportFace, ctx: ReportContext): string | null {
  return face.scopeOwn?.roles.includes(ctx.role) ? ctx.userId : null;
}

function costKeys(face: ReportFace, seeCost: boolean): string[] {
  return seeCost ? [] : face.columns.filter((column) => column.requires === "view-cost").map((column) => column.key);
}

function strip<T extends Record<string, unknown>>(record: T, keys: string[]): T {
  if (keys.length === 0) return record;
  const copy = { ...record };
  for (const key of keys) delete copy[key];
  return copy;
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

/** Σnum ÷ Σden × 100, one place — `ratioOf`'s arithmetic. */
function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10;
}

/**
 * A rollup key as the database groups it: the words, and — where the face has
 * a filter of that name — the id a key cell's link narrows by, as `rollUp`
 * carries it.
 */
type KeySql = { value: Prisma.Sql; id?: { key: string; sql: Prisma.Sql } };

/** One `GROUP BY` over a source: its keys, count, sums and the latest of a sort key. */
async function groupRows(
  face: ReportFace,
  query: ResolvedListQuery,
  from: Prisma.Sql,
  where: Prisma.Sql,
  keys: Record<string, KeySql>,
  sums: Record<string, Prisma.Sql>,
  latest: Record<string, Prisma.Sql>,
): Promise<ReportRow[]> {
  const asked = query.rows.map((key) => ({ key, ...keys[key]! }));
  const select = [
    ...asked.map(({ key, value }) => Prisma.sql`${value} AS ${Prisma.raw(`"${key}"`)}`),
    ...asked
      .filter(({ id }) => id)
      .map(({ id }) => Prisma.sql`(CASE WHEN count(DISTINCT ${id!.sql}) = 1 THEN min(${id!.sql}) END) AS ${Prisma.raw(`"${id!.key}"`)}`),
    Prisma.sql`count(*)::int AS ${Prisma.raw(`"${face.rollupOnly}"`)}`,
    ...Object.entries(sums).map(([key, sql]) => Prisma.sql`coalesce(sum(${sql}), 0) AS ${Prisma.raw(`"${key}"`)}`),
    ...Object.entries(latest).map(([key, sql]) => Prisma.sql`max(${sql}) AS ${Prisma.raw(`"${key}"`)}`),
  ];
  // By position: a key's expression carries bound values, which the database would not match by text.
  const groupBy = Prisma.raw(asked.map((_, index) => String(index + 1)).join(", "));
  const found = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT ${Prisma.join(select, ", ")} ${from} ${where} GROUP BY ${groupBy}`;
  return found.map((raw) => {
    const values: Record<string, ReportValue> = {};
    for (const [key, value] of Object.entries(raw)) {
      values[key] = value instanceof Date ? value.toISOString() : value instanceof Prisma.Decimal ? Number(value) : (value as ReportValue);
    }
    return rolledRow(face, query.rows, values, { template: query.template, filters: query.filters });
  });
}

/* ──────────────────────────────────────────────────────────────────────────
   Items sold
   ────────────────────────────────────────────────────────────────────────── */

const ITEMS_FROM = Prisma.sql`
  FROM "RetailSaleLine" l
  JOIN "RetailSale" s ON s.id = l."saleId"
  JOIN "Site" st ON st.id = s."siteId"
  LEFT JOIN "Product" p ON p.id = l."productId"
  LEFT JOIN "RetailCategory" c ON c.id = p."categoryId"`;

const QTY = Prisma.sql`(${SIGN} * abs(l.quantity))`;
/** Ex VAT, the rule of Insights › Profit (`profitOf`): what the line came to less its tax. */
const REVENUE = Prisma.sql`(${SIGN} * (abs(l."lineTotal") - abs(l."taxAmount")))`;
const COST = Prisma.sql`(${SIGN} * abs(l."costTotal"))`;

function itemsWhere(ctx: ReportContext, filters: Filters, q: string, own: string | null, now: Date): Prisma.Sql {
  const parts = saleWhere(ctx, filters, own, now);
  if (on(filters.category)) parts.push(Prisma.sql`p."categoryId" = ${filters.category}`);
  if (q.trim()) {
    const like = likeOf(q.trim());
    parts.push(Prisma.sql`(l."itemName" ILIKE ${like} OR s."saleNo" ILIKE ${like} OR s."cashierName" ILIKE ${like})`);
  }
  return whereOf(parts);
}

type ItemRaw = {
  id: string;
  at: Date;
  day: string;
  item: string;
  productId: string | null;
  saleId: string;
  saleNo: string;
  cashier: string | null;
  cashierId: string | null;
  category: string | null;
  categoryId: string | null;
  site: string;
  siteId: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  revenue: Prisma.Decimal;
  cost: Prisma.Decimal;
};

async function selectItems(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<ItemRaw[]> {
  return prisma.$queryRaw<ItemRaw[]>`
    SELECT l.id, ${AT} AS at, ${DAY} AS day, l."itemName" AS item, l."productId" AS "productId",
           s.id AS "saleId", s."saleNo" AS "saleNo", s."cashierName" AS cashier, s."cashierId" AS "cashierId",
           c.name AS category, p."categoryId" AS "categoryId", st.name AS site, st.id AS "siteId",
           ${QTY} AS quantity, l."unitPrice" AS "unitPrice", ${REVENUE} AS revenue, ${COST} AS cost
    ${ITEMS_FROM}
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

export function itemRow(raw: ItemRaw): ReportRow {
  const revenue = num(raw.revenue) ?? 0;
  const cost = num(raw.cost) ?? 0;
  const margin = round2(revenue - cost);
  return {
    id: raw.id,
    at: raw.at.toISOString(),
    date: raw.day,
    time: formatTime(raw.at, TZ),
    item: raw.item,
    productId: raw.productId,
    saleId: raw.saleId,
    saleNo: raw.saleNo,
    cashier: raw.cashier,
    cashierId: raw.cashierId,
    category: raw.category,
    categoryId: raw.categoryId,
    site: raw.site,
    siteId: raw.siteId,
    quantity: num(raw.quantity) ?? 0,
    unitPrice: num(raw.unitPrice) ?? 0,
    revenue,
    cost,
    margin,
    marginRate: rate(margin, revenue),
    lines: 1,
  };
}

function itemsOrder(sort: string): Prisma.Sql {
  switch (sort) {
    case "most-revenue":
      return Prisma.sql`ORDER BY revenue DESC, at DESC, l.id DESC`;
    case "most-sold":
      return Prisma.sql`ORDER BY quantity DESC, at DESC, l.id DESC`;
    case "lowest-margin":
      return Prisma.sql`ORDER BY (CASE WHEN ${REVENUE} = 0 THEN NULL ELSE (${REVENUE} - ${COST}) / ${REVENUE} END) ASC NULLS LAST, at DESC, l.id DESC`;
    default:
      return Prisma.sql`ORDER BY at DESC, l.id DESC`;
  }
}

const ITEM_KEYS: Record<string, KeySql> = {
  item: { value: Prisma.sql`l."itemName"` },
  category: { value: Prisma.sql`c.name`, id: { key: "categoryId", sql: Prisma.sql`p."categoryId"` } },
  date: { value: DAY },
  site: { value: Prisma.sql`st.name`, id: { key: "siteId", sql: Prisma.sql`st.id` } },
  cashier: { value: Prisma.sql`s."cashierName"`, id: { key: "cashierId", sql: Prisma.sql`s."cashierId"` } },
};

async function loadItems(ctx: ReportContext, params: ReportParams) {
  const rows = await selectItems(itemsWhere(ctx, params, "", null, new Date()), itemsOrder("newest"), TAKE);
  return result(rows.map(itemRow));
}

async function pageItems(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const engine = listCtx(ctx, now);
  const own = ownOf(ITEMS, ctx);
  const where = itemsWhere(ctx, query.filters, query.q, own, now);
  const cost = costKeys(ITEMS, engine.seeCost);

  if (query.rows.length) {
    const rolled = await groupRows(
      ITEMS,
      query,
      ITEMS_FROM,
      where,
      ITEM_KEYS,
      { quantity: QTY, revenue: REVENUE, cost: COST },
      { at: AT },
    );
    const unitPrices = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT ${Prisma.join(query.rows.map((key) => Prisma.sql`${ITEM_KEYS[key]!.value} AS ${Prisma.raw(`"${key}"`)}`), ", ")},
             avg(l."unitPrice") AS "unitPrice"
      ${ITEMS_FROM} ${where} GROUP BY ${Prisma.raw(query.rows.map((_, index) => String(index + 1)).join(", "))}`;
    const price = new Map(unitPrices.map((raw) => [query.rows.map((key) => String(raw[key] ?? "")).join("|"), round4(num(raw.unitPrice as Prisma.Decimal) ?? 0)]));
    for (const row of rolled) {
      const revenue = round2(Number(row.revenue));
      const costTotal = round2(Number(row.cost));
      row.quantity = round4(Number(row.quantity));
      row.revenue = revenue;
      row.cost = costTotal;
      row.margin = round2(revenue - costTotal);
      row.marginRate = rate(revenue - costTotal, revenue);
      row.unitPrice = price.get(row.id) ?? null;
      for (const key of cost) delete row[key];
    }
    const run = await finishRolled(ITEMS, rolled, query, engine, () => everEmptyItems(ctx, own));
    // Price is an average: Σ is the average of every line, as unrolled, not the average of the rows' averages.
    if (rolled.length) {
      const [flat] = await prisma.$queryRaw<Array<{ unitPrice: unknown }>>`SELECT avg(l."unitPrice") AS "unitPrice" ${ITEMS_FROM} ${where}`;
      run.totals.unitPrice = round4(num(flat?.unitPrice as Prisma.Decimal) ?? 0);
    }
    return run;
  }

  if (query.group) {
    const loaded = await selectItems(where, itemsOrder(query.sort), TAKE);
    const run = runSource(ITEMS, result(loaded.map(itemRow)).rows, { ...query, q: "" }, engine);
    return { ...run.result, truncated: loaded.length > TAKE - 1 };
  }

  const [sums] = await prisma.$queryRaw<Array<{ total: number; quantity: unknown; unitPrice: unknown; revenue: unknown; cost: unknown }>>`
    SELECT count(*)::int AS total, sum(${QTY}) AS quantity, avg(l."unitPrice") AS "unitPrice",
           sum(${REVENUE}) AS revenue, sum(${COST}) AS cost
    ${ITEMS_FROM} ${where}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectItems(where, itemsOrder(query.sort), query.size, (page - 1) * query.size) : [];
  const revenue = round2(num(sums?.revenue as Prisma.Decimal) ?? 0);
  const costTotal = round2(num(sums?.cost as Prisma.Decimal) ?? 0);
  return {
    total,
    pages,
    page,
    rows: rows.map((raw) => strip(itemRow(raw), cost)),
    groups: null,
    totals: strip(
      {
        quantity: round4(num(sums?.quantity as Prisma.Decimal) ?? 0),
        unitPrice: total ? round4(num(sums?.unitPrice as Prisma.Decimal) ?? 0) : null,
        revenue,
        cost: costTotal,
        margin: round2(revenue - costTotal),
        marginRate: rate(revenue - costTotal, revenue),
      },
      cost,
    ),
    summary: {},
    tabs: null,
    everEmpty: total > 0 ? false : await everEmptyItems(ctx, own),
    truncated: false,
  };
}

async function everEmptyItems(ctx: ReportContext, own: string | null): Promise<boolean> {
  const [found] = await prisma.$queryRaw<Array<{ any: boolean }>>`
    SELECT EXISTS (SELECT 1 ${ITEMS_FROM} ${whereOf(saleWhere(ctx, {}, own, new Date()))}) AS any`;
  return found?.any !== true;
}

/* ──────────────────────────────────────────────────────────────────────────
   Payments
   ────────────────────────────────────────────────────────────────────────── */

const PAYMENTS_FROM = Prisma.sql`
  FROM "RetailSalePayment" pm
  JOIN "RetailSale" s ON s.id = pm."saleId"
  JOIN "Site" st ON st.id = s."siteId"
  LEFT JOIN "RetailRegister" r ON r.id = s."registerId"`;

/** In US$, a refund negative whatever sign was stored. */
const AMOUNT = Prisma.sql`(${SIGN} * abs(pm."baseAmount"))`;
/** Which tender column a payment counts under: ZiG first (any payment in ZiG), then by tender. */
const TENDER_KEY = Prisma.sql`(CASE
  WHEN pm.currency = 'ZWG' THEN 'zig'
  WHEN pm."tenderType" = 'CASH' THEN 'cash'
  WHEN pm."tenderType" = 'ECOCASH' THEN 'ecocash'
  WHEN pm."tenderType" = 'CARD' THEN 'card'
  WHEN pm."tenderType" = 'ON_ACCOUNT' THEN 'account'
  ELSE 'other' END)`;
const TENDER_KEYS = ["cash", "ecocash", "card", "zig", "account", "other"] as const;
const tenderSum = (key: string) => Prisma.sql`(CASE WHEN ${TENDER_KEY} = ${key} THEN ${AMOUNT} END)`;
const TILL = Prisma.sql`coalesce(r.name, 'No till')`;
/** "ZiG" for a payment in ZiG, else the tender in retail's words (`tenderLabel`). */
const TENDER_WORDS = Prisma.sql`(CASE WHEN pm.currency = 'ZWG' THEN 'ZiG' ${Prisma.join(
  Object.values(RetailTenderType).map((type) => Prisma.sql`WHEN pm."tenderType" = ${type}::"RetailTenderType" THEN ${tenderLabel(type)}`),
  " ",
)} END)`;

function paymentsWhere(ctx: ReportContext, filters: Filters, q: string, own: string | null, now: Date): Prisma.Sql {
  const parts = saleWhere(ctx, filters, own, now);
  if (on(filters.till)) parts.push(Prisma.sql`s."registerId" = ${filters.till}`);
  if (on(filters.tender)) parts.push(Prisma.sql`${TENDER_KEY} = ${filters.tender}`);
  if (q.trim()) {
    const like = likeOf(q.trim());
    parts.push(Prisma.sql`(s."saleNo" ILIKE ${like} OR pm.reference ILIKE ${like})`);
  }
  return whereOf(parts);
}

type PaymentRaw = {
  id: string;
  at: Date;
  day: string;
  saleId: string;
  saleNo: string;
  till: string;
  tillId: string | null;
  site: string;
  siteId: string;
  cashier: string | null;
  cashierId: string | null;
  tenderType: string;
  tenderKey: string;
  currency: string;
  reference: string | null;
  amount: Prisma.Decimal;
};

async function selectPayments(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<PaymentRaw[]> {
  return prisma.$queryRaw<PaymentRaw[]>`
    SELECT pm.id, ${AT} AS at, ${DAY} AS day, s.id AS "saleId", s."saleNo" AS "saleNo",
           ${TILL} AS till, s."registerId" AS "tillId", st.name AS site, st.id AS "siteId",
           s."cashierName" AS cashier, s."cashierId" AS "cashierId", pm."tenderType"::text AS "tenderType",
           ${TENDER_KEY} AS "tenderKey", pm.currency, pm.reference, ${AMOUNT} AS amount
    ${PAYMENTS_FROM}
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

export function paymentRow(raw: PaymentRaw): ReportRow {
  const amount = num(raw.amount) ?? 0;
  const tenders = Object.fromEntries(TENDER_KEYS.map((key) => [key, raw.tenderKey === key ? amount : null]));
  return {
    id: raw.id,
    when: raw.at.toISOString(),
    whenText: formatWhen(raw.at),
    day: raw.day,
    saleId: raw.saleId,
    saleNo: raw.saleNo,
    till: raw.till,
    tillId: raw.tillId,
    site: raw.site,
    siteId: raw.siteId,
    cashier: personName({ name: raw.cashier }),
    cashierId: raw.cashierId,
    tender: raw.tenderKey === "zig" ? "ZiG" : tenderLabel(raw.tenderType),
    tenderKey: raw.tenderKey,
    reference: raw.reference,
    amount,
    ...tenders,
    taken: amount,
    payments: 1,
  };
}

function paymentsOrder(sort: string): Prisma.Sql {
  return sort === "biggest"
    ? Prisma.sql`ORDER BY amount DESC, at DESC, pm.id DESC`
    : Prisma.sql`ORDER BY at DESC, pm.id DESC`;
}

const PAYMENT_KEYS: Record<string, KeySql> = {
  day: { value: DAY },
  till: { value: TILL, id: { key: "tillId", sql: Prisma.sql`s."registerId"` } },
  tender: { value: TENDER_WORDS, id: { key: "tenderKey", sql: TENDER_KEY } },
  site: { value: Prisma.sql`st.name`, id: { key: "siteId", sql: Prisma.sql`st.id` } },
};

const PAYMENT_SUMS: Record<string, Prisma.Sql> = {
  amount: AMOUNT,
  ...Object.fromEntries(TENDER_KEYS.map((key) => [key, tenderSum(key)])),
  taken: AMOUNT,
};

async function loadPayments(ctx: ReportContext, params: ReportParams) {
  const rows = await selectPayments(paymentsWhere(ctx, params, "", null, new Date()), paymentsOrder("newest"), TAKE);
  return result(rows.map(paymentRow));
}

async function pagePayments(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const engine = listCtx(ctx, now);
  const own = ownOf(PAYMENTS, ctx);
  const where = paymentsWhere(ctx, query.filters, query.q, own, now);

  if (query.rows.length) {
    const rolled = await groupRows(PAYMENTS, query, PAYMENTS_FROM, where, PAYMENT_KEYS, PAYMENT_SUMS, { when: AT });
    for (const row of rolled) {
      for (const key of Object.keys(PAYMENT_SUMS)) row[key] = round2(Number(row[key] ?? 0));
    }
    return finishRolled(PAYMENTS, rolled, query, engine, () => everEmptyPayments(ctx, own));
  }

  if (query.group) {
    const loaded = await selectPayments(where, paymentsOrder(query.sort), TAKE);
    const run = runSource(PAYMENTS, result(loaded.map(paymentRow)).rows, { ...query, q: "" }, engine);
    return { ...run.result, truncated: loaded.length > TAKE - 1 };
  }

  const sums = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT count(*)::int AS total,
           ${Prisma.join(Object.entries(PAYMENT_SUMS).map(([key, sql]) => Prisma.sql`coalesce(sum(${sql}), 0) AS ${Prisma.raw(`"${key}"`)}`), ", ")}
    ${PAYMENTS_FROM} ${where}`;
  const totalsRow = sums[0] ?? {};
  const total = Number(totalsRow.total ?? 0);
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectPayments(where, paymentsOrder(query.sort), query.size, (page - 1) * query.size) : [];
  return {
    total,
    pages,
    page,
    rows: rows.map(paymentRow),
    groups: null,
    totals: Object.fromEntries(Object.keys(PAYMENT_SUMS).map((key) => [key, round2(num(totalsRow[key] as Prisma.Decimal) ?? 0)])),
    summary: {},
    tabs: null,
    everEmpty: total > 0 ? false : await everEmptyPayments(ctx, own),
    truncated: false,
  };
}

async function everEmptyPayments(ctx: ReportContext, own: string | null): Promise<boolean> {
  const [found] = await prisma.$queryRaw<Array<{ any: boolean }>>`
    SELECT EXISTS (SELECT 1 ${PAYMENTS_FROM} ${whereOf(saleWhere(ctx, {}, own, new Date()))}) AS any`;
  return found?.any !== true;
}

/* ──────────────────────────────────────────────────────────────────────────
   Shared
   ────────────────────────────────────────────────────────────────────────── */

/** Rolled rows sorted, grouped, totalled and paged in the rolled shape, as the in-memory path does. */
async function finishRolled(
  face: ReportFace,
  rolled: ReportRow[],
  query: ResolvedListQuery,
  engine: ListContext,
  everEmpty: () => Promise<boolean>,
): Promise<ListPageResult> {
  const run = runRolled(listShape(face, query), rolled, query, engine);
  return { ...run.result, tabs: null, everEmpty: rolled.length > 0 ? false : await everEmpty() };
}

async function saleOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [sites, tills, cashiers, categories] = await Promise.all([
    prisma.site.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.retailRegister.findMany({ where: { companyId: ctx.companyId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.retailSale.findMany({
      where: { companyId: ctx.companyId, cashierId: { not: null } },
      select: { cashierId: true, cashierName: true },
      distinct: ["cashierId"],
    }),
    prisma.retailCategory.findMany({
      where: { companyId: ctx.companyId, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    till: tills.map((till) => ({ value: till.id, label: till.name })),
    cashier: cashiers
      .map((cashier) => ({ value: cashier.cashierId!, label: cashier.cashierName ?? cashier.cashierId! }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    category: categories.map((category) => ({ value: category.id, label: category.name })),
  };
}

export const REPORT_ONLY_LOADERS: Record<string, ReportLoader> = {
  "retail-items-sold": { load: loadItems, page: pageItems, options: saleOptions },
  "retail-payments": { load: loadPayments, page: pagePayments, options: saleOptions },
};
