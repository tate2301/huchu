/**
 * The arithmetic behind the two free tools on the marketing site: the
 * fiscalisation penalty calculator and the VAT threshold checker.
 *
 * Both tools exist to win accountants, and an accountant checks the number
 * before they trust the vendor. That is why the maths lives here under test
 * rather than inside a React component — a figure a reader can falsify in
 * thirty seconds has to be right the first time.
 *
 * Every rule below is a statutory one, not a Corelith one. The constants carry
 * their authority so that when the law moves, whoever changes the figure can
 * see what they are changing.
 */

// ---------------------------------------------------------------------------
// Fiscalisation penalty — s10(1), SI 104 of 2010
// ---------------------------------------------------------------------------

/** Civil penalty per point of sale, per day in default. */
export const PENALTY_USD_PER_TILL_PER_DAY = 25;

/**
 * The civil penalty accrues for at most 181 days. Past that the liability is
 * no longer a running daily charge — it converts to a criminal offence — so
 * multiplying out beyond this point does not describe any exposure that exists.
 * An uncapped calculator produces six-figure numbers for a two-year default and
 * the first accountant who checks it stops trusting everything else we publish.
 */
export const PENALTY_CAP_DAYS = 181;

/** The most the civil penalty can ever reach for a single till. */
export const PENALTY_MAX_PER_TILL_USD = PENALTY_USD_PER_TILL_PER_DAY * PENALTY_CAP_DAYS;

/** Upper bounds on what a user may type, so the tool cannot be made to print nonsense. */
export const PENALTY_MAX_TILLS = 1_000;
export const PENALTY_MAX_DAYS = 3_650;

export const PENALTY_AUTHORITY =
  "Section 10(1) of Statutory Instrument 104 of 2010 (Value Added Tax (Fiscalised Recording of Taxable Transactions) Regulations)";

/** What replaces the daily charge once the cap is passed. */
export const PENALTY_CRIMINAL_CONSEQUENCE =
  "a fine not exceeding level seven, imprisonment for up to 12 months, or both";

export type FiscalisationPenaltyInput = {
  /** Points of sale operating without fiscalisation. */
  tills: number;
  /** Days the operator has been in default. */
  daysInDefault: number;
};

export type FiscalisationPenalty = {
  tills: number;
  daysInDefault: number;
  /** Days the civil penalty actually accrues over — never more than the cap. */
  chargeableDays: number;
  /** What one more day of default costs while the penalty is still running. */
  dailyPenaltyUsd: number;
  /** The number to publish: the civil penalty as the cap allows it. */
  penaltyUsd: number;
  /** What a naive tills x days x $25 would have printed. Shown as a contrast, never as exposure. */
  uncappedPenaltyUsd: number;
  isCapped: boolean;
  daysBeyondCap: number;
  /** Days of civil penalty still available before the cap is reached. */
  daysUntilCap: number;
  /**
   * True once the default has run past the cap: the exposure is no longer a
   * bigger invoice, it is a prosecution.
   */
  convertsToCriminalLiability: boolean;
};

/**
 * Counts of physical things. A fractional till and a negative day are not
 * states the regulation contemplates, so they are normalised rather than
 * propagated into a number someone might act on.
 */
function normaliseCount(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), max);
}

export function calculateFiscalisationPenalty(
  input: FiscalisationPenaltyInput,
): FiscalisationPenalty {
  const tills = normaliseCount(input.tills, PENALTY_MAX_TILLS);
  const daysInDefault = normaliseCount(input.daysInDefault, PENALTY_MAX_DAYS);

  const chargeableDays = Math.min(daysInDefault, PENALTY_CAP_DAYS);
  const isCapped = daysInDefault > PENALTY_CAP_DAYS;

  return {
    tills,
    daysInDefault,
    chargeableDays,
    dailyPenaltyUsd: isCapped ? 0 : tills * PENALTY_USD_PER_TILL_PER_DAY,
    penaltyUsd: tills * chargeableDays * PENALTY_USD_PER_TILL_PER_DAY,
    uncappedPenaltyUsd: tills * daysInDefault * PENALTY_USD_PER_TILL_PER_DAY,
    isCapped,
    daysBeyondCap: Math.max(daysInDefault - PENALTY_CAP_DAYS, 0),
    daysUntilCap: Math.max(PENALTY_CAP_DAYS - daysInDefault, 0),
    convertsToCriminalLiability: isCapped,
  };
}

// ---------------------------------------------------------------------------
// VAT registration threshold — s23 VAT Act, threshold set by Finance Act 13/2023
// ---------------------------------------------------------------------------

/** Compulsory registration threshold on taxable supplies, in US dollars. */
export const VAT_THRESHOLD_USD = 25_000;

/** The threshold is measured over a rolling window, not a tax year. */
export const VAT_THRESHOLD_WINDOW_MONTHS = 12;

/** Effective date of the current figure — it was US$40,000 before this. */
export const VAT_THRESHOLD_EFFECTIVE_FROM = "1 January 2024";

/** Standard rate applied to taxable supplies once registered. */
export const VAT_STANDARD_RATE = 0.15;

/** Days to notify ZIMRA once the threshold is reached or foreseen. */
export const VAT_REGISTRATION_WINDOW_DAYS = 30;

/**
 * How close to the threshold counts as "plan for this now". Registration is
 * triggered by turnover you *expect* as well as turnover you have made, so a
 * business at four fifths of the threshold is already inside the decision.
 */
export const VAT_APPROACHING_RATIO = 0.8;

export const VAT_MAX_TURNOVER_USD = 100_000_000;

export type TurnoverBasis = "monthly" | "annual";

export type VatThresholdStatus = "liable" | "approaching" | "below";

export type VatThresholdCheck = {
  basis: TurnoverBasis;
  /** The figure as typed, normalised. */
  enteredTurnoverUsd: number;
  /** The figure the threshold is actually tested against. */
  annualTaxableSuppliesUsd: number;
  thresholdUsd: number;
  status: VatThresholdStatus;
  /** True only for `liable` — the point of the tool is this boolean. */
  mustRegister: boolean;
  /** Turnover still available before the threshold is crossed. Zero once liable. */
  headroomUsd: number;
  /** Turnover above the threshold. Zero until liable. */
  excessUsd: number;
  /** Share of the threshold used, as a 0-1 ratio. Uncapped, so 2 means double. */
  thresholdRatio: number;
  /** Monthly run-rate that reaches the threshold in a year — the number owners think in. */
  monthlyThresholdEquivalentUsd: number;
  /**
   * Output VAT at the standard rate on those supplies, treating the entered
   * figure as VAT-exclusive. Indicative only: it ignores input VAT, zero-rated
   * and exempt supplies.
   */
  indicativeAnnualOutputVatUsd: number;
  registrationWindowDays: number;
};

function normaliseMoney(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(Math.min(value, max) * 100) / 100;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function checkVatThreshold(input: {
  turnoverUsd: number;
  basis: TurnoverBasis;
}): VatThresholdCheck {
  const basis: TurnoverBasis = input.basis === "monthly" ? "monthly" : "annual";
  const enteredTurnoverUsd = normaliseMoney(input.turnoverUsd, VAT_MAX_TURNOVER_USD);
  const annualTaxableSuppliesUsd = round2(
    basis === "monthly"
      ? enteredTurnoverUsd * VAT_THRESHOLD_WINDOW_MONTHS
      : enteredTurnoverUsd,
  );

  // The Act reads "exceeds or is expected to exceed", so equalling the
  // threshold exactly does not yet compel registration.
  const isLiable = annualTaxableSuppliesUsd > VAT_THRESHOLD_USD;
  const thresholdRatio = round2(annualTaxableSuppliesUsd / VAT_THRESHOLD_USD);

  const status: VatThresholdStatus = isLiable
    ? "liable"
    : annualTaxableSuppliesUsd >= VAT_THRESHOLD_USD * VAT_APPROACHING_RATIO
      ? "approaching"
      : "below";

  return {
    basis,
    enteredTurnoverUsd,
    annualTaxableSuppliesUsd,
    thresholdUsd: VAT_THRESHOLD_USD,
    status,
    mustRegister: isLiable,
    headroomUsd: round2(Math.max(VAT_THRESHOLD_USD - annualTaxableSuppliesUsd, 0)),
    excessUsd: round2(Math.max(annualTaxableSuppliesUsd - VAT_THRESHOLD_USD, 0)),
    thresholdRatio,
    monthlyThresholdEquivalentUsd: round2(VAT_THRESHOLD_USD / VAT_THRESHOLD_WINDOW_MONTHS),
    indicativeAnnualOutputVatUsd: round2(annualTaxableSuppliesUsd * VAT_STANDARD_RATE),
    registrationWindowDays: VAT_REGISTRATION_WINDOW_DAYS,
  };
}
