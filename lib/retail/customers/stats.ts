import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { loadLoyaltySettings, type LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { isTopTier, sortTiers, type LoyaltyTier } from "@/lib/retail/loyalty/tiers";
import { PEOPLE_USER_ROLES } from "@/lib/retail/people/roles";
import { tenderLabel } from "@/lib/retail/words";
import {
  dayKey,
  daysBetween,
  formatCount,
  formatDay,
  formatMediumDay,
  formatMoney,
  formatShortDay,
  formatSigned,
  todayIn,
} from "@/lib/workspace/format";

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

/* ── A customer's record (CUS-03, packet 61) ─────────────────────────────── */

/**
 * What a record's figures are worked out from: the 12 months to now and the
 * 365 days before them ("the 12 before"), by the same rules as `figuresSql`.
 */
export type CustomerFacts = {
  spend12m: number;
  spendBefore: number;
  visits: number;
  visitsBefore: number;
  points: number;
  worth: number;
  /** The balance a customer needs before they may spend. */
  spendFrom: number;
  lastVisitAt: Date | null;
};

/** One of the record's five figures (00-foundations 5.6.4); the shape `RecordKpi` draws. */
export type CustomerKpi = {
  label: string;
  value: string;
  lead?: string;
  leadTone?: "ok" | "bad" | "warn" | "plain";
  note: string;
};

const MINUS = "−";
const cents2 = (value: number) => Math.round(value * 100) / 100;

/** Days apart in 12 months: 365 ÷ visits, one decimal. */
export const daysApart = (visits: number) => Math.round((365 / visits) * 10) / 10;

/** "15 Aug" this year, "15 Aug 2025" another, "Today" today. */
function lastVisitWords(at: Date, now: Date): string {
  const day = dayKey(at);
  const today = dayKey(now);
  if (day === today) return "Today";
  return day.slice(0, 4) === today.slice(0, 4) ? formatShortDay(at) : formatMediumDay(at);
}

/**
 * The record's five figures (60-customers §5.3): Spend, 12 months; Visits;
 * Average basket; Points; Last visit.
 */
export function customerKpis(facts: CustomerFacts, now: Date = new Date()): CustomerKpi[] {
  const { spend12m, spendBefore, visits, visitsBefore } = facts;

  const firstYear = spendBefore <= 0 && visitsBefore === 0;
  let spend: CustomerKpi;
  if (firstYear) spend = { label: "Spend, 12 months", value: formatMoney(spend12m), note: "their first year" };
  else {
    const pct = spendBefore > 0 ? Math.round((spend12m / spendBefore - 1) * 100) : 0;
    spend = {
      label: "Spend, 12 months",
      value: formatMoney(spend12m),
      lead: pct > 0 ? `+${pct}%` : pct < 0 ? `${MINUS}${-pct}%` : "0%",
      leadTone: pct > 0 ? "ok" : pct < 0 ? "bad" : "plain",
      note: "on the 12 before",
    };
  }

  const visitsKpi: CustomerKpi =
    visits < 2
      ? { label: "Visits", value: formatCount(visits), note: "too few to tell" }
      : { label: "Visits", value: formatCount(visits), lead: daysApart(visits).toFixed(1), leadTone: "plain", note: "days apart" };

  let basket: CustomerKpi;
  if (visits === 0) basket = { label: "Average basket", value: "—", note: "no visits yet" };
  else {
    const average = cents2(spend12m / visits);
    if (visitsBefore === 0) basket = { label: "Average basket", value: formatMoney(average), note: "their first year" };
    else {
      const delta = cents2(average - cents2(spendBefore / visitsBefore));
      basket = {
        label: "Average basket",
        value: formatMoney(average),
        lead: formatSigned(delta),
        leadTone: delta > 0 ? "ok" : delta < 0 ? "bad" : "plain",
        note: "on last year",
      };
    }
  }

  const points: CustomerKpi = {
    label: "Points",
    value: formatCount(facts.points),
    lead: formatMoney(facts.worth),
    leadTone: "plain",
    note: facts.points < facts.spendFrom ? `to spend from ${formatCount(facts.spendFrom)}` : "to spend",
  };

  let last: CustomerKpi;
  if (!facts.lastVisitAt) last = { label: "Last visit", value: "—", note: "no visits yet" };
  else {
    const usual = visits >= 2 ? Math.round(365 / visits) : null;
    const days = daysBetween(dayKey(facts.lastVisitAt), dayKey(now)) - 1;
    if (days <= 0) {
      last = { label: "Last visit", value: "Today", note: usual === null ? "today" : `usually ${usual} days apart` };
    } else {
      const late = usual !== null && days > 3 * usual && days >= 14;
      last = {
        label: "Last visit",
        value: lastVisitWords(facts.lastVisitAt, now),
        lead: formatCount(days),
        leadTone: late ? "warn" : "plain",
        note: usual === null ? (days === 1 ? "day ago" : "days ago") : `${days === 1 ? "day" : "days"} ago, usually ${usual}`,
      };
    }
  }

  return [spend, visitsKpi, basket, points, last];
}

/** "US$1,120": whole dollars, rounded down. */
const wholeDollars = (value: number) => formatMoney(Math.floor(value + 1e-9)).replace(/\.\d\d$/, "");

export type CustomerMeter = { label: string; value: string; pct: number; note: string };

/**
 * The rail's meter (60-customers §5.3): the way to the next tier by spend,
 * the top tier and what keeps it, or a tier held by hand. Loyalty's tiers are
 * by spend in 12 months and end at the top one (spec open question 2: no
 * Platinum, no points meter).
 */
export function customerMeter(input: {
  tiers: LoyaltyTier[];
  spend12m: number;
  /** The tier they are on: held, else by spend. */
  tier: string | null;
  /** A held tier's last day, `YYYY-MM-DD`, while it lasts. */
  heldUntil: string | null;
}): CustomerMeter {
  const tiers = sortTiers(input.tiers);
  const spend = input.spend12m;
  const top = tiers[tiers.length - 1] ?? null;
  const index = tiers.findIndex((tier) => tier.name === input.tier);
  const next = index >= 0 ? (tiers[index + 1] ?? null) : (tiers[0] ?? null);
  const name = input.tier ?? "No tier";

  const toward = (target: LoyaltyTier) => {
    const from = Number(target.from);
    return { value: `${wholeDollars(spend)} of ${wholeDollars(from)}`, pct: from > 0 ? Math.min(100, (spend / from) * 100) : 100 };
  };

  if (input.heldUntil) {
    const shown = next ? toward(next) : { value: `${wholeDollars(spend)} in 12 months`, pct: 100 };
    return {
      label: `${name}, held until ${formatDay(input.heldUntil)}`,
      ...shown,
      note: next ? `${name} whatever they spend until then.` : `Stays ${name} until then, whatever they spend.`,
    };
  }
  if (!next || (top && input.tier === top.name)) {
    return {
      label: `${name}, the top tier`,
      value: `${wholeDollars(spend)} in 12 months`,
      pct: 100,
      note: top ? `Stays ${top.name} while they spend ${wholeDollars(Number(top.from))} in 12 months.` : "",
    };
  }
  const gap = Math.max(0, Number(next.from) - spend);
  const monthly = spend / 12;
  const months = monthly > 0 ? Math.ceil(gap / monthly) : null;
  const pace = months === null ? "" : months <= 1 ? ", within a month at this rate" : `, about ${months} months at this rate`;
  return {
    label: `${name}, on the way to ${next.name}`,
    ...toward(next),
    note: `${wholeDollars(Math.ceil(gap))} more${pace}`,
  };
}

export type UsuallyBuys = { most: string; then: string; paysWith: string };

/**
 * "Usually buys" (60-customers §5.3): the products on the most and the next
 * most of their visits in 12 months, and how they pay: one way when it paid
 * at least half their visits ("EcoCash, mostly"), else the two most used.
 */
export function usuallyBuys(input: {
  visits: number;
  products: Array<{ name: string; visits: number }>;
  tenders: Array<{ tender: string; visits: number }>;
}): UsuallyBuys {
  if (input.visits === 0) return { most: "—", then: "—", paysWith: "—" };
  const products = [...input.products].sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name));
  const tenders = [...input.tenders].sort((a, b) => b.visits - a.visits || a.tender.localeCompare(b.tender));
  const word = (tender: string) => tenderLabel(tender);
  const lower = (label: string) => (label === "Cash" || label === "Card" ? label.toLowerCase() : label);
  const [first, second] = tenders;
  const paysWith = !first
    ? "—"
    : first.visits * 2 >= input.visits || !second
      ? `${word(first.tender)}, mostly`
      : `${word(first.tender)} or ${lower(word(second.tender))}`;
  return { most: products[0]?.name ?? "—", then: products[1]?.name ?? "—", paysWith };
}
