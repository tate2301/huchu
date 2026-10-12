import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { CUSTOMER_REPORTS } from "@/lib/reports/definitions/retail/customers";
import { loaderParams, runList } from "@/lib/reports/list-query";
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
import { customerSearchSql, figuresSql, pointsWorth } from "@/lib/retail/customers/stats";
import { isoWeekday } from "@/lib/retail/loyalty/dates";
import { loadLoyaltySettings, type LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { isTopTier } from "@/lib/retail/loyalty/tiers";
import { phoneDisplay, phoneSearchText } from "@/lib/retail/people/words";
import { addDays, dayKey, DEFAULT_TIME_ZONE, formatCount, todayIn } from "@/lib/workspace/format";

/**
 * Customers (CUS-02, `retail-customers`): every live customer with the
 * figures of `lib/retail/customers/stats.ts`.
 *
 * The page is one SQL statement over the `figures` CTE: search, the four
 * filters, the sort, the page, and with window functions the count and the
 * totals (visits, points, spend) over every filtered customer, never the page
 * added up. A grouped list (by tier or last visit) runs through the in-memory
 * engine over at most 5,000 rows, as `load` gives them to "Select all" and
 * the export of ticked rows.
 */

const LIST = CUSTOMER_REPORTS[0]!.list!;
const DAY_MS = 86_400_000;

type Filters = { tier?: string; lastVisit?: string; messages?: string; account?: string; q?: string };

type FigureRow = {
  id: string;
  name: string;
  phone: string | null;
  code: string | null;
  cardNo: string | null;
  marketingConsent: boolean;
  createdAt: Date;
  spend12m: Prisma.Decimal;
  visits: number;
  lastVisitAt: Date | null;
  points: number;
  tier: string | null;
  account: boolean;
  total?: number;
  totalVisits?: Prisma.Decimal | null;
  totalPoints?: Prisma.Decimal | null;
  totalSpend?: Prisma.Decimal | null;
};

function whereFor(filters: Filters, now: Date): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filters.tier && filters.tier !== "any") parts.push(Prisma.sql`f.tier = ${filters.tier}`);
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
  switch (filters.lastVisit) {
    case "in-30":
      parts.push(Prisma.sql`f."lastVisitAt" > ${ago(30)}`);
      break;
    case "30-90":
      parts.push(Prisma.sql`f."lastVisitAt" <= ${ago(30)} AND f."lastVisitAt" > ${ago(91)}`);
      break;
    case "over-90":
      parts.push(Prisma.sql`f."lastVisitAt" <= ${ago(91)}`);
      break;
    case "never":
      parts.push(Prisma.sql`f."lastVisitAt" IS NULL`);
      break;
  }
  if (filters.messages === "agreed") parts.push(Prisma.sql`f."marketingConsent"`);
  if (filters.messages === "not-agreed") parts.push(Prisma.sql`NOT f."marketingConsent"`);
  if (filters.account === "has") parts.push(Prisma.sql`f.account`);
  if (filters.account === "none") parts.push(Prisma.sql`NOT f.account`);
  const search = customerSearchSql(filters.q ?? "", "f");
  if (search) parts.push(search);
  return Prisma.sql`WHERE ${Prisma.join(parts, " AND ")}`;
}

const SORTS: Record<string, Prisma.Sql> = {
  spent: Prisma.sql`f.spend12m DESC, f.name ASC, f.id ASC`,
  visits: Prisma.sql`f.visits DESC, f.name ASC, f.id ASC`,
  points: Prisma.sql`f.points DESC, f.name ASC, f.id ASC`,
  "last-visit": Prisma.sql`f."lastVisitAt" DESC NULLS LAST, f.name ASC, f.id ASC`,
  longest: Prisma.sql`f."lastVisitAt" ASC NULLS FIRST, f.name ASC, f.id ASC`,
  name: Prisma.sql`f.name ASC, f.id ASC`,
  newest: Prisma.sql`f."createdAt" DESC, f.id DESC`,
};

/** A named sort, or a column's header sort ("visits:asc"). */
function orderFor(sort: string): Prisma.Sql {
  if (SORTS[sort]) return Prisma.sql`ORDER BY ${SORTS[sort]}`;
  const [column, dir] = sort.split(":");
  const sql: Record<string, Prisma.Sql> = {
    name: Prisma.sql`f.name`,
    phone: Prisma.sql`f.phone`,
    tier: Prisma.sql`f.tier`,
    visits: Prisma.sql`f.visits`,
    lastVisitAt: Prisma.sql`f."lastVisitAt"`,
    points: Prisma.sql`f.points`,
    spend12m: Prisma.sql`f.spend12m`,
  };
  const by = column ? sql[column] : undefined;
  if (!by) return Prisma.sql`ORDER BY ${SORTS.spent!}`;
  return dir === "asc" ? Prisma.sql`ORDER BY ${by} ASC NULLS FIRST, f.id ASC` : Prisma.sql`ORDER BY ${by} DESC NULLS LAST, f.id ASC`;
}

function visitBand(daysSince: number | null): string {
  if (daysSince === null) return "Never";
  if (daysSince < 30) return "In the last 30 days";
  if (daysSince <= 90) return "30 to 90 days ago";
  return "Over 90 days ago";
}

export function toCustomerRow(row: FigureRow, settings: LoyaltySettings, now: Date): ReportRow {
  const today = todayIn(undefined, now);
  const monday = addDays(today, 1 - isoWeekday(today));
  const monthStart = `${today.slice(0, 8)}01`;
  const lastDay = row.lastVisitAt ? dayKey(row.lastVisitAt, DEFAULT_TIME_ZONE) : null;
  const daysSince = row.lastVisitAt ? Math.floor((now.getTime() - row.lastVisitAt.getTime()) / DAY_MS) : null;
  const spend = Math.round((num(row.spend12m) ?? 0) * 100) / 100;
  const visits = Number(row.visits);
  const points = Number(row.points);
  const phone = row.phone ? phoneDisplay(row.phone) : null;
  return {
    id: row.id,
    name: row.name,
    phone,
    phoneSearch: phoneSearchText(row.phone),
    code: row.code,
    cardNo: row.cardNo,
    tier: row.tier,
    tierTone: isTopTier(row.tier, settings.tiers) ? "gold" : "neutral",
    visits,
    visitsWords: `${formatCount(visits)} ${visits === 1 ? "visit" : "visits"}`,
    lastVisitAt: lastDay,
    daysSince,
    visitBand: visitBand(daysSince),
    points,
    worth: pointsWorth(points, settings.pointValue),
    spend12m: spend,
    consent: row.marketingConsent ? "yes" : "no",
    account: row.account ? "yes" : "no",
    createdAt: row.createdAt.toISOString(),
    // Reports' face (70-insights-reports 5.14).
    lastVisit: lastDay,
    spend12: spend,
    owed: null,
    customers: 1,
    thisWeek: lastDay && lastDay >= monday ? "yes" : null,
    thisMonth: lastDay && lastDay >= monthStart ? "yes" : null,
    notIn30: daysSince === null || daysSince >= 30 ? "yes" : null,
    notIn90: daysSince === null || daysSince >= 90 ? "yes" : null,
  };
}

function filtersOf(params: ReportParams): Filters {
  return { tier: params.tier, lastVisit: params.lastVisit, messages: params.messages, account: params.account };
}

/** Every live customer the filters keep (at most 5,000), for the in-memory engine. */
async function loadCustomers(ctx: ReportContext, params: ReportParams) {
  const now = new Date();
  const settings = await loadLoyaltySettings(ctx.companyId);
  const rows = await prisma.$queryRaw<FigureRow[]>`
    WITH ${figuresSql({ companyId: ctx.companyId, now, tiers: settings.tiers })}
    SELECT f.* FROM figures f
    ${whereFor(filtersOf(params), now)}
    ${orderFor("spent")}
    LIMIT ${TAKE}`;
  return result(rows.map((row) => toCustomerRow(row, settings, now)));
}

async function pageCustomers(ctx: ReportContext, query: ResolvedListQuery): Promise<ListPageResult> {
  const now = new Date();
  const settings = await loadLoyaltySettings(ctx.companyId);
  if (query.group) {
    const loaded = await loadCustomers(ctx, loaderParams(query));
    const run = runList(LIST, loaded.rows, query, {
      role: ctx.role,
      userId: ctx.userId,
      now,
      timeZone: DEFAULT_TIME_ZONE,
      can: () => false,
      seeCost: true,
    });
    return { ...run.result, truncated: loaded.truncated };
  }

  const where = whereFor({ ...filtersOf(query.filters), q: query.q }, now);
  const select = (offset: number) => prisma.$queryRaw<FigureRow[]>`
    WITH ${figuresSql({ companyId: ctx.companyId, now, tiers: settings.tiers })}
    SELECT f.*,
           count(*) OVER ()::int AS total,
           sum(f.visits) OVER () AS "totalVisits",
           sum(f.points) OVER () AS "totalPoints",
           sum(f.spend12m) OVER () AS "totalSpend"
    FROM figures f
    ${where}
    ${orderFor(query.sort)}
    LIMIT ${query.size} OFFSET ${offset}`;
  let page = Math.max(1, query.page);
  let rows = await select((page - 1) * query.size);
  if (rows.length === 0 && page > 1) {
    // Past the end: the last page there is.
    const [first] = await select(0);
    page = Math.max(1, Math.ceil((first?.total ?? 0) / query.size));
    rows = first ? await select((page - 1) * query.size) : [];
  }
  const head = rows[0];
  const total = head?.total ?? 0;
  const everEmpty =
    total > 0
      ? false
      : (await prisma.customer.count({ where: { companyId: ctx.companyId, archivedAt: null, mergedIntoId: null } })) === 0;

  return {
    total,
    pages: Math.max(1, Math.ceil(total / query.size)),
    page,
    rows: rows.map((row) => toCustomerRow(row, settings, now)),
    groups: null,
    totals: {
      visits: num(head?.totalVisits) ?? 0,
      points: num(head?.totalPoints) ?? 0,
      spend12m: Math.round((num(head?.totalSpend) ?? 0) * 100) / 100,
    },
    summary: {},
    tabs: null,
    everEmpty,
    truncated: false,
  };
}

async function customerOptions(ctx: ReportContext): Promise<Record<string, ReportOption[]>> {
  const settings = await loadLoyaltySettings(ctx.companyId);
  return { tier: settings.tiers.map((tier) => ({ value: tier.name, label: tier.name })) };
}

export const CUSTOMER_LOADERS: Record<string, ReportLoader> = {
  "retail-customers": { load: loadCustomers, page: pageCustomers, options: customerOptions },
};
