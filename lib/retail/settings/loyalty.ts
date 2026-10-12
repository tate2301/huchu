import { Prisma, type RetailPointsExpiry } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { expiryPreview } from "@/lib/retail/loyalty/expire";
import { earnWords, pointValueWords, pointsWords } from "@/lib/retail/loyalty/format";
import { loyaltyToday } from "@/lib/retail/loyalty/dates";
import { loadLoyaltySettings } from "@/lib/retail/loyalty/settings";
import { parseTier, sortTiers, tierTag } from "@/lib/retail/loyalty/tiers";
import { loadShopProfile } from "@/lib/retail/shop-profile";
import { EXPIRY_WORDS, firstNumber, TOP_TIER_EARNS_LESS } from "@/lib/retail/settings-pages/loyalty";
import { formatCount, formatMoney } from "@/lib/workspace/format";

import { SettingsRefused, type SettingsStore } from "./types";

/**
 * The Loyalty page's values (W-48): `RetailLoyaltySettings` in the board's
 * words ("1 point for each US$1", "Gold, from US$1,500"), the liquor switch
 * that draws "Points can pay for alcohol", and the aside read off the points
 * ledger: the last 30 days, and what turning expiry on would take tonight.
 */

const DAY_MS = 86_400_000;

export type LoyaltyLast30 = { lines: string[] };

/** "412 customers earned 38,204 points.", "96 spent 21,400 points, US$214.00 off.", "Members spent 2.3 times more a visit." */
export async function lastThirtyDays(companyId: string, now: Date = new Date()): Promise<LoyaltyLast30> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [earned, spent, baskets] = await Promise.all([
    prisma.$queryRaw<Array<{ customers: bigint; points: bigint | null }>>`
      SELECT COUNT(DISTINCT "customerId") AS customers, SUM("points") AS points
      FROM "RetailPointsEntry" WHERE "companyId" = ${companyId} AND "kind" = 'EARNED' AND "createdAt" >= ${since}`,
    prisma.$queryRaw<Array<{ customers: bigint; points: bigint | null; value: Prisma.Decimal | null }>>`
      SELECT COUNT(DISTINCT "customerId") AS customers, SUM(-"points") AS points, SUM("value") AS value
      FROM "RetailPointsEntry" WHERE "companyId" = ${companyId} AND "kind" = 'SPENT' AND "createdAt" >= ${since}`,
    prisma.$queryRaw<Array<{ member: boolean; sales: bigint; amount: Prisma.Decimal | null }>>`
      SELECT ("customerId" IS NOT NULL) AS member, COUNT(*) AS sales, SUM("baseAmount") AS amount
      FROM "RetailSale"
      WHERE "companyId" = ${companyId} AND "saleType" = 'SALE' AND "status" = 'POSTED' AND "postedAt" >= ${since}
      GROUP BY 1`,
  ]);
  const lines: string[] = [];
  const earnedCustomers = Number(earned[0]?.customers ?? 0);
  const earnedPoints = Number(earned[0]?.points ?? 0);
  lines.push(
    earnedCustomers > 0
      ? `${formatCount(earnedCustomers)} ${earnedCustomers === 1 ? "customer" : "customers"} earned ${pointsWords(earnedPoints)}.`
      : "Nobody earned points.",
  );
  const spentCustomers = Number(spent[0]?.customers ?? 0);
  lines.push(
    spentCustomers > 0
      ? `${formatCount(spentCustomers)} spent ${pointsWords(Number(spent[0]?.points ?? 0))}, ${formatMoney(Number(spent[0]?.value ?? 0))} off.`
      : "Nobody spent points.",
  );
  const average = (member: boolean) => {
    const row = baskets.find((entry) => entry.member === member);
    const sales = Number(row?.sales ?? 0);
    return sales > 0 ? Number(row?.amount ?? 0) / sales : null;
  };
  const members = average(true);
  const walkIns = average(false);
  if (members !== null && walkIns !== null && walkIns > 0) {
    lines.push(`Members spent ${(members / walkIns).toFixed(1)} times more a visit.`);
  }
  return { lines };
}

const EXPIRY_OF: Record<string, RetailPointsExpiry> = {
  [EXPIRY_WORDS.NEVER]: "NEVER",
  [EXPIRY_WORDS.AFTER_12_MONTHS]: "AFTER_12_MONTHS",
};

const rateOf = (value: unknown) => (typeof value === "string" ? firstNumber(value) : null);

export const loyaltySettings: SettingsStore = {
  async load(companyId) {
    const [settings, profile, last30, preview] = await Promise.all([
      loadLoyaltySettings(companyId),
      loadShopProfile(companyId),
      lastThirtyDays(companyId),
      expiryPreview(companyId, loyaltyToday()),
    ]);
    const exp = EXPIRY_WORDS[settings.expiry];
    return {
      on: settings.enabled,
      earn: earnWords(settings.earnPerDollar),
      worth: pointValueWords(settings.pointValue),
      min: pointsWords(settings.spendFrom),
      exp,
      tiers: sortTiers(settings.tiers).map(tierTag),
      gold: earnWords(settings.topTierEarnPerDollar),
      promo: settings.earnOnPromotions,
      bday: settings.birthdayBonus,
      alc: settings.pointsPayForAlcohol,
      // Read-only: the bonus's size, whether the shop is a liquor store, and the aside.
      bdayPoints: settings.birthdayPoints,
      liquor: profile.businessType === "LIQUOR",
      expSaved: exp,
      expiryPreview: preview,
      last30,
    };
  },

  /** The top tier earns at least what everyone earns, whichever of the two changed. */
  async resolve(_companyId, values, before) {
    if (values.earn !== undefined || values.gold !== undefined) {
      const earn = rateOf(values.earn ?? before.earn);
      const gold = rateOf(values.gold ?? before.gold);
      if (earn !== null && gold !== null && gold < earn) {
        throw new SettingsRefused(TOP_TIER_EARNS_LESS, { status: 400, field: "gold" });
      }
    }
    return values;
  },

  async save(tx, actor, changes) {
    const data: Prisma.RetailLoyaltySettingsUncheckedUpdateInput = {};
    if (typeof changes.on === "boolean") data.enabled = changes.on;
    if (typeof changes.earn === "string") data.earnPerDollar = new Prisma.Decimal(rateOf(changes.earn)!);
    if (typeof changes.worth === "string") data.pointValue = new Prisma.Decimal(changes.worth);
    if (typeof changes.min === "string") data.spendFrom = firstNumber(changes.min)!;
    if (typeof changes.exp === "string") data.expiry = EXPIRY_OF[changes.exp];
    if (Array.isArray(changes.tiers)) {
      data.tiers = sortTiers((changes.tiers as string[]).map((tag) => parseTier(tag)!)) as Prisma.InputJsonValue;
    }
    if (typeof changes.gold === "string") data.topTierEarnPerDollar = new Prisma.Decimal(rateOf(changes.gold)!);
    if (typeof changes.promo === "boolean") data.earnOnPromotions = changes.promo;
    if (typeof changes.bday === "boolean") data.birthdayBonus = changes.bday;
    if (typeof changes.alc === "boolean") data.pointsPayForAlcohol = changes.alc;
    await tx.retailLoyaltySettings.upsert({
      where: { companyId: actor.companyId },
      update: { ...data, updatedById: actor.userId },
      create: { ...(data as Prisma.RetailLoyaltySettingsUncheckedCreateInput), companyId: actor.companyId, updatedById: actor.userId },
    });
  },
};
