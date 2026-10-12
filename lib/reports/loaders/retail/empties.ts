import { Prisma, type RetailEmptiesKind } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { EMPTIES_KINDS, EMPTIES_REPORTS } from "@/lib/reports/definitions/retail/empties";
import { loaderParams, periodInstants, runList } from "@/lib/reports/list-query";
import { num, TAKE, result } from "@/lib/reports/loaders/shared";
import type { ListPageResult, ReportContext, ReportLoader, ReportOption, ReportParams, ReportRow, ResolvedListQuery } from "@/lib/reports/types";
import { HELD_KINDS, OWED_KINDS } from "@/lib/retail/stock/empties";
import { dayKey, DEFAULT_TIME_ZONE, formatWhen } from "@/lib/workspace/format";

/**
 * Empties (30-stock 4.6, `retail-empties`): the Empties ledger, newest first.
 *
 * Every deposit sale writes an entry, so the list pages in the database: one
 * query for the page, one for the count and the Σ row, one for the tabs'
 * sizes and badges (the held and owed balances, over the whole ledger). A
 * grouped list and Reports' face run through the in-memory engine over at
 * most 5,000 rows. Kind and Item are passed here; Site and When are also columns.
 */

const LIST = EMPTIES_REPORTS[0]!.list!;

type Filters = { kind?: string; item?: string; site?: string; when?: string; supplier?: string; q?: string };

/** The kinds a Kind value stands for; Reports' "Returns and credits" (`supplier`) is both supplier kinds. */
function kindsOf(value: string | undefined): RetailEmptiesKind[] | null {
  if (!value || value === "any") return null;
  if (value === "supplier") return OWED_KINDS;
  const kind = EMPTIES_KINDS.find((candidate) => candidate.value === value);
  return kind ? [kind.code] : null;
}

const TAB_KINDS: Record<string, RetailEmptiesKind[] | null> = { ledger: null, held: HELD_KINDS, owed: OWED_KINDS };

const FROM = Prisma.sql`
  FROM "RetailEmptiesEntry" e
  JOIN "Site" s ON s.id = e."siteId"
  LEFT JOIN "Customer" c ON c.id = e."customerId"
  LEFT JOIN "RetailGoodsReceipt" g ON g.id = e."goodsReceiptId"
  LEFT JOIN "Vendor" v ON v.id = e."supplierId"`;

/** What the Who column reads, in SQL so search finds it. */
const WHO = Prisma.sql`CASE
  WHEN e."saleId" IS NOT NULL OR (e.kind::text IN ('DEPOSIT_CHARGED', 'DEPOSIT_REFUNDED') AND e.reference IS NOT NULL) THEN 'Sale ' || e.reference
  WHEN e.kind::text IN ('DEPOSIT_CHARGED', 'DEPOSIT_REFUNDED') THEN coalesce(e.note, 'At the till')
  WHEN e.kind::text = 'BOTTLES_BACK' THEN coalesce(c.name, 'A customer')
  WHEN g."receiptNo" IS NOT NULL THEN coalesce(v.name, e."supplierName", 'A supplier') || ', ' || g."receiptNo"
  WHEN e.reference IS NOT NULL THEN coalesce(v.name, e."supplierName", 'A supplier') || ', ' || e.reference
  WHEN e.note IS NOT NULL THEN coalesce(v.name, e."supplierName", 'A supplier') || ', ' || lower(left(e.note, 1)) || substr(e.note, 2)
  ELSE coalesce(v.name, e."supplierName", 'A supplier')
END`;

function whereFor(companyId: string, filters: Filters, tab: string | null, now = new Date()): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`e."companyId" = ${companyId}`];
  const tabKinds = tab ? TAB_KINDS[tab] : null;
  if (tabKinds) parts.push(Prisma.sql`e.kind::text IN (${Prisma.join(tabKinds)})`);
  const kinds = kindsOf(filters.kind);
  if (kinds) parts.push(Prisma.sql`e.kind::text IN (${Prisma.join(kinds)})`);
  if (filters.item === "bottles") parts.push(Prisma.sql`e.bottles <> 0`);
  if (filters.item === "crates") parts.push(Prisma.sql`e.crates <> 0`);
  if (filters.site && filters.site !== "any") parts.push(Prisma.sql`e."siteId" = ${filters.site}`);
  if (filters.supplier && filters.supplier !== "any") parts.push(Prisma.sql`e."supplierId" = ${filters.supplier}`);
  const range = filters.when ? periodInstants(filters.when, now, DEFAULT_TIME_ZONE) : undefined;
  if (range?.gte) parts.push(Prisma.sql`e."createdAt" >= ${range.gte}`);
  if (range?.lt) parts.push(Prisma.sql`e."createdAt" < ${range.lt}`);
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    parts.push(
      Prisma.sql`((${WHO}) ILIKE ${like} OR e.reference ILIKE ${like} OR c.name ILIKE ${like} OR coalesce(v.name, e."supplierName") ILIKE ${like})`,
    );
  }
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

function orderFor(sort: string): Prisma.Sql {
  return sort === "oldest" || sort === "at:asc"
    ? Prisma.sql`ORDER BY e."createdAt" ASC, e.id ASC`
    : Prisma.sql`ORDER BY e."createdAt" DESC, e.id DESC`;
}

type EntryRow = {
  id: string;
  at: Date;
  kind: RetailEmptiesKind;
  bottles: number;
  crates: number;
  deposit: Prisma.Decimal;
  bottlesAfter: number;
  cratesAfter: number;
  saleId: string | null;
  goodsReceiptId: string | null;
  reference: string | null;
  customer: string | null;
  supplierId: string | null;
  supplier: string | null;
  siteId: string;
  site: string;
  who: string;
  /** On a return: what the supplier still owes on it. */
  owed: Prisma.Decimal | null;
};

async function selectRows(where: Prisma.Sql, order: Prisma.Sql, limit: number, offset = 0): Promise<EntryRow[]> {
  return prisma.$queryRaw<EntryRow[]>`
    SELECT e.id, e."createdAt" AS at, e.kind, e.bottles, e.crates, e.deposit,
           e."bottlesAfter" AS "bottlesAfter", e."cratesAfter" AS "cratesAfter",
           e."saleId" AS "saleId", e."goodsReceiptId" AS "goodsReceiptId",
           coalesce(g."receiptNo", e.reference) AS reference, c.name AS customer,
           e."supplierId" AS "supplierId", coalesce(v.name, e."supplierName") AS supplier,
           s.id AS "siteId", s.name AS site, ${WHO} AS who,
           CASE WHEN e.kind::text = 'RETURNED_TO_SUPPLIER'
                THEN e.deposit + coalesce((SELECT sum(cr.deposit) FROM "RetailEmptiesEntry" cr WHERE cr."returnId" = e.id), 0)
           END AS owed
    ${FROM}
    ${where}
    ${order}
    LIMIT ${limit} OFFSET ${offset}`;
}

const LABELS = Object.fromEntries(EMPTIES_KINDS.map((kind) => [kind.code, kind.label])) as Record<RetailEmptiesKind, string>;

/** "+24", "−2", blank at nought. */
const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "");

export function toListRow(row: EntryRow): ReportRow {
  const at = row.at.toISOString();
  const deposit = num(row.deposit) ?? 0;
  const owed = num(row.owed);
  const items = [signed(row.bottles), signed(row.crates)].filter(Boolean).join(" · ");
  return {
    id: row.id,
    at,
    when: at,
    day: dayKey(row.at, DEFAULT_TIME_ZONE),
    whenText: formatWhen(row.at),
    kind: LABELS[row.kind],
    kindCode: row.kind,
    who: row.who,
    customer: row.customer,
    supplier: row.supplier,
    supplierId: row.supplierId,
    // Blank when nought: a deposit charged moves no empties (30-stock OQ 5).
    bottles: row.bottles || null,
    crates: row.crates || null,
    deposit,
    inStore: `${row.bottlesAfter} · ${row.cratesAfter}`,
    items: items || "—",
    reference: row.reference,
    saleId: row.saleId,
    goodsReceiptId: row.goodsReceiptId,
    site: row.site,
    siteId: row.siteId,
    creditable: owed !== null && owed > 0 ? "yes" : null,
    entries: 1,
  };
}

function filtersOf(params: ReportParams): Filters {
  return { kind: params.kind, item: params.item, site: params.site, when: params.when, supplier: params.supplier };
}

async function loadEmpties(ctx: ReportContext, params: ReportParams) {
  const rows = await selectRows(whereFor(ctx.companyId, filtersOf(params), null), orderFor("newest"), TAKE);
  return result(rows.map(toListRow));
}

/**
 * "In the store" for the Σ row: the latest afters at each site the filters
 * cover, added up — with one site, that site's own figure.
 */
async function inStoreTotal(ctx: ReportContext, site: string | undefined): Promise<string> {
  const siteId = site && site !== "any" ? site : null;
  const [row] = await prisma.$queryRaw<Array<{ bottles: number | null; crates: number | null }>>`
    SELECT sum(last."bottlesAfter")::int AS bottles, sum(last."cratesAfter")::int AS crates
    FROM (
      SELECT DISTINCT ON (e."siteId") e."bottlesAfter", e."cratesAfter"
      FROM "RetailEmptiesEntry" e
      WHERE e."companyId" = ${ctx.companyId} ${siteId ? Prisma.sql`AND e."siteId" = ${siteId}` : Prisma.empty}
      ORDER BY e."siteId", e."createdAt" DESC, e.id DESC
    ) last`;
  return `${row?.bottles ?? 0} · ${row?.crates ?? 0}`;
}

/** The tabs' sizes and money badges, over the whole ledger (search and filters do not narrow a tab). */
async function tabFigures(ctx: ReportContext) {
  const rows = await prisma.retailEmptiesEntry.groupBy({ by: ["kind"], where: { companyId: ctx.companyId }, _count: { _all: true }, _sum: { deposit: true } });
  const of = (kinds: RetailEmptiesKind[] | null) => {
    const picked = kinds ? rows.filter((row) => kinds.includes(row.kind)) : rows;
    return {
      count: picked.reduce((sum, row) => sum + row._count._all, 0),
      sum: picked.reduce((sum, row) => sum + Math.round((num(row._sum.deposit) ?? 0) * 100), 0) / 100,
    };
  };
  const tabs: Record<string, number> = {};
  const tabSums: Record<string, number> = {};
  for (const [key, kinds] of Object.entries(TAB_KINDS)) {
    const figures = of(kinds);
    tabs[key] = figures.count;
    tabSums[key] = figures.sum;
  }
  return { tabs, tabSums, everEmpty: tabs.ledger === 0 };
}

type Totals = { total: number; bottles: number | null; crates: number | null };

async function pageEmpties(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const figures = await tabFigures(ctx);
  if (query.group) {
    // Grouped by what happened: the in-memory engine over the loaded rows.
    const loaded = await loadEmpties(ctx, loaderParams(query));
    const run = runList(LIST, loaded.rows, query, { role: ctx.role, userId: ctx.userId, now, timeZone: DEFAULT_TIME_ZONE, can: () => false, seeCost: true });
    return {
      ...run.result,
      totals: { ...run.result.totals, inStore: await inStoreTotal(ctx, query.filters.site) },
      tabs: figures.tabs,
      tabSums: figures.tabSums,
      truncated: loaded.truncated,
    };
  }

  const where = whereFor(ctx.companyId, { ...filtersOf(query.filters), q: query.q }, query.tab, now);
  const [sums] = await prisma.$queryRaw<Totals[]>`
    SELECT count(*)::int AS total, sum(e.bottles)::int AS bottles, sum(e.crates)::int AS crates
    ${FROM}
    ${where}`;
  const total = sums?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / query.size));
  const page = Math.min(Math.max(1, query.page), pages);
  const rows = total ? await selectRows(where, orderFor(query.sort), query.size, (page - 1) * query.size) : [];
  return {
    total,
    pages,
    page,
    rows: rows.map(toListRow),
    groups: null,
    totals: { bottles: sums?.bottles ?? 0, crates: sums?.crates ?? 0, inStore: await inStoreTotal(ctx, query.filters.site) },
    summary: {},
    tabs: figures.tabs,
    tabSums: figures.tabSums,
    everEmpty: figures.everEmpty,
    truncated: false,
  };
}

async function emptiesOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const [sites, suppliers] = await Promise.all([
    prisma.site.findMany({ where: { companyId: ctx.companyId, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.vendor.findMany({
      where: { companyId: ctx.companyId, emptiesEntries: { some: {} } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    site: sites.map((site) => ({ value: site.id, label: site.name })),
    supplier: suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name })),
  };
}

export const EMPTIES_LOADERS: Record<string, ReportLoader> = {
  "retail-empties": { load: loadEmpties, page: pageEmpties, options: emptiesOptions },
};
