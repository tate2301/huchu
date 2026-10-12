import { Prisma } from "@prisma/client";

import { customerTier } from "./ledger";
import type { LoyaltySettings } from "./settings";
import { pointsValue } from "./spend";
import { isTopTier } from "./tiers";

/**
 * Points earned on a sale (CUS-01, W-46), inside the sale's transaction.
 *
 * Eligible is what the eligible lines come to (after their own and the
 * order's discounts, VAT included). The points spent on the sale are already
 * out of those lines (`spreadPointsDiscount`), so points never earn points.
 * A line under a promotion is out while "Earn on promotion prices" is off;
 * deposits and vouchers sold are never in a line's total, so never earn.
 */

export type EarnLine = { lineTotal: Prisma.Decimal.Value; promotionId: string | null };

/** `floor(eligible × rate)`, in whole numbers so 21.40 × 1.5 is 32, not 32.099…. */
export function pointsEarned(input: {
  lines: EarnLine[];
  settings: Pick<LoyaltySettings, "enabled" | "earnOnPromotions" | "earnPerDollar" | "topTierEarnPerDollar">;
  topTier: boolean;
}): number {
  if (!input.settings.enabled) return 0;
  const eligibleCents = input.lines
    .filter((line) => input.settings.earnOnPromotions || !line.promotionId)
    .reduce((sum, line) => sum + Math.round(Number(new Prisma.Decimal(line.lineTotal).toString()) * 100), 0);
  if (eligibleCents <= 0) return 0;
  const rate = input.topTier ? input.settings.topTierEarnPerDollar : input.settings.earnPerDollar;
  const ratePerHundred = Math.round(rate * 100);
  return Math.floor((eligibleCents * ratePerHundred) / 10_000);
}

export async function earnPoints(
  tx: Prisma.TransactionClient,
  sale: {
    id: string;
    companyId: string;
    customerId: string | null;
    postedAt: Date;
    cashierName: string | null;
    lines: EarnLine[];
  },
  settings: LoyaltySettings,
): Promise<{ points: number; tier: string | null }> {
  if (!settings.enabled || !sale.customerId) return { points: 0, tier: null };
  const tier = await customerTier(tx, { companyId: sale.companyId, customerId: sale.customerId, at: sale.postedAt, settings });
  const points = pointsEarned({ lines: sale.lines, settings, topTier: isTopTier(tier, settings.tiers) });
  if (points > 0) {
    await tx.retailPointsEntry.create({
      data: {
        companyId: sale.companyId,
        customerId: sale.customerId,
        kind: "EARNED",
        points,
        value: new Prisma.Decimal(pointsValue(points, settings.pointValue)).toDecimalPlaces(2),
        saleId: sale.id,
        actorName: sale.cashierName,
        createdAt: sale.postedAt,
      },
    });
  }
  return { points, tier };
}
