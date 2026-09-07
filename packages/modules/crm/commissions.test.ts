import { describe, expect, it } from "vitest";

import {
  computeTieredCommission,
  periodKeyForDate,
  resolveRuleForRep,
  type CommissionRule,
  type CommissionTier,
} from "./commissions";

const tiers: CommissionTier[] = [
  { thresholdFrom: 0, ratePercent: 5, sortOrder: 0 },
  { thresholdFrom: 10000, ratePercent: 8, sortOrder: 1 },
  { thresholdFrom: 50000, ratePercent: 12, sortOrder: 2 },
];

describe("computeTieredCommission (marginal)", () => {
  it("stays within the first band", () => {
    const { commission } = computeTieredCommission(tiers, 0, 4000);
    expect(commission).toBe(200); // 4000 * 5%
  });

  it("splits an amount that straddles a threshold", () => {
    // periodBefore 8000, amount 4000 → 2000@5% (to 10k) + 2000@8% = 100 + 160
    const { commission } = computeTieredCommission(tiers, 8000, 4000);
    expect(commission).toBe(260);
  });

  it("spans three bands", () => {
    // periodBefore 0, amount 60000 → 10000@5%(500) + 40000@8%(3200) + 10000@12%(1200)
    const { commission, effectiveRatePercent } = computeTieredCommission(tiers, 0, 60000);
    expect(commission).toBe(4900);
    expect(effectiveRatePercent).toBeCloseTo(8.17, 1);
  });

  it("starts entirely in a higher band when prior revenue is high", () => {
    const { commission } = computeTieredCommission(tiers, 60000, 5000);
    expect(commission).toBe(600); // 5000 * 12%
  });

  it("returns zero for non-positive amounts or no tiers", () => {
    expect(computeTieredCommission(tiers, 0, 0).commission).toBe(0);
    expect(computeTieredCommission([], 0, 1000).commission).toBe(0);
  });
});

describe("resolveRuleForRep", () => {
  const at = new Date("2026-07-15T00:00:00Z");
  const companyDefault: CommissionRule = {
    id: "default",
    appliesToUserId: null,
    isActive: true,
    tiers,
  };
  const repOverride: CommissionRule = {
    id: "override",
    appliesToUserId: "rep-1",
    isActive: true,
    tiers,
  };

  it("prefers a per-rep override over the company default", () => {
    expect(resolveRuleForRep([companyDefault, repOverride], "rep-1", at)?.id).toBe("override");
  });

  it("falls back to the company default for other reps", () => {
    expect(resolveRuleForRep([companyDefault, repOverride], "rep-2", at)?.id).toBe("default");
  });

  it("ignores inactive or out-of-window rules", () => {
    const expired: CommissionRule = {
      id: "expired",
      appliesToUserId: "rep-1",
      isActive: true,
      effectiveTo: new Date("2026-06-01T00:00:00Z"),
      tiers,
    };
    expect(resolveRuleForRep([companyDefault, expired], "rep-1", at)?.id).toBe("default");
    expect(resolveRuleForRep([{ ...companyDefault, isActive: false }], "rep-1", at)).toBeNull();
  });
});

describe("periodKeyForDate", () => {
  it("formats YYYY-MM in UTC", () => {
    expect(periodKeyForDate(new Date("2026-07-15T23:00:00Z"))).toBe("2026-07");
    expect(periodKeyForDate(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});
