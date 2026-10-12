import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { loadLoyaltySettings, type LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { isTopTier, sortTiers, type LoyaltyTier } from "@/lib/retail/loyalty/tiers";
import { PEOPLE_USER_ROLES } from "@/lib/retail/people/roles";
import { todayIn } from "@/lib/workspace/format";

/**
 * A customer's figures, one definition (60-customers, CUS-02): the list, the
 * record, the till and Insights all read them from here.
 *
 * - 12 months: [now − 365 days, now].
 * - Spend, 12 months: the floor's takings over the customer's sales (posted
 *   or voided), voids and refunds in the window, so a voided sale nets to 0.
 * - Visits: their SALE documents in the window that were not voided.
 * - Last visit: the newest not-voided SALE, ever.
 * - Points: Σ of their points ledger, ever; Worth: floor2(points × value).
 * - Tier: a live held tier, else the highest the spend reaches (`tierFor`).
 * - Staff: an active person of the shop with a retail role on the same number.
 *
 * Worked out in SQL (`figuresSql`), so a list can filter, sort and total over
 * every customer without loading them.
 */

export const YEAR_MS = 365 * 86_400_000;

export type CustomerFigures = {
  id: string;
  name: string;
  phone: string | null;
  code: string | null;
  cardNo: string | null;
  marketingConsent: boolean;
  dateOfBirth: Date | null;
  priceListId: string | null;
  createdAt: Date;
  spend12m: number;
  visits: number;
  lastVisitAt: Date | null;
  points: number;
  worth: number;
  tier: string | null;
  staff: boolean;
  account: boolean;
};

/** The tier as SQL over `c` (the customer) and `spend12m`, mirroring `tierFor`. */
function tierSql(tiers: LoyaltyTier[], today: string, spend: Prisma.Sql): Prisma.Sql {
  const sorted = sortTiers(tiers);
  if (sorted.length === 0) return Prisma.sql`NULL::text`;
  const names = sorted.map((tier) => tier.name);
  const reached = [...sorted]
    .reverse()
    .map((tier) => Prisma.sql`WHEN ${spend} >= ${new Prisma.Decimal(tier.from)} THEN ${tier.name}::text`);
  return Prisma.sql`CASE
    WHEN c."tierHeld" IS NOT NULL AND c."tierHeldUntil" >= ${today}::date AND c."tierHeld" IN (${Prisma.join(names)}) THEN c."tierHeld"
    ${Prisma.join(reached, " ")}
    ELSE NULL END`;
}

/**
 * `figures AS (…)`: one row per live customer of the company (not in the bin,
 * not merged away) with every figure above. `ids` narrows it to some.
 */
export function figuresSql(input: {
  companyId: string;
  now: Date;
  tiers: LoyaltyTier[];
  ids?: string[];
}): Prisma.Sql {
  const { companyId, now } = input;
  const from = new Date(now.getTime() - YEAR_MS);
  const only = input.ids ? Prisma.sql`AND c.id IN (${Prisma.join(input.ids.length ? input.ids : [""])})` : Prisma.empty;
  const onlySales = input.ids ? Prisma.sql`AND s."customerId" IN (${Prisma.join(input.ids.length ? input.ids : [""])})` : Prisma.empty;
  const spend = Prisma.sql`coalesce(sa.spend12m, 0)`;
  return Prisma.sql`
    sales AS (
      SELECT s."customerId" AS cid,
             sum(s."baseAmount") FILTER (WHERE s."postedAt" >= ${from} AND s."postedAt" <= ${now}) AS spend12m,
             count(*) FILTER (WHERE s."saleType" = 'SALE' AND s.status <> 'VOIDED' AND s."postedAt" >= ${from} AND s."postedAt" <= ${now})::int AS visits,
             max(s."postedAt") FILTER (WHERE s."saleType" = 'SALE' AND s.status <> 'VOIDED') AS "lastVisitAt"
      FROM "RetailSale" s
      WHERE s."companyId" = ${companyId} AND s."customerId" IS NOT NULL AND s."saleType" IN ('SALE', 'REFUND', 'VOID') ${onlySales}
      GROUP BY s."customerId"
    ),
    pts AS (
      SELECT p."customerId" AS cid, sum(p.points)::int AS points
      FROM "RetailPointsEntry" p
      WHERE p."companyId" = ${companyId}
      GROUP BY p."customerId"
    ),
    staff AS (
      SELECT DISTINCT regexp_replace(u.phone, '\\D', '', 'g') AS digits
      FROM "User" u
      WHERE u."companyId" = ${companyId} AND u."isActive" AND u.phone IS NOT NULL
        AND u.role::text IN (${Prisma.join(PEOPLE_USER_ROLES)})
    ),
    figures AS (
      SELECT c.id, c.name, c.phone, c.code, c."cardNo", c."marketingConsent", c."dateOfBirth", c."priceListId", c."createdAt",
             ${spend} AS spend12m,
             coalesce(sa.visits, 0) AS visits,
             sa."lastVisitAt",
             coalesce(pt.points, 0) AS points,
             ${tierSql(input.tiers, todayIn(undefined, now), spend)} AS tier,
             (c.phone IS NOT NULL AND regexp_replace(c.phone, '\\D', '', 'g') IN (SELECT digits FROM staff)) AS staff,
             false AS account
      FROM "Customer" c
      LEFT JOIN sales sa ON sa.cid = c.id
      LEFT JOIN pts pt ON pt.cid = c.id
      WHERE c."companyId" = ${companyId} AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL ${only}
    )`;
}

export type FiguresRow = Omit<CustomerFigures, "worth" | "spend12m"> & { spend12m: Prisma.Decimal | number | string };

const floor2 = (value: number) => Math.floor(value * 100 + 1e-9) / 100;

/** Worth of a balance: floor2(points × point value). */
export function pointsWorth(points: number, pointValue: number): number {
  return points > 0 ? floor2(points * pointValue) : 0;
}

export function withWorth(row: FiguresRow, settings: Pick<LoyaltySettings, "pointValue">): CustomerFigures {
  const spend12m = Math.round(Number(row.spend12m.toString()) * 100) / 100;
  return { ...row, spend12m, points: Number(row.points), visits: Number(row.visits), worth: pointsWorth(Number(row.points), settings.pointValue) };
}

/** The figures of some customers (the till's search, a record), in the order of `ids`. */
export async function customerFigures(
  companyId: string,
  ids: string[],
  options: { now?: Date; settings?: LoyaltySettings } = {},
): Promise<CustomerFigures[]> {
  if (ids.length === 0) return [];
  const now = options.now ?? new Date();
  const settings = options.settings ?? (await loadLoyaltySettings(companyId));
  const rows = await prisma.$queryRaw<FiguresRow[]>`
    WITH ${figuresSql({ companyId, now, tiers: settings.tiers, ids })}
    SELECT * FROM figures`;
  const byId = new Map(rows.map((row) => [row.id, withWorth(row, settings)]));
  return ids.map((id) => byId.get(id)).filter((row): row is CustomerFigures => Boolean(row));
}

/** Whether the customer's tier is the top one (the list's gold badge). */
export function isTopTierName(tier: string | null, settings: Pick<LoyaltySettings, "tiers">): boolean {
  return isTopTier(tier, settings.tiers);
}

/**
 * The search the lookup, the till and the list share: digits (four or more)
 * end the phone or are in the card number, a code ("CUS-00141"), or the name
 * contains the words. Over the alias `c` (a customer row, or `figures`).
 */
export function customerSearchSql(q: string, alias = "c"): Prisma.Sql | null {
  const text = q.trim();
  if (!text) return null;
  const a = Prisma.raw(alias);
  const like = `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const parts: Prisma.Sql[] = [Prisma.sql`${a}.name ILIKE ${like}`, Prisma.sql`${a}.code ILIKE ${like}`];
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 4 && /^[\d\s+()-]+$/.test(text)) {
    const local = digits.replace(/^0+/, "");
    parts.push(Prisma.sql`regexp_replace(coalesce(${a}.phone, ''), '\\D', '', 'g') LIKE ${`%${local}`}`);
    parts.push(Prisma.sql`${a}."cardNo" LIKE ${`%${digits}%`}`);
  }
  return Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

/** Live customers matching `q`, A–Z, at most `limit`: the ids the lookup and the till show. */
export async function searchCustomerIds(companyId: string, q: string, limit: number): Promise<string[]> {
  const where = customerSearchSql(q);
  if (!where) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c.id FROM "Customer" c
    WHERE c."companyId" = ${companyId} AND c."archivedAt" IS NULL AND c."mergedIntoId" IS NULL AND ${where}
    ORDER BY c.name ASC, c.id ASC
    LIMIT ${limit}`;
  return rows.map((row) => row.id);
}

/** Whether `phone` is an active retail person's number at the shop (the price engine's Staff). */
export async function isStaffPhone(companyId: string, phone: string | null): Promise<boolean> {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return false;
  const rows = await prisma.$queryRaw<Array<{ any: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM "User" u
      WHERE u."companyId" = ${companyId} AND u."isActive" AND u.phone IS NOT NULL
        AND u.role::text IN (${Prisma.join(PEOPLE_USER_ROLES)})
        AND regexp_replace(u.phone, '\\D', '', 'g') = ${digits}
    ) AS any`;
  return rows[0]?.any === true;
}
