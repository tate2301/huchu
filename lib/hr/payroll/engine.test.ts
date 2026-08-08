/**
 * The Zimbabwe payroll engine, against hand-worked figures.
 *
 * No database. Every expected number below was worked out by hand from the band
 * table and the rates, which is the only way this class of code can be trusted:
 * if the test derives its expectation from the same code it is testing, it
 * proves nothing.
 *
 * The cases that matter most are the ordering ones. A payroll that computes the
 * right stages in the wrong order produces plausible numbers, so the tests that
 * would catch it are the ones asserting *specific* figures rather than
 * relationships.
 */

import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";

import {
  computePayroll,
  netIdentityHolds,
  runTotals,
  type EngineInput,
  type EngineSlice,
} from "./engine";
import type {
  ResolvedPayeTable,
  ResolvedStatutoryRate,
  ResolvedTaxCredit,
} from "@/lib/hr/statutory/tables";

const d = (value: string | number) => new Prisma.Decimal(value);

const USD_TABLE: ResolvedPayeTable = {
  id: "usd",
  label: "Monthly USD PAYE",
  currency: "USD",
  cycle: "MONTHLY",
  effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
  bands: [
    { lowerBound: d(0), upperBound: d(100), ratePercent: d(0), deductAmount: d(0) },
    { lowerBound: d("100.01"), upperBound: d(300), ratePercent: d(20), deductAmount: d(20) },
    { lowerBound: d("300.01"), upperBound: d(1000), ratePercent: d(25), deductAmount: d(35) },
    { lowerBound: d("1000.01"), upperBound: d(2000), ratePercent: d(30), deductAmount: d(85) },
    { lowerBound: d("2000.01"), upperBound: d(3000), ratePercent: d(35), deductAmount: d(185) },
    { lowerBound: d("3000.01"), upperBound: null, ratePercent: d(40), deductAmount: d(335) },
  ],
};

const ZWG_TABLE: ResolvedPayeTable = {
  ...USD_TABLE,
  id: "zwg",
  label: "Monthly ZWG PAYE",
  currency: "ZWG",
  bands: [
    { lowerBound: d(0), upperBound: d(2800), ratePercent: d(0), deductAmount: d(0) },
    { lowerBound: d("2800.01"), upperBound: d(8400), ratePercent: d(20), deductAmount: d(560) },
    { lowerBound: d("8400.01"), upperBound: d(28000), ratePercent: d(25), deductAmount: d(980) },
    { lowerBound: d("28000.01"), upperBound: null, ratePercent: d(30), deductAmount: d(2380) },
  ],
};

const rate = (
  ratePercent: string,
  ceilingAmount: string | null = null,
): ResolvedStatutoryRate => ({
  key: "ZIMDEF",
  currency: null,
  ratePercent: d(ratePercent),
  ceilingAmount: ceilingAmount === null ? null : d(ceilingAmount),
  floorAmount: null,
});

const AIDS = rate("3");
const NSSA_EMPLOYEE = { ...rate("4.5", "700"), key: "NSSA_POBS_EMPLOYEE" as const };
const NSSA_EMPLOYER = { ...rate("4.5", "700"), key: "NSSA_POBS_EMPLOYER" as const };
const ZIMDEF = rate("1");

/** A single-currency USD employee on a flat salary, with nothing unusual. */
function usdSlice(overrides: Partial<EngineSlice> = {}): EngineSlice {
  return {
    currency: "USD",
    exchangeRate: 1,
    earnings: [{ name: "Basic salary", amount: 1000, isTaxable: true, kind: "BASE" }],
    preTaxDeductions: [],
    postTaxDeductions: [],
    payeTable: USD_TABLE,
    credits: [],
    ...overrides,
  };
}

function input(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    baseCurrency: "USD",
    taxStatus: "STANDARD",
    slices: [usdSlice()],
    aidsLevy: AIDS,
    nssaEmployee: NSSA_EMPLOYEE,
    nssaEmployer: NSSA_EMPLOYER,
    apwcs: null,
    zimdef: null,
    standardsDevelopmentLevy: null,
    ...overrides,
  };
}

function componentBy(
  result: ReturnType<typeof computePayroll>,
  statutoryKey: string,
  sliceIndex = 0,
) {
  return result.slices[sliceIndex].components.find(
    (component) => component.statutoryKey === statutoryKey,
  );
}

describe("a plain USD salary, worked by hand", () => {
  // Gross 1,000. NSSA is 4.5% of min(1000, 700) = 31.50.
  // Taxable gross = 1000 − 31.50 = 968.50, which is in the 25% band.
  // PAYE = 968.50 × 25% − 35 = 242.125 − 35 = 207.13 (242.13 rounded, less 35).
  // AIDS levy = 3% of 207.13 = 6.21.
  // Net = 1000 − 31.50 − 207.13 − 6.21 = 755.16.
  const result = computePayroll(input());
  const slice = result.slices[0];

  it("charges NSSA on the capped base, not the full salary", () => {
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.amount.toString()).toBe("31.5");
    // The basis on the component is what NSSA was charged on — the ceiling.
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.basis?.toString()).toBe("700");
  });

  it("deducts NSSA before striking PAYE", () => {
    expect(slice.taxableGross.toString()).toBe("968.5");
  });

  it("computes PAYE from the band table", () => {
    expect(slice.paye.toString()).toBe("207.13");
  });

  it("charges the AIDS levy on the tax, not on gross", () => {
    // 3% of gross would be 30. 3% of the tax is 6.21.
    expect(slice.aidsLevy.toString()).toBe("6.21");
    expect(componentBy(result, "AIDS_LEVY")?.basis?.toString()).toBe("207.13");
  });

  it("arrives at the net pay", () => {
    expect(slice.netAmount.toString()).toBe("755.16");
  });

  it("keeps gross − deductions = net", () => {
    expect(netIdentityHolds(slice)).toBe(true);
  });

  it("orders the components in the sequence they were computed", () => {
    const sequences = slice.components.map((component) => component.sequence);
    expect([...sequences].sort((a, b) => a - b)).toEqual(sequences);
  });
});

describe("isTaxable is finally read", () => {
  it("excludes a non-taxable allowance from taxable gross but not from gross", () => {
    // 1,000 basic (taxable) + 200 non-taxable allowance.
    // Gross is 1,200. NSSA is charged on insurable earnings, which is the whole
    // 1,200 capped at 700 → 31.50. Taxable earnings are only the 1,000.
    // Taxable gross = 1000 − 31.50 = 968.50, exactly as with no allowance.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [
              { name: "Basic salary", amount: 1000, isTaxable: true, kind: "BASE" },
              { name: "Transport", amount: 200, isTaxable: false, kind: "ALLOWANCE" },
            ],
          }),
        ],
      }),
    );
    const slice = result.slices[0];

    expect(slice.grossAmount.toString()).toBe("1200");
    expect(slice.taxableGross.toString()).toBe("968.5");
    expect(slice.allowancesTotal.toString()).toBe("200");
    // The employee keeps the whole allowance: net is 200 more than before.
    expect(slice.netAmount.toString()).toBe("955.16");
  });

  it("taxes a taxable allowance", () => {
    // Same 200, this time taxable. Taxable gross = 1200 − 31.50 = 1168.50,
    // which crosses into the 30% band: 1168.50 × 30% − 85 = 265.55.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [
              { name: "Basic salary", amount: 1000, isTaxable: true, kind: "BASE" },
              { name: "Housing", amount: 200, isTaxable: true, kind: "ALLOWANCE" },
            ],
          }),
        ],
      }),
    );
    expect(result.slices[0].taxableGross.toString()).toBe("1168.5");
    expect(result.slices[0].paye.toString()).toBe("265.55");
  });
});

describe("the NSSA ceiling boundary", () => {
  it("charges the full rate just below the ceiling", () => {
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [{ name: "Basic", amount: 600, isTaxable: true, kind: "BASE" }],
          }),
        ],
      }),
    );
    // 4.5% of 600 = 27
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.amount.toString()).toBe("27");
    expect(result.nssaCeilingReached).toBe(false);
  });

  it("charges exactly at the ceiling", () => {
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [{ name: "Basic", amount: 700, isTaxable: true, kind: "BASE" }],
          }),
        ],
      }),
    );
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.amount.toString()).toBe("31.5");
    expect(result.nssaCeilingReached).toBe(false);
  });

  it("flags the ceiling once earnings pass it", () => {
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [{ name: "Basic", amount: "700.01", isTaxable: true, kind: "BASE" }],
          }),
        ],
      }),
    );
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.amount.toString()).toBe("31.5");
    expect(result.nssaCeilingReached).toBe(true);
  });
});

describe("a dual-currency employee has ONE NSSA ceiling", () => {
  // 500 USD plus 13,750 ZWG at 27.5 ZWG per USD — so 500 USD of ZiG earnings.
  // Insurable earnings are 1,000 USD in total, capped at 700, charged at 4.5%
  // = 31.50 USD. NOT 22.50 + 22.50 = 45, which is what a per-currency ceiling
  // would produce, and NOT 31.50 twice.
  const dual = computePayroll(
    input({
      slices: [
        usdSlice({
          earnings: [{ name: "Basic USD", amount: 500, isTaxable: true, kind: "BASE" }],
        }),
        {
          currency: "ZWG",
          exchangeRate: "27.5",
          earnings: [
            { name: "Basic ZWG", amount: 13750, isTaxable: true, kind: "BASE" },
          ],
          preTaxDeductions: [],
          postTaxDeductions: [],
          payeTable: ZWG_TABLE,
          credits: [],
        },
      ],
    }),
  );

  it("charges 31.50 USD-equivalent in total, not once per currency", () => {
    const usdNssa = componentBy(dual, "NSSA_POBS_EMPLOYEE", 0)!.amount;
    const zwgNssa = componentBy(dual, "NSSA_POBS_EMPLOYEE", 1)!.amount;
    // Each slice's share, back in its own currency.
    const zwgInUsd = zwgNssa.dividedBy(d("27.5"));
    const totalUsd = usdNssa.plus(zwgInUsd);
    expect(totalUsd.toDecimalPlaces(2).toString()).toBe("31.5");
  });

  it("splits the one contribution in proportion to earnings", () => {
    // Equal halves, so 15.75 USD-equivalent each.
    expect(componentBy(dual, "NSSA_POBS_EMPLOYEE", 0)!.amount.toString()).toBe("15.75");
    expect(
      componentBy(dual, "NSSA_POBS_EMPLOYEE", 1)!.amount.dividedBy(d("27.5")).toDecimalPlaces(2).toString(),
    ).toBe("15.75");
  });

  it("reports the single capped basis it charged", () => {
    expect(dual.nssaChargedBase.toString()).toBe("700");
    expect(dual.nssaCeilingReached).toBe(true);
  });

  it("taxes each currency on its own table, not on a converted total", () => {
    // 500 USD less 15.75 NSSA = 484.25 taxable, in the 25% band:
    // 484.25 × 25% − 35 = 121.06 − 35 = 86.06.
    expect(dual.slices[0].paye.toString()).toBe("86.06");

    // The ZWG side is 13,750 less 433.13 NSSA = 13,316.87 taxable, which on the
    // ZWG table's 25% band is 13,316.87 × 25% − 980 = 3,329.22 − 980 = 2,349.22.
    // Vastly different from converting and using the USD table — which is
    // exactly why ZIMRA publishes two tables.
    expect(dual.slices[1].paye.toString()).toBe("2349.22");
  });

  it("keeps the net identity on both slices", () => {
    expect(netIdentityHolds(dual.slices[0])).toBe(true);
    expect(netIdentityHolds(dual.slices[1])).toBe(true);
  });

  it("apportions with no cent lost — the parts sum to the whole", () => {
    // Three slices with an awkward split, so the remainder handling is exercised.
    const thirds = computePayroll(
      input({
        slices: [
          usdSlice({ earnings: [{ name: "A", amount: "333.33", isTaxable: true, kind: "BASE" }] }),
          usdSlice({ earnings: [{ name: "B", amount: "333.33", isTaxable: true, kind: "BASE" }] }),
          usdSlice({ earnings: [{ name: "C", amount: "333.34", isTaxable: true, kind: "BASE" }] }),
        ],
      }),
    );
    const total = thirds.slices.reduce(
      (sum, slice) =>
        sum.plus(
          slice.components.find((c) => c.statutoryKey === "NSSA_POBS_EMPLOYEE")?.amount ??
            d(0),
        ),
      d(0),
    );
    // One ceiling across all three: 4.5% of 700 = 31.50, exactly.
    expect(total.toString()).toBe("31.5");
  });
});

describe("tax credits come off before the AIDS levy", () => {
  const MEDICAL: ResolvedTaxCredit = {
    key: "MEDICAL_AID",
    amount: null,
    ratePercent: d(50),
  };

  it("reduces PAYE, then charges 3% on what is left", () => {
    // Same 1,000 salary: PAYE 207.13. A 120 medical aid contribution gives a
    // 60 credit, so tax payable is 147.13 and the levy is 3% of THAT = 4.41.
    // Striking the levy first would give 6.21 — over-collecting 1.80 from every
    // employee with a credit, every month.
    const result = computePayroll(
      input({
        slices: [usdSlice({ credits: [MEDICAL], medicalAidContribution: 120 })],
      }),
    );
    const slice = result.slices[0];

    expect(componentBy(result, "TAX_CREDIT_MEDICAL_AID")?.amount.toString()).toBe("60");
    expect(slice.paye.toString()).toBe("147.13");
    expect(slice.aidsLevy.toString()).toBe("4.41");
  });

  it("never lets a credit exceed the tax it reduces", () => {
    // A 10,000 medical aid contribution would be a 5,000 credit against 207.13
    // of tax. Capped, because a credit is a reduction and not a refund.
    const result = computePayroll(
      input({
        slices: [usdSlice({ credits: [MEDICAL], medicalAidContribution: 10000 })],
      }),
    );
    expect(result.slices[0].paye.toString()).toBe("0");
    expect(result.slices[0].aidsLevy.toString()).toBe("0");
    expect(componentBy(result, "TAX_CREDIT_MEDICAL_AID")?.amount.toString()).toBe("207.13");
  });

  it("ignores the elderly credit for an employee who does not qualify", () => {
    const elderly: ResolvedTaxCredit = { key: "ELDERLY", amount: d(75), ratePercent: null };
    const notElderly = computePayroll(
      input({ slices: [usdSlice({ credits: [elderly] })] }),
    );
    expect(componentBy(notElderly, "TAX_CREDIT_ELDERLY")).toBeUndefined();
    expect(notElderly.slices[0].paye.toString()).toBe("207.13");

    const qualifies = computePayroll(
      input({ isElderly: true, slices: [usdSlice({ credits: [elderly] })] }),
    );
    expect(qualifies.slices[0].paye.toString()).toBe("132.13");
  });
});

describe("the bonus exemption", () => {
  it("taxes only the part of a bonus above the exempt slice", () => {
    // 1,000 salary plus a 1,000 bonus, 700 of which is exempt.
    // Taxable earnings = 2,000 − 700 = 1,300. NSSA on insurable 2,000 capped at
    // 700 = 31.50. Taxable gross = 1,300 − 31.50 = 1,268.50, in the 30% band:
    // 1,268.50 × 30% − 85 = 380.55 − 85 = 295.55.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [
              { name: "Basic", amount: 1000, isTaxable: true, kind: "BASE" },
              { name: "Annual bonus", amount: 1000, isTaxable: true, kind: "BONUS" },
            ],
            bonusExemption: 700,
          }),
        ],
      }),
    );
    expect(result.slices[0].grossAmount.toString()).toBe("2000");
    expect(result.slices[0].taxableGross.toString()).toBe("1268.5");
    expect(result.slices[0].paye.toString()).toBe("295.55");
  });

  it("cannot exempt more than the bonus actually paid", () => {
    // A 700 exemption against a 200 bonus exempts 200, not 700 — otherwise the
    // exemption would start sheltering ordinary salary.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            earnings: [
              { name: "Basic", amount: 1000, isTaxable: true, kind: "BASE" },
              { name: "Small bonus", amount: 200, isTaxable: true, kind: "BONUS" },
            ],
            bonusExemption: 700,
          }),
        ],
      }),
    );
    // Taxable earnings = 1,200 − 200 = 1,000; less 31.50 NSSA = 968.50.
    expect(result.slices[0].taxableGross.toString()).toBe("968.5");
  });
});

describe("employer contributions never touch net pay", () => {
  const result = computePayroll(
    input({ zimdef: { ...ZIMDEF, key: "ZIMDEF" }, apwcs: { ...rate("0.9"), key: "NSSA_APWCS" } }),
  );
  const slice = result.slices[0];

  it("is absent from gross and from deductions", () => {
    expect(slice.grossAmount.toString()).toBe("1000");
    // Deductions are still NSSA + PAYE + levy only.
    expect(slice.deductionsTotal.toString()).toBe("244.84");
    expect(slice.netAmount.toString()).toBe("755.16");
    expect(netIdentityHolds(slice)).toBe(true);
  });

  it("is collected as employer cost", () => {
    // NSSA employer 31.50 + APWCS 0.9% of 1,000 = 9 + ZIMDEF 1% of 1,000 = 10.
    expect(slice.employerCost.toString()).toBe("50.5");
  });

  it("charges uncapped levies on the full gross", () => {
    expect(componentBy(result, "ZIMDEF")?.basis?.toString()).toBe("1000");
    expect(componentBy(result, "ZIMDEF")?.amount.toString()).toBe("10");
  });

  it("charges NSSA employer on the same capped basis as the employee side", () => {
    expect(componentBy(result, "NSSA_POBS_EMPLOYER")?.basis?.toString()).toBe("700");
    expect(componentBy(result, "NSSA_POBS_EMPLOYER")?.amount.toString()).toBe("31.5");
  });
});

describe("NEC dues", () => {
  it("takes the employee side out of net and the employer side out of neither", () => {
    const result = computePayroll(
      input({
        slices: [
          usdSlice({
            necEmployee: { ratePercent: d("0.5"), fixedAmount: null, councilName: "Commercial" },
            necEmployer: { ratePercent: d("0.5"), fixedAmount: null, councilName: "Commercial" },
          }),
        ],
      }),
    );
    const slice = result.slices[0];
    // 0.5% of 1,000 = 5 each side.
    expect(componentBy(result, "NEC_EMPLOYEE")?.amount.toString()).toBe("5");
    expect(componentBy(result, "NEC_EMPLOYER")?.amount.toString()).toBe("5");
    // Employee side is post-tax, so PAYE is unchanged and net is 5 lower.
    expect(slice.paye.toString()).toBe("207.13");
    expect(slice.netAmount.toString()).toBe("750.16");
    expect(slice.employerCost.toString()).toBe("36.5");
  });
});

describe("pre-tax and post-tax deductions land on different sides of PAYE", () => {
  it("a pre-tax deduction reduces the tax", () => {
    // 100 pension. Taxable gross = 1,000 − 31.50 − 100 = 868.50.
    // 868.50 × 25% − 35 = 217.13 − 35 = 182.13.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({ preTaxDeductions: [{ name: "Pension", amount: 100 }] }),
        ],
      }),
    );
    expect(result.slices[0].taxableGross.toString()).toBe("868.5");
    expect(result.slices[0].paye.toString()).toBe("182.13");
  });

  it("a post-tax deduction does not", () => {
    const result = computePayroll(
      input({
        slices: [
          usdSlice({ postTaxDeductions: [{ name: "Union", amount: 100 }] }),
        ],
      }),
    );
    // Tax unchanged from the plain case; net simply 100 lower.
    expect(result.slices[0].paye.toString()).toBe("207.13");
    expect(result.slices[0].netAmount.toString()).toBe("655.16");
  });
});

describe("tax status", () => {
  it("charges no PAYE and no levy to an EXEMPT employee, but still NSSA", () => {
    const result = computePayroll(input({ taxStatus: "EXEMPT" }));
    const slice = result.slices[0];
    expect(slice.paye.toString()).toBe("0");
    expect(slice.aidsLevy.toString()).toBe("0");
    // Still insured.
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")?.amount.toString()).toBe("31.5");
    expect(slice.netAmount.toString()).toBe("968.5");
  });

  it("pays a CONTRACTOR gross, with no PAYE and no NSSA", () => {
    // Different from EXEMPT, and the reason they are separate statuses: a
    // contractor is outside the scheme entirely, so nothing is withheld.
    const result = computePayroll(input({ taxStatus: "CONTRACTOR" }));
    const slice = result.slices[0];
    expect(slice.deductionsTotal.toString()).toBe("0");
    expect(slice.netAmount.toString()).toBe("1000");
    expect(componentBy(result, "NSSA_POBS_EMPLOYEE")).toBeUndefined();
  });
});

describe("degenerate inputs", () => {
  it("pays nothing on a zero salary without producing a negative", () => {
    const result = computePayroll(
      input({
        slices: [usdSlice({ earnings: [{ name: "Basic", amount: 0, isTaxable: true, kind: "BASE" }] })],
      }),
    );
    const slice = result.slices[0];
    expect(slice.grossAmount.toString()).toBe("0");
    expect(slice.netAmount.toString()).toBe("0");
    expect(slice.taxableGross.toString()).toBe("0");
  });

  it("clamps net at zero when deductions exceed gross", () => {
    // Reachable: a garnishee order or a repayment larger than the month's pay.
    const result = computePayroll(
      input({
        slices: [
          usdSlice({ postTaxDeductions: [{ name: "Salary advance repayment", amount: 5000 }] }),
        ],
      }),
    );
    // Net is floored rather than negative — a negative net would be paid out as
    // a credit to somebody who owes money.
    expect(result.slices[0].netAmount.toString()).toBe("0");
  });

  it("handles an employee with no slices", () => {
    const result = computePayroll(input({ slices: [] }));
    expect(result.slices).toEqual([]);
    expect(result.nssaChargedBase.toString()).toBe("0");
  });

  it("skips a levy that is not on file", () => {
    const result = computePayroll(
      input({ aidsLevy: null, nssaEmployee: null, nssaEmployer: null }),
    );
    const slice = result.slices[0];
    // PAYE on the full 1,000: 1,000 × 25% − 35 = 215.
    expect(slice.taxableGross.toString()).toBe("1000");
    expect(slice.paye.toString()).toBe("215");
    expect(slice.aidsLevy.toString()).toBe("0");
    expect(slice.employerCost.toString()).toBe("0");
  });
});

describe("netIdentityHolds", () => {
  it("catches a net that no longer follows from its own gross and deductions", () => {
    // The shape an approved `AdjustmentEntry` used to leave behind: net moved,
    // gross and deductions did not.
    expect(
      netIdentityHolds({ grossAmount: 1000, deductionsTotal: 200, netAmount: 800 }),
    ).toBe(true);
    expect(
      netIdentityHolds({ grossAmount: 1000, deductionsTotal: 200, netAmount: 850 }),
    ).toBe(false);
  });
});

describe("runTotals", () => {
  it("sums every slice of every employee, keeping employer cost apart", () => {
    const one = computePayroll(input({ zimdef: { ...ZIMDEF, key: "ZIMDEF" } }));
    const two = computePayroll(input({ zimdef: { ...ZIMDEF, key: "ZIMDEF" } }));
    const totals = runTotals([one, two]);

    expect(totals.grossTotal.toString()).toBe("2000");
    expect(totals.netTotal.toString()).toBe("1510.32");
    // Employer cost is its own total, not folded into gross.
    expect(totals.employerCostTotal.toString()).toBe("83");
    expect(totals.grossTotal.minus(totals.deductionsTotal).toString()).toBe(
      totals.netTotal.toString(),
    );
  });
});
