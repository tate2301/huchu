import { Prisma, type MovementType, type StockMovementReason } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { STOCK_MOVEMENT_REPORTS } from "@/lib/reports/definitions/retail/stock-movements";
import { loaderParams, periodInstants, runList } from "@/lib/reports/list-query";
import { num, personName, TAKE, result } from "@/lib/reports/loaders/shared";
import type {
  ListPageResult,
  ReportContext,
  ReportLoader,
  ReportOption,
  ReportParams,
  ReportRow,
  ResolvedListQuery,
} from "@/lib/reports/types";
import {
  MOVEMENT_KINDS,
  movementKind,
  movementLabel,
  movementTone,
  type MovementKind,
} from "@/lib/retail/stock/movement-words";
import { REVERSIBLE_REASONS } from "@/lib/retail/stock/reverse-words";
import { dayKey, DEFAULT_TIME_ZONE, formatWhen } from "@/lib/workspace/format";

/**
 * Movements (30-stock 4.1, `retail-stock-movements`): the stock ledger of every
 * product line, newest first.
 *
 * Every sale line is a movement, so the list pages in the database: one
 * query for the page, one for the count and the totals over every filtered
 * row (Σ change, in, out) — never the page added up. A grouped list is the
 * exception: its groups are the movement's words, which are worked out in
 * code, so it runs through the in-memory engine over at most 5,000 rows.
 *
 * `load` is the same query without paging; the export and "Select all" read it.
 */

const LIST = STOCK_MOVEMENT_REPORTS[0]!.list!;

type Filters = {
  kind?: string;
  site?: string;
  by?: string;
  when?: string;
  product?: string;
  q?: string;
};

/** The reasons a Kind filter value stands for ("sales" → SALE, REFUND, VOID). */
export function kindReasons(value: string | undefined): StockMovementReason[] | null {
  if (!value || value === "any") return null;
  const kind = MOVEMENT_KINDS.find((candidate) => candidate.id === (value.toUpperCase() as MovementKind));
  return kind ? kind.reasons : null;
}

const FROM = Prisma.sql`
  FROM "StockMovement" m
  JOIN "InventoryItem" i ON i.id = m."itemId"
  JOIN "Site" s ON s.id = i."siteId"
  JOIN "Product" p ON p.id = i."productId"`;

/** Only this company's product lines: the stores module's items are not a shop's stock. */
function whereFor(companyId: string, filters: Filters, now = new Date()): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`s."companyId" = ${companyId}`, Prisma.sql`p."companyId" = ${companyId}`];
  if (filters.product) parts.push(Prisma.sql`i."productId" = ${filters.product}`);
  if (filters.site && filters.site !== "any") parts.push(Prisma.sql`i."siteId" = ${filters.site}`);
  if (filters.by && filters.by !== "any") parts.push(Prisma.sql`m."issuedById" = ${filters.by}`);
  const reasons = kindReasons(filters.kind);
  if (reasons) parts.push(Prisma.sql`m.reason::text IN (${Prisma.join(reasons)})`);
  const range = filters.when ? periodInstants(filters.when, now, DEFAULT_TIME_ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`m."createdAt" >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`m."createdAt" < ${range.lt}`);
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    parts.push(Prisma.sql`(p.name ILIKE ${like} OR p.code ILIKE ${like} OR m.reference ILIKE ${like})`);
  }
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

function orderFor(sort: string): Prisma.Sql {
  switch (sort) {
    case "oldest":
    case "at:asc":
      return Prisma.sql`ORDER BY m."createdAt" ASC, m.id ASC`;
    case "biggest":
      return Prisma.sql`ORDER BY abs(m.change) DESC, m."createdAt" DESC, m.id DESC`;
    default:
      return Prisma.sql`ORDER BY m."createdAt" DESC, m.id DESC`;
  }
}

type MovementRow = {
  id: string;
  at: Date;
  reason: StockMovementReason | null;
  movementType: MovementType;
  change: Prisma.Decimal;
  balanceAfter: Prisma.Decimal | null;
  reference: string | null;
  sourceId: string | null;
  productId: string;
  product: string;
  code: string;
  siteId: string;
  site: string;
  byId: string | null;
  byName: string | null;
  byEmail: string | null;
  reversedReason: StockMovementReason | null;
  toPlace: string | null;
  reversed: boolean;
  unitCost: Prisma.Decimal | null;
};

async function selectRows(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<MovementRow[]> {
  return prisma.$queryRaw<MovementRow[]>`
    SELECT m.id, m."createdAt" AS at, m.reason, m."movementType" AS "movementType", m.change,
           m."balanceAfter" AS "balanceAfter", m.reference, m."sourceId" AS "sourceId",
           p.id AS "productId", p.name AS product, p.code, s.id AS "siteId", s.name AS site,
           u.id AS "byId", u.name AS "byName", u.email AS "byEmail",
           o.reason AS "reversedReason", tl.name AS "toPlace", i."unitCost" AS "unitCost",
           EXISTS (SELECT 1 FROM "StockMovement" r WHERE r."reversesId" = m.id) AS reversed
    ${FROM}
    LEFT JOIN "User" u ON u.id = m."issuedById"
    LEFT JOIN "StockMovement" o ON o.id = m."reversesId"
    LEFT JOIN "StockLocation" tl ON tl.id = m."toLocationId"
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

/** A sale's movements carry `<saleId>:<productId>` as their source; the sale is what the reference opens. */
function saleIdOf(row: Pick<MovementRow, "reason" | "sourceId">): string | null {
  if (row.reason !== "SALE" && row.reason !== "REFUND" && row.reason !== "VOID") return null;
  return row.sourceId?.split(":")[0] || null;
}

/** "Counts", "Sales and refunds": the group of reasons a movement belongs to, in STK's words. */
function kindWords(reason: StockMovementReason | null): string | null {
  const kind = movementKind(reason);
  return MOVEMENT_KINDS.find((candidate) => candidate.id === kind)?.label ?? null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function toListRow(row: MovementRow): ReportRow {
  const change = num(row.change) ?? 0;
  // At today's unit cost: a movement keeps no cost of its own (the same basis as Value at cost on hand).
  const value = round2(change * (num(row.unitCost) ?? 0));
  const counted = row.reason === "COUNT";
  const words = { reason: row.reason, movementType: row.movementType, change, reference: row.reference, toPlace: row.toPlace, reversedReason: row.reversedReason };
  const by = personName({ name: row.byName, email: row.byEmail });
  const at = row.at.toISOString();
  return {
    id: row.id,
    at,
    day: dayKey(row.at, DEFAULT_TIME_ZONE),
    whenText: formatWhen(row.at),
    product: row.product,
    productId: row.productId,
    code: row.code,
    movement: movementLabel(words, "short"),
    movementLong: movementLabel(words, "long"),
    tone: movementTone(row.reason),
    reason: row.reason,
    reference: row.reference,
    saleId: saleIdOf(row),
    site: row.site,
    siteId: row.siteId,
    change,
    balance: num(row.balanceAfter),
    by,
    byId: row.byId,
    in: change > 0 ? change : null,
    out: change < 0 ? change : null,
    size: Math.abs(change),
    reversible: row.reason && REVERSIBLE_REASONS.has(row.reason) && !row.reversed ? "yes" : null,
    // Reports' face (70-insights-reports 5.14).
    when: at,
    kind: kindWords(row.reason),
    value,
    valueSize: Math.abs(value),
    short: counted && change < 0 ? -value : null,
    over: counted && change > 0 ? value : null,
    movements: 1,
  };
}

function filtersOf(params: ReportParams): Filters {
  return { kind: params.kind, site: params.site, by: params.by, when: params.when, product: params.product };
}

async function loadMovements(ctx: ReportContext, params: ReportParams) {
  const rows = await selectRows(whereFor(ctx.companyId, filtersOf(params)), orderFor("newest"), TAKE);
  return result(rows.map(toListRow));
}

type Totals = { total: number; change: Prisma.Decimal | null; in: Prisma.Decimal | null; out: Prisma.Decimal | null };

async function pageMovements(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  if (query.group) {
    // The groups are the movement's words, which code works out: the in-memory engine.
    const loaded = await loadMovements(ctx, loaderParams(query));
    const run = runList(LIST, loaded.rows, query, {
      role: ctx.role,
      userId: ctx.userId,
      now,
      timeZone: DEFAULT_TIME_ZONE,
      can: () => false,
      seeCost: true,
    });
    return { ...run.result, totals: { ...run.result.totals, ...(await onHandTotal(ctx, query.filters)) }, truncated: loaded.truncated };
  }

  const filters: Filters = { ...filtersOf(query.filters), q: query.q };
  const where = whereFor(ctx.companyId, filters, now);
  const [sums] = await prisma.$queryRaw<Totals[]>`
    SELECT count(*)::int AS total,
           sum(m.change) AS change,
           sum(m.change) FILTER (WHERE m.change > 0) AS "in",
           sum(m.change) FILTER (WHERE m.change < 0) AS out
    ${FROM}
    ${where}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectRows(where, orderFor(query.sort), query.size, (page - 1) * query.size) : [];

  // "Nothing at all" is inside the parent: a product with no movements ever.
  const everEmpty =
    total > 0
      ? false
      : (
          await prisma.$queryRaw<Array<{ any: boolean }>>`
            SELECT EXISTS (SELECT 1 ${FROM} ${whereFor(ctx.companyId, { product: query.filters.product })}) AS any`
        )[0]?.any !== true;

  return {
    total,
    pages,
    page,
    rows: rows.map(toListRow),
    groups: null,
    totals: {
      change: num(sums?.change) ?? 0,
      in: num(sums?.in) ?? 0,
      out: num(sums?.out) ?? 0,
      ...(await onHandTotal(ctx, query.filters)),
    },
    summary: {},
    tabs: null,
    everEmpty,
    truncated: false,
  };
}

/** Scoped to a product: what it has on hand now (the record tab's Σ row ends on it). */
async function onHandTotal(ctx: ReportContext, filters: Record<string, string>): Promise<{ onHand?: number }> {
  if (!filters.product) return {};
  const site = filters.site && filters.site !== "any" ? filters.site : null;
  const sum = await prisma.inventoryItem.aggregate({
    where: { productId: filters.product, site: { companyId: ctx.companyId }, ...(site ? { siteId: site } : {}) },
    _sum: { currentStock: true },
  });
  return { onHand: num(sum._sum.currentStock) ?? 0 };
}

async function movementOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [sites, people] = await Promise.all([
    prisma.site.findMany({
      where: { companyId: ctx.companyId, isActive: true, inventory: { some: { productId: { not: null } } } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({
      where: {
        stockMovements: { some: { item: { site: { companyId: ctx.companyId }, productId: { not: null } } } },
      },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    by: people.map((person) => ({ value: person.id, label: personName(person) ?? person.id })),
  };
}

async function productName(ctx: ReportContext, filters: Record<string, string>): Promise<string | null> {
  if (!filters.product) return null;
  const product = await prisma.product.findFirst({
    where: { id: filters.product, companyId: ctx.companyId },
    select: { name: true },
  });
  return product?.name ?? null;
}

export const STOCK_MOVEMENT_LOADERS: Record<string, ReportLoader> = {
  "retail-stock-movements": {
    load: loadMovements,
    page: pageMovements,
    options: movementOptions,
    parentLabel: productName,
  },
};
