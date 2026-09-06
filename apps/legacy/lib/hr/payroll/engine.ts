/**
 * The Zimbabwe payroll engine.
 *
 * Pure: no Prisma, no feature flags, no clock. Everything it needs — the PAYE
 * bands, the NSSA rates, the credits, the FX rate — is resolved by the caller
 * and handed in. That is what makes it testable against a hand-worked payslip,
 * and it is why the arithmetic below can be checked against a ZIMRA circular
 * without standing up a database.
 *
 * ── The order of operations ────────────────────────────────────────────────
 *
 * Payroll is not a formula, it is a sequence, and the sequence is where the
 * money goes wrong. Three orderings in particular are easy to get backwards and
 * each is expensive:
 *
 *  1. **The NSSA ceiling caps the base, not the contribution.** 4.5% of
 *     earnings-capped-at-700 is 31.50. 4.5%-of-earnings capped at 700 is 225 on
 *     a 5,000 salary — nine times what NSSA collects.
 *
 *  2. **Credits come off before the AIDS levy, not after.** ZIMRA's order is:
 *     tax from the table, less credits, equals tax payable; then 3% of *that*.
 *     Striking the levy on the pre-credit figure over-collects from every
 *     employee who has a credit.
 *
 *  3. **The AIDS levy is a percentage of the tax, not of gross.** 3% of gross
 *     on a 2,000 salary is 60; 3% of the tax is a fraction of that.
 *
 * The pipeline, per currency:
 *
 *     gross            = base + variable + allowances (+ bonus)
 *     taxableEarnings  = the taxable subset of those, less the exempt slice
 *                        of any bonus
 *     insurable        = gross, for NSSA
 *     nssaEmployee     = 4.5% of insurable, capped — ONE ceiling across all
 *                        currencies, apportioned back (see below)
 *     taxableGross     = taxableEarnings − nssaEmployee − pre-tax deductions
 *     paye             = the band table applied to taxableGross
 *     credits          = medical aid (50% of contributions), elderly, disability
 *     payeAfterCredits = max(paye − credits, 0)
 *     aidsLevy         = 3% of payeAfterCredits
 *     postTax          = NEC employee dues, union subscriptions, …
 *     net              = gross − nssaEmployee − preTax − payeAfterCredits
 *                        − aidsLevy − postTax
 *
 * Employer contributions — NSSA employer, APWCS, ZIMDEF, the Standards
 * Development Levy, NEC employer dues — are computed alongside and touch net
 * pay nowhere. They are a cost to the company and a liability to an authority.
 *
 * ── The dual-currency ceiling ──────────────────────────────────────────────
 *
 * An employee paid partly in USD and partly in ZiG has **one** NSSA ceiling
 * between them, not one each. Applying the ceiling per currency would let an
 * employer halve its NSSA bill by splitting a wage across two currencies.
 *
 * So the ceiling is applied once, in the base currency: each slice's insurable
 * earnings are converted, summed, capped, and charged; then the single
 * contribution is apportioned back across the slices in proportion to what each
 * contributed to the total. The last slice takes the remainder, so the parts sum
 * to the whole exactly — the same discipline `apportionBase` enforces for a
 * journal entry, and for the same reason: two independent roundings do not add
 * up.
 *
 * PAYE, by contrast, is per currency and always was — ZIMRA publishes a USD
 * table and a ZWG table because they are separate taxes on separate earnings,
 * not one tax on a converted total.
 */

import { Prisma } from "@corelithzw/db";
import type {
  CompensationCalcMethod,
  CompensationRuleType,
  EmployeeTaxStatus,
} from "@corelithzw/db";

import {
  clampAtZero,
  maxMoney,
  minMoney,
  money,
  sumMoney,
  taxOn,
  toBaseAmount,
  ZERO,
  type MoneyLike,
} from "@/lib/money";
import {
  contributionOn,
  creditValue,
  necDues,
  payeOn,
  type ResolvedPayeTable,
  type ResolvedStatutoryRate,
  type ResolvedTaxCredit,
} from "@/lib/hr/statutory/tables";

/**
 * Where each stage sits on the payslip.
 *
 * Explicit numbers rather than array order, so a component read back out of the
 * database sorts into the sequence it was computed in — which is the only order
 * the working makes sense in.
 */
export const STAGE = {
  BASE: 10,
  VARIABLE: 20,
  ALLOWANCE: 30,
  BONUS: 40,
  NSSA_EMPLOYEE: 50,
  PRE_TAX_DEDUCTION: 60,
  PAYE: 70,
  TAX_CREDIT: 80,
  AIDS_LEVY: 90,
  POST_TAX_DEDUCTION: 100,
  NEC_EMPLOYEE: 110,
  NSSA_EMPLOYER: 200,
  NSSA_APWCS: 210,
  ZIMDEF: 220,
  STANDARDS_DEVELOPMENT_LEVY: 230,
  NEC_EMPLOYER: 240,
} as const;

/** One line of a computed payslip, ready to persist as a `PayrollLineComponent`. */
export type ComputedComponent = {
  name: string;
  type: CompensationRuleType;
  calcMethod: CompensationCalcMethod;
  /** The rate or fixed figure this came from — a percentage, or the amount. */
  rateOrAmount: Prisma.Decimal;
  amount: Prisma.Decimal;
  isTaxable: boolean;
  /** Non-null on the lines the state owns. Drives the P2 and NSSA schedule. */
  statutoryKey: string | null;
  sequence: number;
  /** What the stage was calculated on, so nobody has to re-derive it. */
  basis: Prisma.Decimal | null;
  ruleId?: string;
};

export type EarningKind = "BASE" | "VARIABLE" | "ALLOWANCE" | "BONUS";

export type EngineEarning = {
  name: string;
  amount: MoneyLike;
  /** Read at last. A non-taxable allowance is excluded from taxable gross. */
  isTaxable: boolean;
  kind: EarningKind;
  ruleId?: string;
};

export type EngineDeduction = {
  name: string;
  amount: MoneyLike;
  ruleId?: string;
};

export type NecSide = {
  ratePercent: Prisma.Decimal | null;
  fixedAmount: Prisma.Decimal | null;
  councilName: string;
};

/** Everything the engine needs about one currency an employee is paid in. */
export type EngineSlice = {
  currency: string;
  /** Quote units per one base unit, frozen for the period. */
  exchangeRate: MoneyLike;
  earnings: EngineEarning[];
  /** Pension and anything else that comes off before PAYE is struck. */
  preTaxDeductions: EngineDeduction[];
  /** Union subscriptions and anything else that comes off after. */
  postTaxDeductions: EngineDeduction[];
  payeTable: ResolvedPayeTable;
  /** The employee's own medical aid contribution, for the 50% credit. */
  medicalAidContribution?: MoneyLike;
  credits: ResolvedTaxCredit[];
  /** The exempt slice of an annual bonus, if any bonus falls in this period. */
  bonusExemption?: MoneyLike;
  necEmployee?: NecSide;
  necEmployer?: NecSide;
};

export type EngineInput = {
  baseCurrency: string;
  taxStatus: EmployeeTaxStatus;
  /** Whether the employee qualifies for the flat credits. */
  isElderly?: boolean;
  isDisabled?: boolean;
  slices: EngineSlice[];
  /** Cross-currency: 3% of the tax, whichever currency it was struck in. */
  aidsLevy: ResolvedStatutoryRate | null;
  /**
   * NSSA POBS, in the **base** currency — the single ceiling for the employee
   * across every currency they are paid in.
   */
  nssaEmployee: ResolvedStatutoryRate | null;
  nssaEmployer: ResolvedStatutoryRate | null;
  apwcs: ResolvedStatutoryRate | null;
  zimdef: ResolvedStatutoryRate | null;
  standardsDevelopmentLevy: ResolvedStatutoryRate | null;
};

export type ComputedSlice = {
  currency: string;
  exchangeRate: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  allowancesTotal: Prisma.Decimal;
  /** Employee-side deductions, statutory and otherwise. Reduces net pay. */
  deductionsTotal: Prisma.Decimal;
  taxableGross: Prisma.Decimal;
  paye: Prisma.Decimal;
  aidsLevy: Prisma.Decimal;
  netAmount: Prisma.Decimal;
  /** Employer cost. In neither gross nor deductions. */
  employerCost: Prisma.Decimal;
  components: ComputedComponent[];
};

export type ComputedPayroll = {
  slices: ComputedSlice[];
  /** The single, cross-currency NSSA basis actually charged, in base currency. */
  nssaChargedBase: Prisma.Decimal;
  /** True when the ceiling actually bit — useful on a payslip footnote. */
  nssaCeilingReached: boolean;
};

function percentComponent(input: {
  name: string;
  type: CompensationRuleType;
  ratePercent: MoneyLike;
  amount: Prisma.Decimal;
  basis: Prisma.Decimal;
  statutoryKey: string;
  sequence: number;
}): ComputedComponent {
  return {
    name: input.name,
    type: input.type,
    calcMethod: "PERCENT",
    rateOrAmount: money(input.ratePercent),
    amount: input.amount,
    isTaxable: false,
    statutoryKey: input.statutoryKey,
    sequence: input.sequence,
    basis: input.basis,
  };
}

const KIND_SEQUENCE: Record<EarningKind, number> = {
  BASE: STAGE.BASE,
  VARIABLE: STAGE.VARIABLE,
  ALLOWANCE: STAGE.ALLOWANCE,
  BONUS: STAGE.BONUS,
};

/**
 * Compute one employee's payroll for one period.
 *
 * Returns a slice per currency plus the components that show the working. Does
 * not touch the database, so the caller owns persistence and the caller owns
 * deciding whether a run may proceed at all.
 */
export function computePayroll(input: EngineInput): ComputedPayroll {
  // `input.baseCurrency` is not read below, and that is correct rather than an
  // oversight: it declares which currency `nssaEmployee.ceilingAmount` and every
  // slice's `exchangeRate` are relative to, so the caller and the reader know
  // what the numbers mean. The arithmetic only ever needs the rates themselves.

  // ── Pass one: earnings, per slice. Needed in full before NSSA, because the
  // ceiling spans every slice and cannot be applied until all of them are known.
  const passOne = input.slices.map((slice) => {
    const exchangeRate = money(slice.exchangeRate);

    const gross = sumMoney(slice.earnings.map((earning) => earning.amount));
    const allowancesTotal = sumMoney(
      slice.earnings
        .filter((earning) => earning.kind === "ALLOWANCE")
        .map((earning) => earning.amount),
    );

    // Here, and only here, is `isTaxable` read. It has been carried on every
    // rule and every component since the module was written and was never once
    // consulted by a calculation.
    let taxableEarnings = sumMoney(
      slice.earnings
        .filter((earning) => earning.isTaxable)
        .map((earning) => earning.amount),
    );

    // A bonus is taxable above its exempt slice, not in full and not at all.
    const bonus = sumMoney(
      slice.earnings.filter((e) => e.kind === "BONUS").map((e) => e.amount),
    );
    const exemption = minMoney(money(slice.bonusExemption), bonus);
    taxableEarnings = clampAtZero(taxableEarnings.minus(exemption));

    return {
      slice,
      exchangeRate,
      gross,
      allowancesTotal,
      taxableEarnings,
      bonusExemption: exemption,
      // NSSA is charged on insurable earnings, which is the gross wage — not
      // the taxable subset. A non-taxable allowance is still insurable.
      insurableBase: toBaseAmount(gross, exchangeRate),
    };
  });

  // ── The single NSSA ceiling, applied once across every currency.
  const totalInsurableBase = sumMoney(passOne.map((row) => row.insurableBase));
  const nssaEmployeeRate = input.nssaEmployee;

  let nssaChargedBase = ZERO;
  let nssaCeilingReached = false;
  let nssaEmployeeTotalBase = ZERO;
  let nssaEmployerTotalBase = ZERO;

  const exemptFromNssa = input.taxStatus === "CONTRACTOR";

  if (nssaEmployeeRate && !exemptFromNssa) {
    const charged = contributionOn(totalInsurableBase, nssaEmployeeRate);
    nssaChargedBase = charged.basis;
    nssaCeilingReached =
      nssaEmployeeRate.ceilingAmount !== null &&
      totalInsurableBase.greaterThan(nssaEmployeeRate.ceilingAmount);
    nssaEmployeeTotalBase = charged.amount;
  }
  if (input.nssaEmployer && !exemptFromNssa) {
    // Same basis, employer's own rate — so a ceiling reached on one side is
    // reached on both, which is how NSSA bills it.
    nssaEmployerTotalBase = taxOn(
      nssaChargedBase.greaterThan(0)
        ? nssaChargedBase
        : contributionOn(totalInsurableBase, input.nssaEmployer).basis,
      input.nssaEmployer.ratePercent,
    );
  }

  /**
   * Split one base-currency total across the slices, exactly.
   *
   * Proportional to each slice's share of insurable earnings, with the final
   * slice taking the remainder. Independent per-slice roundings would not sum
   * to the total, and the difference would surface as an unbalanced journal.
   */
  function apportion(totalBase: Prisma.Decimal): Prisma.Decimal[] {
    if (passOne.length === 0 || totalBase.isZero()) {
      return passOne.map(() => ZERO);
    }
    if (totalInsurableBase.isZero()) {
      // Nobody earned anything; nothing to split.
      return passOne.map(() => ZERO);
    }

    const shares: Prisma.Decimal[] = [];
    let allocated = ZERO;
    for (let index = 0; index < passOne.length; index += 1) {
      if (index === passOne.length - 1) {
        shares.push(money(totalBase.minus(allocated)));
        break;
      }
      const share = money(
        totalBase.times(passOne[index].insurableBase).dividedBy(totalInsurableBase),
      );
      shares.push(share);
      allocated = sumMoney([allocated, share]);
    }
    return shares;
  }

  const nssaEmployeeShares = apportion(nssaEmployeeTotalBase);
  const nssaEmployerShares = apportion(nssaEmployerTotalBase);

  // ── Pass two: everything that follows from the earnings and the NSSA split.
  const slices: ComputedSlice[] = passOne.map((row, index) => {
    const { slice, exchangeRate, gross, allowancesTotal } = row;
    const components: ComputedComponent[] = [];

    for (const earning of slice.earnings) {
      components.push({
        name: earning.name,
        type: "ALLOWANCE",
        calcMethod: "FIXED",
        rateOrAmount: money(earning.amount),
        amount: money(earning.amount),
        isTaxable: earning.isTaxable,
        statutoryKey: null,
        sequence: KIND_SEQUENCE[earning.kind],
        basis: null,
        ruleId: earning.ruleId,
      });
    }

    if (row.bonusExemption.greaterThan(0)) {
      components.push({
        name: "Bonus exemption",
        type: "ALLOWANCE",
        calcMethod: "FIXED",
        rateOrAmount: row.bonusExemption,
        // Not money moving — a note that this slice of the bonus escaped tax.
        amount: ZERO,
        isTaxable: false,
        statutoryKey: "BONUS_EXEMPTION",
        sequence: STAGE.BONUS + 1,
        basis: row.bonusExemption,
      });
    }

    // NSSA employee — this slice's share of the one capped contribution, back
    // in this slice's own currency.
    const nssaEmployeeBase = nssaEmployeeShares[index] ?? ZERO;
    const nssaEmployee = money(nssaEmployeeBase.times(exchangeRate));
    if (nssaEmployee.greaterThan(0) && nssaEmployeeRate) {
      components.push(
        percentComponent({
          name: "NSSA (employee)",
          type: "STATUTORY_DEDUCTION",
          ratePercent: nssaEmployeeRate.ratePercent,
          amount: nssaEmployee,
          basis: money(nssaChargedBase.times(exchangeRate)),
          statutoryKey: "NSSA_POBS_EMPLOYEE",
          sequence: STAGE.NSSA_EMPLOYEE,
        }),
      );
    }

    const preTaxTotal = sumMoney(slice.preTaxDeductions.map((d) => d.amount));
    for (const deduction of slice.preTaxDeductions) {
      components.push({
        name: deduction.name,
        type: "DEDUCTION",
        calcMethod: "FIXED",
        rateOrAmount: money(deduction.amount),
        amount: money(deduction.amount),
        isTaxable: false,
        statutoryKey: null,
        sequence: STAGE.PRE_TAX_DEDUCTION,
        basis: null,
        ruleId: deduction.ruleId,
      });
    }

    // NSSA and pension come off before PAYE is struck. This is the taxable
    // figure a P2 is filed on, which is why it is stored rather than derived.
    const taxableGross = clampAtZero(
      row.taxableEarnings.minus(nssaEmployee).minus(preTaxTotal),
    );

    // An EXEMPT employee pays no PAYE and therefore no AIDS levy. A CONTRACTOR
    // is paid gross — theirs to declare — which is a different thing, and is
    // why the two are separate statuses rather than one flag.
    const payeApplies = input.taxStatus === "STANDARD";
    const { tax: payeGross, band } = payeApplies
      ? payeOn(taxableGross, slice.payeTable)
      : { tax: ZERO, band: null };

    if (payeApplies && payeGross.greaterThan(0) && band) {
      components.push(
        percentComponent({
          name: `PAYE (${slice.payeTable.label})`,
          type: "STATUTORY_DEDUCTION",
          ratePercent: band.ratePercent,
          amount: payeGross,
          basis: taxableGross,
          statutoryKey: "PAYE",
          sequence: STAGE.PAYE,
        }),
      );
    }

    // Credits come off the tax, before the levy. Getting this order wrong
    // over-collects from every employee who has a credit.
    let creditTotal = ZERO;
    for (const credit of slice.credits) {
      if (credit.key === "ELDERLY" && !input.isElderly) continue;
      if (credit.key === "DISABILITY" && !input.isDisabled) continue;
      const value =
        credit.key === "MEDICAL_AID"
          ? creditValue(credit, slice.medicalAidContribution ?? ZERO)
          : creditValue(credit);
      if (value.isZero()) continue;

      // A credit cannot be worth more than the tax it reduces.
      const applied = minMoney(value, clampAtZero(payeGross.minus(creditTotal)));
      if (applied.isZero()) continue;
      creditTotal = sumMoney([creditTotal, applied]);

      components.push({
        name: `Tax credit — ${credit.key.toLowerCase().replace(/_/g, " ")}`,
        type: "ALLOWANCE",
        calcMethod: credit.ratePercent !== null ? "PERCENT" : "FIXED",
        rateOrAmount: money(credit.ratePercent ?? credit.amount),
        // Recorded as the reduction it is, so a payslip can show the working
        // without the credit appearing to be money paid.
        amount: applied,
        isTaxable: false,
        statutoryKey: `TAX_CREDIT_${credit.key}`,
        sequence: STAGE.TAX_CREDIT,
        basis: payeGross,
      });
    }

    const paye = clampAtZero(payeGross.minus(creditTotal));

    // 3% of the tax after credits — not of gross, and not of the pre-credit tax.
    const aidsLevy =
      payeApplies && input.aidsLevy && paye.greaterThan(0)
        ? taxOn(paye, input.aidsLevy.ratePercent)
        : ZERO;
    if (aidsLevy.greaterThan(0) && input.aidsLevy) {
      components.push(
        percentComponent({
          name: "AIDS levy",
          type: "STATUTORY_DEDUCTION",
          ratePercent: input.aidsLevy.ratePercent,
          amount: aidsLevy,
          basis: paye,
          statutoryKey: "AIDS_LEVY",
          sequence: STAGE.AIDS_LEVY,
        }),
      );
    }

    let postTaxTotal = sumMoney(slice.postTaxDeductions.map((d) => d.amount));
    for (const deduction of slice.postTaxDeductions) {
      components.push({
        name: deduction.name,
        type: "DEDUCTION",
        calcMethod: "FIXED",
        rateOrAmount: money(deduction.amount),
        amount: money(deduction.amount),
        isTaxable: false,
        statutoryKey: null,
        sequence: STAGE.POST_TAX_DEDUCTION,
        basis: null,
        ruleId: deduction.ruleId,
      });
    }

    if (slice.necEmployee) {
      const dues = necDues(gross, slice.necEmployee);
      if (dues.greaterThan(0)) {
        postTaxTotal = sumMoney([postTaxTotal, dues]);
        components.push({
          name: `NEC dues — ${slice.necEmployee.councilName}`,
          type: "STATUTORY_DEDUCTION",
          calcMethod: slice.necEmployee.ratePercent !== null ? "PERCENT" : "FIXED",
          rateOrAmount: money(
            slice.necEmployee.ratePercent ?? slice.necEmployee.fixedAmount,
          ),
          amount: dues,
          isTaxable: false,
          statutoryKey: "NEC_EMPLOYEE",
          sequence: STAGE.NEC_EMPLOYEE,
          basis: gross,
        });
      }
    }

    // ── Employer side. Cost to the company, liability to an authority, and
    // absent from both gross and net.
    let employerCost = ZERO;

    const nssaEmployerBase = nssaEmployerShares[index] ?? ZERO;
    const nssaEmployer = money(nssaEmployerBase.times(exchangeRate));
    if (nssaEmployer.greaterThan(0) && input.nssaEmployer) {
      employerCost = sumMoney([employerCost, nssaEmployer]);
      components.push(
        percentComponent({
          name: "NSSA (employer)",
          type: "EMPLOYER_CONTRIBUTION",
          ratePercent: input.nssaEmployer.ratePercent,
          amount: nssaEmployer,
          basis: money(nssaChargedBase.times(exchangeRate)),
          statutoryKey: "NSSA_POBS_EMPLOYER",
          sequence: STAGE.NSSA_EMPLOYER,
        }),
      );
    }

    // APWCS, ZIMDEF and the SDL are charged on gross and are uncapped, so they
    // need no cross-currency apportionment.
    const employerLevies: Array<[ResolvedStatutoryRate | null, string, string, number]> = [
      [input.apwcs, "NSSA APWCS", "NSSA_APWCS", STAGE.NSSA_APWCS],
      [input.zimdef, "ZIMDEF", "ZIMDEF", STAGE.ZIMDEF],
      [
        input.standardsDevelopmentLevy,
        "Standards Development Levy",
        "STANDARDS_DEVELOPMENT_LEVY",
        STAGE.STANDARDS_DEVELOPMENT_LEVY,
      ],
    ];
    for (const [rate, name, key, sequence] of employerLevies) {
      if (!rate) continue;
      const { amount, basis } = contributionOn(gross, rate);
      if (amount.isZero()) continue;
      employerCost = sumMoney([employerCost, amount]);
      components.push(
        percentComponent({
          name,
          type: "EMPLOYER_CONTRIBUTION",
          ratePercent: rate.ratePercent,
          amount,
          basis,
          statutoryKey: key,
          sequence,
        }),
      );
    }

    if (slice.necEmployer) {
      const dues = necDues(gross, slice.necEmployer);
      if (dues.greaterThan(0)) {
        employerCost = sumMoney([employerCost, dues]);
        components.push({
          name: `NEC employer dues — ${slice.necEmployer.councilName}`,
          type: "EMPLOYER_CONTRIBUTION",
          calcMethod: slice.necEmployer.ratePercent !== null ? "PERCENT" : "FIXED",
          rateOrAmount: money(
            slice.necEmployer.ratePercent ?? slice.necEmployer.fixedAmount,
          ),
          amount: dues,
          isTaxable: false,
          statutoryKey: "NEC_EMPLOYER",
          sequence: STAGE.NEC_EMPLOYER,
          basis: gross,
        });
      }
    }

    const deductionsTotal = sumMoney([
      nssaEmployee,
      preTaxTotal,
      paye,
      aidsLevy,
      postTaxTotal,
    ]);
    const netAmount = clampAtZero(gross.minus(deductionsTotal));

    components.sort((a, b) => a.sequence - b.sequence);

    return {
      currency: slice.currency.trim().toUpperCase(),
      exchangeRate,
      grossAmount: gross,
      allowancesTotal,
      deductionsTotal,
      taxableGross,
      paye,
      aidsLevy,
      netAmount,
      employerCost,
      components,
    };
  });

  return { slices, nssaChargedBase, nssaCeilingReached };
}

/**
 * `gross − deductions = net`, checked.
 *
 * Exported because the identity is easy to break from outside the engine — an
 * approved `AdjustmentEntry` used to increment `netAmount` alone, leaving a line
 * whose own three numbers contradicted each other. Anything that moves a total
 * should assert this afterwards.
 */
export function netIdentityHolds(slice: {
  grossAmount: MoneyLike;
  deductionsTotal: MoneyLike;
  netAmount: MoneyLike;
}): boolean {
  const expected = clampAtZero(money(slice.grossAmount).minus(money(slice.deductionsTotal)));
  return expected.equals(money(slice.netAmount));
}

/** Sum a computed payroll's slices into the totals a `PayrollRun` carries. */
export function runTotals(payrolls: ComputedPayroll[]) {
  const slices = payrolls.flatMap((payroll) => payroll.slices);
  return {
    grossTotal: sumMoney(slices.map((slice) => slice.grossAmount)),
    allowancesTotal: sumMoney(slices.map((slice) => slice.allowancesTotal)),
    deductionsTotal: sumMoney(slices.map((slice) => slice.deductionsTotal)),
    netTotal: sumMoney(slices.map((slice) => slice.netAmount)),
    employerCostTotal: sumMoney(slices.map((slice) => slice.employerCost)),
  };
}

/** Re-exported so callers building slices need one import. */
export { maxMoney, minMoney };
