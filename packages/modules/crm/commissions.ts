/**
 * CRM commission calculation.
 *
 * Rules are tiered by cumulative period revenue for a rep. Tiers are marginal:
 * each slice of a document's attributed amount is taxed at the rate of the
 * tier band it falls into, mirroring how progressive brackets work — so a
 * document that straddles a threshold is split across rates rather than
 * jumping wholesale to the higher rate.
 *
 * A rep's applicable rule is the active per-rep override if one exists,
 * otherwise the active company-default rule (appliesToUserId = null).
 */

export type CommissionTier = {
  thresholdFrom: number;
  ratePercent: number;
  sortOrder: number;
};

export type CommissionRule = {
  id: string;
  appliesToUserId: string | null;
  isActive: boolean;
  effectiveFrom?: Date | null;
  effectiveTo?: Date | null;
  tiers: CommissionTier[];
};

function isRuleEffective(rule: CommissionRule, at: Date): boolean {
  if (!rule.isActive) return false;
  if (rule.effectiveFrom && at < rule.effectiveFrom) return false;
  if (rule.effectiveTo && at > rule.effectiveTo) return false;
  return true;
}

/**
 * Pick the rule that applies to a rep at a given date: an effective per-rep
 * override wins over the effective company default. Returns null if neither
 * exists.
 */
export function resolveRuleForRep(
  rules: CommissionRule[],
  repId: string,
  at: Date,
): CommissionRule | null {
  const effective = rules.filter((rule) => isRuleEffective(rule, at));
  const override = effective.find((rule) => rule.appliesToUserId === repId);
  if (override) return override;
  return effective.find((rule) => rule.appliesToUserId === null) ?? null;
}

function sortTiers(tiers: CommissionTier[]): CommissionTier[] {
  return [...tiers].sort((a, b) => {
    if (a.thresholdFrom !== b.thresholdFrom) return a.thresholdFrom - b.thresholdFrom;
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Commission on `amount` for a rep whose cumulative period revenue *before*
 * this document is `periodRevenueBefore`. Marginal tiers: the amount is spread
 * over the bands [periodRevenueBefore, periodRevenueBefore + amount).
 *
 * Returns the total commission plus the effective blended rate (for display).
 */
export function computeTieredCommission(
  tiers: CommissionTier[],
  periodRevenueBefore: number,
  amount: number,
): { commission: number; effectiveRatePercent: number } {
  if (amount <= 0 || tiers.length === 0) {
    return { commission: 0, effectiveRatePercent: 0 };
  }

  const sorted = sortTiers(tiers);
  const start = Math.max(0, periodRevenueBefore);
  const end = start + amount;
  let commission = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const tier = sorted[i];
    const bandStart = tier.thresholdFrom;
    const bandEnd = i + 1 < sorted.length ? sorted[i + 1].thresholdFrom : Number.POSITIVE_INFINITY;

    // Overlap between [start, end) and this tier band [bandStart, bandEnd).
    const overlapStart = Math.max(start, bandStart);
    const overlapEnd = Math.min(end, bandEnd);
    const overlap = overlapEnd - overlapStart;
    if (overlap > 0) {
      commission += overlap * (tier.ratePercent / 100);
    }
  }

  const rounded = Math.round(commission * 100) / 100;
  const effectiveRatePercent = amount > 0 ? Math.round((rounded / amount) * 10000) / 100 : 0;
  return { commission: rounded, effectiveRatePercent };
}

/**
 * Period key "YYYY-MM" for a date, used to group commission entries.
 */
export function periodKeyForDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
