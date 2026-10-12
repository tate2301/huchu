import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { binState, type BinState } from "@/lib/retail/bin";
import { loadLoyaltySettings, type LoyaltySettings } from "@/lib/retail/loyalty/settings";
import { rateWords } from "@/lib/retail/loyalty/format";
import { isTopTier, tierFor } from "@/lib/retail/loyalty/tiers";
import { phoneDisplay } from "@/lib/retail/people/words";
import { formatCount, todayIn } from "@/lib/workspace/format";

import {
  customerKpis,
  customerMeter,
  isStaffPhone,
  pointsWorth,
  usuallyBuys,
  YEAR_MS,
  type CustomerKpi,
  type CustomerMeter,
  type UsuallyBuys,
} from "./stats";

/**
 * A customer as their record reads them (CUS-03, packet 61,
 * `CustomerRecordView`): who they are, their tier and points, the five
 * figures, the meter, what they usually buy, their tabs' counts and what the
 * viewer may do. A binned customer reads too, with `binned`.
 */

export const CUSTOMER_NOT_FOUND = "Customer not found";

export type CustomerViewer = {
  update: boolean;
  delete: boolean;
  activity: boolean;
};

export type CustomerRecordView = {
  id: string;
  code: string | null;
  name: string;
  /** E.164 and as shown ("+263 77 412 3388"). */
  phone: string | null;
  phoneDisplay: string;
  /** Null: the same number as the phone. */
  whatsapp: string | null;
  whatsappDisplay: string | null;
  email: string | null;
  area: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  /** Null when no birthday is on file. */
  adult: boolean | null;
  marketingConsent: boolean;
  memberSince: string;
  cardNo: string | null;
  staff: boolean;
  tier: { name: string | null; isTop: boolean; heldUntil: string | null; bySpend: string | null };
  /** Every tier, lowest first (the edit sheet's choices). */
  tiers: string[];
  priceList: { id: string; name: string } | null;
  /** `pointValue`: what a point is worth in US$; `enabled`: loyalty is on. */
  points: { balance: number; worth: number; canSpend: boolean; spendFrom: number; pointValue: number; enabled: boolean };
  kpis: CustomerKpi[];
  meter: CustomerMeter;
  usually: UsuallyBuys;
  loyalty: { earns: string; worth: string; expiry: string };
  /** Packet 66's account; none yet. */
  account: null;
  counts: { points12m: number; purchases: number; notes: number; laybys: number; accountLines: number };
  /** The day the 12 months start, `YYYY-MM-DD` in the shop's zone (the ledger tab's period). */
  since12m: string;
  binned: BinState | null;
  mergedInto: { id: string; name: string } | null;
  can: {
    edit: boolean;
    adjustPoints: boolean;
    message: boolean;
    merge: boolean;
    bin: boolean;
    note: boolean;
    openAccount: boolean;
    changeAccount: boolean;
    takePayment: boolean;
    sendStatement: boolean;
    activity: boolean;
  };
};

type FactsRow = {
  spend12m: Prisma.Decimal | null;
  spendBefore: Prisma.Decimal | null;
  visits: number;
  visitsBefore: number;
  lastVisitAt: Date | null;
};

const num = (value: Prisma.Decimal | number | null | undefined) => (value === null || value === undefined ? 0 : Number(value.toString()));

/** Their sales' figures over the 12 months to `now` and the 365 days before, by `figuresSql`'s rules. */
async function salesFacts(companyId: string, customerId: string, now: Date) {
  const from = new Date(now.getTime() - YEAR_MS);
  const before = new Date(now.getTime() - 2 * YEAR_MS);
  const [row] = await prisma.$queryRaw<FactsRow[]>`
    SELECT sum(s."baseAmount") FILTER (WHERE s."postedAt" >= ${from} AND s."postedAt" <= ${now}) AS "spend12m",
           sum(s."baseAmount") FILTER (WHERE s."postedAt" >= ${before} AND s."postedAt" < ${from}) AS "spendBefore",
           count(*) FILTER (WHERE s."saleType" = 'SALE' AND s.status <> 'VOIDED' AND s."postedAt" >= ${from} AND s."postedAt" <= ${now})::int AS visits,
           count(*) FILTER (WHERE s."saleType" = 'SALE' AND s.status <> 'VOIDED' AND s."postedAt" >= ${before} AND s."postedAt" < ${from})::int AS "visitsBefore",
           max(s."postedAt") FILTER (WHERE s."saleType" = 'SALE' AND s.status <> 'VOIDED') AS "lastVisitAt"
    FROM "RetailSale" s
    WHERE s."companyId" = ${companyId} AND s."customerId" = ${customerId} AND s."saleType" IN ('SALE', 'REFUND', 'VOID')`;
  return {
    spend12m: Math.round(num(row?.spend12m) * 100) / 100,
    spendBefore: Math.round(num(row?.spendBefore) * 100) / 100,
    visits: row?.visits ?? 0,
    visitsBefore: row?.visitsBefore ?? 0,
    lastVisitAt: row?.lastVisitAt ?? null,
  };
}

/** The shelf products on most of their visits in 12 months (not open-price lines), and the tenders that paid them. */
async function buyingHabits(companyId: string, customerId: string, now: Date) {
  const from = new Date(now.getTime() - YEAR_MS);
  const [products, tenders] = await Promise.all([
    prisma.$queryRaw<Array<{ name: string; visits: number }>>`
      SELECT coalesce(p.name, l."itemName") AS name, count(DISTINCT s.id)::int AS visits
      FROM "RetailSaleLine" l
      JOIN "RetailSale" s ON s.id = l."saleId"
      LEFT JOIN "Product" p ON p.id = l."productId"
      WHERE s."companyId" = ${companyId} AND s."customerId" = ${customerId} AND s."saleType" = 'SALE' AND s.status <> 'VOIDED'
        AND s."postedAt" >= ${from} AND s."postedAt" <= ${now}
        -- A price typed at the till (airtime) tops a basket up; it is not something they come in for.
        AND coalesce(p."openPrice", false) = false
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
      LIMIT 2`,
    prisma.$queryRaw<Array<{ tender: string; visits: number }>>`
      SELECT pay."tenderType"::text AS tender, count(DISTINCT s.id)::int AS visits
      FROM "RetailSalePayment" pay
      JOIN "RetailSale" s ON s.id = pay."saleId"
      WHERE s."companyId" = ${companyId} AND s."customerId" = ${customerId} AND s."saleType" = 'SALE' AND s.status <> 'VOIDED'
        AND s."postedAt" >= ${from} AND s."postedAt" <= ${now}
      GROUP BY 1`,
  ]);
  return { products, tenders };
}

/** "1 point per US$1", "1.5 points per US$1". */
export const earnsWords = (rate: number) => `${rateWords(rate)} ${rate === 1 ? "point" : "points"} per US$1`;

/** "100 points = US$1.00". */
export const pointWorthWords = (pointValue: number) =>
  pointValue > 0 ? `${formatCount(Math.round(1 / pointValue))} points = US$1.00` : "Nothing";

const EXPIRY: Record<LoyaltySettings["expiry"], string> = { NEVER: "Never", AFTER_12_MONTHS: "After a year unused" };

const dayOf = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

/** Eighteen or older on `today`, from a birthday; null with none. */
export function isAdult(dateOfBirth: string | null, today: string): boolean | null {
  if (!dateOfBirth) return null;
  const year = Number(dateOfBirth.slice(0, 4)) + 18;
  return `${year}${dateOfBirth.slice(4)}` <= today;
}

export async function loadCustomerRecord(
  companyId: string,
  id: string,
  viewer: CustomerViewer,
  now: Date = new Date(),
): Promise<CustomerRecordView | null> {
  const customer = await prisma.customer.findFirst({
    where: { id, companyId },
    select: {
      id: true,
      code: true,
      name: true,
      phone: true,
      whatsapp: true,
      email: true,
      area: true,
      dateOfBirth: true,
      marketingConsent: true,
      createdAt: true,
      cardNo: true,
      tierHeld: true,
      tierHeldUntil: true,
      archivedAt: true,
      priceList: { select: { id: true, name: true, archivedAt: true } },
      mergedInto: { select: { id: true, name: true } },
    },
  });
  if (!customer) return null;

  const today = todayIn(undefined, now);
  const from12 = new Date(now.getTime() - YEAR_MS);
  const [settings, facts, habits, pointsSum, points12m, purchases, notes, laybys, staff, binned] = await Promise.all([
    loadLoyaltySettings(companyId),
    salesFacts(companyId, id, now),
    buyingHabits(companyId, id, now),
    prisma.retailPointsEntry.aggregate({ where: { companyId, customerId: id }, _sum: { points: true } }),
    prisma.retailPointsEntry.count({ where: { companyId, customerId: id, createdAt: { gte: from12, lte: now } } }),
    prisma.retailSale.count({ where: { companyId, customerId: id, saleType: { in: ["SALE", "REFUND", "VOID"] } } }),
    prisma.retailCustomerNote.count({ where: { companyId, customerId: id } }),
    prisma.retailLayby.count({ where: { companyId, customerId: id } }),
    isStaffPhone(companyId, customer.phone),
    binState(companyId, "Customer", id, customer.archivedAt, now),
  ]);

  const balance = pointsSum._sum.points ?? 0;
  const worth = pointsWorth(balance, settings.pointValue);
  const heldUntil = dayOf(customer.tierHeldUntil);
  const held = customer.tierHeld && heldUntil ? { name: customer.tierHeld, until: heldUntil } : null;
  const bySpend = tierFor({ spend12m: facts.spend12m, settings, held: null, today });
  const tier = tierFor({ spend12m: facts.spend12m, settings, held, today });
  const liveHold = held && tier === held.name && held.until >= today ? held.until : null;
  const isTop = isTopTier(tier, settings.tiers);
  const dateOfBirth = dayOf(customer.dateOfBirth);
  const live = !customer.archivedAt && !customer.mergedInto;

  return {
    id: customer.id,
    code: customer.code,
    name: customer.name,
    phone: customer.phone,
    phoneDisplay: phoneDisplay(customer.phone),
    whatsapp: customer.whatsapp,
    whatsappDisplay: customer.whatsapp ? phoneDisplay(customer.whatsapp) : null,
    email: customer.email,
    area: customer.area,
    dateOfBirth,
    adult: isAdult(dateOfBirth, today),
    marketingConsent: customer.marketingConsent,
    memberSince: customer.createdAt.toISOString(),
    cardNo: customer.cardNo,
    staff,
    tier: { name: tier, isTop, heldUntil: liveHold, bySpend },
    tiers: settings.tiers.map((entry) => entry.name),
    priceList: customer.priceList && !customer.priceList.archivedAt ? { id: customer.priceList.id, name: customer.priceList.name } : null,
    points: {
      balance,
      worth,
      canSpend: settings.enabled && balance >= settings.spendFrom,
      spendFrom: settings.spendFrom,
      pointValue: settings.pointValue,
      enabled: settings.enabled,
    },
    kpis: customerKpis({ ...facts, points: balance, worth, spendFrom: settings.spendFrom }, now),
    meter: customerMeter({ tiers: settings.tiers, spend12m: facts.spend12m, tier, heldUntil: liveHold }),
    usually: usuallyBuys({ visits: facts.visits, ...habits }),
    loyalty: {
      earns: earnsWords(isTop ? settings.topTierEarnPerDollar : settings.earnPerDollar),
      worth: pointWorthWords(settings.pointValue),
      expiry: EXPIRY[settings.expiry],
    },
    account: null,
    counts: { points12m, purchases, notes, laybys, accountLines: 0 },
    since12m: todayIn(undefined, from12),
    binned,
    mergedInto: customer.mergedInto,
    can: {
      edit: viewer.update && live,
      adjustPoints: viewer.update && live && settings.enabled,
      message: viewer.update && live && Boolean(customer.phone),
      merge: viewer.update && viewer.delete && live,
      bin: viewer.delete && live,
      note: viewer.update && live,
      openAccount: false,
      changeAccount: false,
      takePayment: false,
      sendStatement: false,
      activity: viewer.activity,
    },
  };
}
