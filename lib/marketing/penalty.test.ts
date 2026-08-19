import { describe, expect, it } from "vitest";

import {
  PENALTY_CAP_DAYS,
  PENALTY_MAX_DAYS,
  PENALTY_MAX_PER_TILL_USD,
  PENALTY_MAX_TILLS,
  PENALTY_USD_PER_TILL_PER_DAY,
  VAT_APPROACHING_RATIO,
  VAT_STANDARD_RATE,
  VAT_THRESHOLD_USD,
  VAT_THRESHOLD_WINDOW_MONTHS,
  calculateFiscalisationPenalty,
  checkVatThreshold,
} from "@/lib/marketing/penalty";

describe("fiscalisation penalty", () => {
  it("charges US$25 per till per day inside the cap", () => {
    const result = calculateFiscalisationPenalty({ tills: 3, daysInDefault: 10 });

    expect(result.penaltyUsd).toBe(3 * 10 * 25);
    expect(result.chargeableDays).toBe(10);
    expect(result.dailyPenaltyUsd).toBe(75);
    expect(result.isCapped).toBe(false);
    expect(result.convertsToCriminalLiability).toBe(false);
  });

  it("matches the published rate rather than a locally typed one", () => {
    expect(PENALTY_USD_PER_TILL_PER_DAY).toBe(25);
    expect(PENALTY_CAP_DAYS).toBe(181);
    expect(PENALTY_MAX_PER_TILL_USD).toBe(4_525);
  });

  // The cap is the whole reason this module exists. An uncapped calculator
  // prints numbers no operator has ever been charged, and the first accountant
  // to check one stops believing anything else on the site.
  describe("the 181-day cap", () => {
    it("stops accruing on day 181", () => {
      const atCap = calculateFiscalisationPenalty({ tills: 1, daysInDefault: PENALTY_CAP_DAYS });
      const pastCap = calculateFiscalisationPenalty({
        tills: 1,
        daysInDefault: PENALTY_CAP_DAYS + 1,
      });

      expect(atCap.penaltyUsd).toBe(PENALTY_MAX_PER_TILL_USD);
      expect(atCap.isCapped).toBe(false);
      expect(pastCap.penaltyUsd).toBe(atCap.penaltyUsd);
      expect(pastCap.isCapped).toBe(true);
    });

    it("never exceeds tills x 181 x US$25, however long the default runs", () => {
      for (const daysInDefault of [182, 365, 1_000, PENALTY_MAX_DAYS]) {
        const result = calculateFiscalisationPenalty({ tills: 4, daysInDefault });

        expect(result.penaltyUsd).toBe(4 * PENALTY_MAX_PER_TILL_USD);
        expect(result.chargeableDays).toBe(PENALTY_CAP_DAYS);
      }
    });

    it("is monotonic and bounded across the whole input range", () => {
      let previous = 0;

      for (let days = 0; days <= 400; days += 1) {
        const { penaltyUsd } = calculateFiscalisationPenalty({ tills: 7, daysInDefault: days });

        expect(penaltyUsd).toBeGreaterThanOrEqual(previous);
        expect(penaltyUsd).toBeLessThanOrEqual(7 * PENALTY_MAX_PER_TILL_USD);
        previous = penaltyUsd;
      }
    });

    it("reports the uncapped figure separately so it can be shown as a contrast, not as exposure", () => {
      const result = calculateFiscalisationPenalty({ tills: 2, daysInDefault: 730 });

      expect(result.uncappedPenaltyUsd).toBe(2 * 730 * 25);
      expect(result.penaltyUsd).toBeLessThan(result.uncappedPenaltyUsd);
      expect(result.daysBeyondCap).toBe(730 - PENALTY_CAP_DAYS);
    });

    it("converts to criminal liability rather than a larger daily charge", () => {
      const result = calculateFiscalisationPenalty({ tills: 5, daysInDefault: 200 });

      expect(result.convertsToCriminalLiability).toBe(true);
      // Once the offence is criminal there is no further daily civil charge to quote.
      expect(result.dailyPenaltyUsd).toBe(0);
    });

    it("counts down the days of civil penalty still available", () => {
      expect(calculateFiscalisationPenalty({ tills: 1, daysInDefault: 30 }).daysUntilCap).toBe(151);
      expect(calculateFiscalisationPenalty({ tills: 1, daysInDefault: 400 }).daysUntilCap).toBe(0);
    });
  });

  describe("input that would otherwise print nonsense", () => {
    it("floors fractional tills and days", () => {
      const result = calculateFiscalisationPenalty({ tills: 2.9, daysInDefault: 10.7 });

      expect(result.tills).toBe(2);
      expect(result.daysInDefault).toBe(10);
      expect(result.penaltyUsd).toBe(500);
    });

    it("treats negatives, NaN and either infinity as zero", () => {
      // A non-finite count is not a number of tills anyone owns; refusing it
      // outright beats clamping it to a maximum the reader never typed.
      const bad = [-1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY];

      for (const value of bad) {
        expect(calculateFiscalisationPenalty({ tills: value, daysInDefault: 30 }).penaltyUsd).toBe(
          0,
        );
        expect(calculateFiscalisationPenalty({ tills: 3, daysInDefault: value }).penaltyUsd).toBe(0);
      }
    });

    it("clamps absurd till counts to the published maximum", () => {
      const result = calculateFiscalisationPenalty({ tills: 999_999, daysInDefault: 1 });

      expect(result.tills).toBe(PENALTY_MAX_TILLS);
    });

    it("returns zero for an operator with no tills and no default", () => {
      const result = calculateFiscalisationPenalty({ tills: 0, daysInDefault: 0 });

      expect(result.penaltyUsd).toBe(0);
      expect(result.uncappedPenaltyUsd).toBe(0);
      expect(result.isCapped).toBe(false);
    });
  });
});

describe("VAT registration threshold", () => {
  it("publishes the figure in force since 1 January 2024", () => {
    expect(VAT_THRESHOLD_USD).toBe(25_000);
    expect(VAT_STANDARD_RATE).toBe(0.15);
    expect(VAT_THRESHOLD_WINDOW_MONTHS).toBe(12);
  });

  it("annualises a monthly figure before testing it", () => {
    const result = checkVatThreshold({ turnoverUsd: 3_000, basis: "monthly" });

    expect(result.annualTaxableSuppliesUsd).toBe(36_000);
    expect(result.mustRegister).toBe(true);
    expect(result.excessUsd).toBe(11_000);
  });

  it("does not compel registration at exactly the threshold", () => {
    // The Act says "exceeds or is expected to exceed", so equality is not yet liability.
    const atThreshold = checkVatThreshold({ turnoverUsd: VAT_THRESHOLD_USD, basis: "annual" });
    const oneDollarOver = checkVatThreshold({
      turnoverUsd: VAT_THRESHOLD_USD + 1,
      basis: "annual",
    });

    expect(atThreshold.mustRegister).toBe(false);
    expect(atThreshold.headroomUsd).toBe(0);
    expect(oneDollarOver.mustRegister).toBe(true);
  });

  it("flags a business inside the approach band before it is liable", () => {
    const approaching = checkVatThreshold({
      turnoverUsd: VAT_THRESHOLD_USD * VAT_APPROACHING_RATIO,
      basis: "annual",
    });

    expect(approaching.status).toBe("approaching");
    expect(approaching.mustRegister).toBe(false);
    expect(approaching.headroomUsd).toBe(5_000);
  });

  it("leaves a small trader below the threshold", () => {
    const result = checkVatThreshold({ turnoverUsd: 800, basis: "monthly" });

    expect(result.status).toBe("below");
    expect(result.annualTaxableSuppliesUsd).toBe(9_600);
    expect(result.headroomUsd).toBe(15_400);
  });

  it("quotes output VAT at the standard rate on the annualised figure", () => {
    const result = checkVatThreshold({ turnoverUsd: 60_000, basis: "annual" });

    expect(result.indicativeAnnualOutputVatUsd).toBe(9_000);
    expect(result.thresholdRatio).toBe(2.4);
  });

  it("states the monthly run-rate that reaches the threshold", () => {
    expect(checkVatThreshold({ turnoverUsd: 0, basis: "monthly" }).monthlyThresholdEquivalentUsd)
      .toBe(2_083.33);
  });

  it("treats negatives, NaN and Infinity as zero turnover", () => {
    for (const bad of [-5_000, Number.NaN, Number.NEGATIVE_INFINITY]) {
      const result = checkVatThreshold({ turnoverUsd: bad, basis: "annual" });

      expect(result.annualTaxableSuppliesUsd).toBe(0);
      expect(result.status).toBe("below");
      expect(result.mustRegister).toBe(false);
    }
  });
});
