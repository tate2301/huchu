import type { Prisma, RetailPointsExpiry } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { sortTiers, type LoyaltyTier } from "./tiers";

/**
 * The shop's loyalty scheme (CUS-01, W-48): `RetailLoyaltySettings`, or the
 * board's values for a shop that has never saved Loyalty.
 */

export type LoyaltySettings = {
  enabled: boolean;
  /** Points for each US$1. */
  earnPerDollar: number;
  /** What a point is worth in US$ (four decimals). */
  pointValue: number;
  /** The balance a customer needs before they may spend. */
  spendFrom: number;
  expiry: RetailPointsExpiry;
  /** Lowest first; the first from "0.00". */
  tiers: LoyaltyTier[];
  /** What the top tier earns for each US$1. */
  topTierEarnPerDollar: number;
  earnOnPromotions: boolean;
  birthdayBonus: boolean;
  birthdayPoints: number;
  pointsPayForAlcohol: boolean;
};

export const LOYALTY_DEFAULTS: LoyaltySettings = {
  enabled: true,
  earnPerDollar: 1,
  pointValue: 0.01,
  spendFrom: 500,
  expiry: "AFTER_12_MONTHS",
  tiers: [
    { name: "Bronze", from: "0.00" },
    { name: "Silver", from: "500.00" },
    { name: "Gold", from: "1500.00" },
  ],
  topTierEarnPerDollar: 1.5,
  earnOnPromotions: true,
  birthdayBonus: true,
  birthdayPoints: 200,
  pointsPayForAlcohol: true,
};

function tiersOf(value: Prisma.JsonValue): LoyaltyTier[] {
  if (!Array.isArray(value)) return LOYALTY_DEFAULTS.tiers;
  const tiers = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const { name, from } = entry as Record<string, unknown>;
    return typeof name === "string" && typeof from === "string" ? [{ name, from }] : [];
  });
  return tiers.length > 0 ? sortTiers(tiers) : LOYALTY_DEFAULTS.tiers;
}

type Db = Pick<Prisma.TransactionClient, "retailLoyaltySettings">;

export async function loadLoyaltySettings(companyId: string, db: Db = prisma): Promise<LoyaltySettings> {
  const row = await db.retailLoyaltySettings.findUnique({ where: { companyId } });
  if (!row) return LOYALTY_DEFAULTS;
  return {
    enabled: row.enabled,
    earnPerDollar: Number(row.earnPerDollar.toString()),
    pointValue: Number(row.pointValue.toString()),
    spendFrom: row.spendFrom,
    expiry: row.expiry,
    tiers: tiersOf(row.tiers),
    topTierEarnPerDollar: Number(row.topTierEarnPerDollar.toString()),
    earnOnPromotions: row.earnOnPromotions,
    birthdayBonus: row.birthdayBonus,
    birthdayPoints: row.birthdayPoints,
    pointsPayForAlcohol: row.pointsPayForAlcohol,
  };
}
