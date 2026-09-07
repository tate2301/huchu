/**
 * The seeded Zimbabwe statutory pack.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS A STARTING SET, NOT AN AUTHORITY.
 *
 *  Verify every figure below against the current ZIMRA PAYE tables and the
 *  current NSSA contribution schedule before running a payroll anybody is
 *  paid from. Rates change with each national budget and mid-year statutory
 *  instruments; the ZWG table in particular is revised more often than the
 *  USD one.
 *
 *  Every row is stamped `isSeeded: true` and carries its effective date and
 *  `source`, so an operator can see at a glance what came from here and what
 *  their accountant entered. Correcting a rate is adding a row with a later
 *  `effectiveFrom` — no deploy, no migration, and last month's payroll keeps
 *  recomputing on last month's numbers.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Why seed at all, given the warning? Because the alternative is a fresh
 * payroll-only workspace that cannot compute anything until somebody types in
 * six tables, and an empty product teaches nobody what shape the tables take.
 * A labelled starting set that refuses to be silently stale is the honest
 * middle: usable on day one, obviously provisional, and cheap to correct.
 */

import type { Prisma } from "@corelithzw/db";
import type { StatutoryRateKey, TaxCreditKey } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * The date every seeded row starts from, and the label operators will see.
 *
 * Deliberately a single constant: the whole pack shares one effective date so
 * "what did we seed, and as of when" has one answer.
 */
export const SEEDED_EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z");

export const SEEDED_SOURCE =
  "Seeded starting set — VERIFY against current ZIMRA/NSSA schedules before use";

type SeedBand = {
  lowerBound: string;
  upperBound: string | null;
  ratePercent: string;
  deductAmount: string;
};

type SeedPayeTable = {
  currency: string;
  label: string;
  bands: SeedBand[];
};

/**
 * PAYE bands, in ZIMRA's published subtract-method form.
 *
 * `tax = taxableGross × ratePercent − deductAmount`. The deduction on each band
 * is what makes the arithmetic continuous across the band boundary, and it is
 * the number printed on the circular — so a transcription error shows up as a
 * visible discontinuity rather than disappearing into a marginal calculation.
 *
 * The USD table is the monthly one. The ZWG table is the same band structure at
 * the pegged equivalent; both need checking against the current circular, and
 * the ZWG one needs checking more often.
 */
const SEEDED_PAYE_TABLES: SeedPayeTable[] = [
  {
    currency: "USD",
    label: "Monthly USD PAYE (seeded starting set)",
    bands: [
      { lowerBound: "0", upperBound: "100", ratePercent: "0", deductAmount: "0" },
      { lowerBound: "100.01", upperBound: "300", ratePercent: "20", deductAmount: "20" },
      { lowerBound: "300.01", upperBound: "1000", ratePercent: "25", deductAmount: "35" },
      { lowerBound: "1000.01", upperBound: "2000", ratePercent: "30", deductAmount: "85" },
      { lowerBound: "2000.01", upperBound: "3000", ratePercent: "35", deductAmount: "185" },
      { lowerBound: "3000.01", upperBound: null, ratePercent: "40", deductAmount: "335" },
    ],
  },
  {
    currency: "ZWG",
    label: "Monthly ZWG PAYE (seeded starting set)",
    bands: [
      { lowerBound: "0", upperBound: "2800", ratePercent: "0", deductAmount: "0" },
      { lowerBound: "2800.01", upperBound: "8400", ratePercent: "20", deductAmount: "560" },
      { lowerBound: "8400.01", upperBound: "28000", ratePercent: "25", deductAmount: "980" },
      { lowerBound: "28000.01", upperBound: "56000", ratePercent: "30", deductAmount: "2380" },
      { lowerBound: "56000.01", upperBound: "84000", ratePercent: "35", deductAmount: "5180" },
      { lowerBound: "84000.01", upperBound: null, ratePercent: "40", deductAmount: "9380" },
    ],
  },
];

type SeedRate = {
  key: StatutoryRateKey;
  currency: string | null;
  ratePercent: string;
  ceilingAmount?: string;
  floorAmount?: string;
  note: string;
};

const SEEDED_RATES: SeedRate[] = [
  {
    key: "AIDS_LEVY",
    // No currency: 3% of whatever PAYE was struck, in whichever currency.
    currency: null,
    ratePercent: "3",
    note: "3% of the PAYE figure, not of gross",
  },
  {
    key: "NSSA_POBS_EMPLOYEE",
    currency: "USD",
    ratePercent: "4.5",
    // The insurable-earnings ceiling. Contributions are charged on earnings up
    // to this and not a cent beyond, which is why it lives on the rate row
    // rather than being applied to the computed amount.
    ceilingAmount: "700",
    note: "4.5% of insurable earnings up to the ceiling",
  },
  {
    key: "NSSA_POBS_EMPLOYER",
    currency: "USD",
    ratePercent: "4.5",
    ceilingAmount: "700",
    note: "Employer's matching 4.5%, same ceiling",
  },
  {
    key: "NSSA_POBS_EMPLOYEE",
    currency: "ZWG",
    ratePercent: "4.5",
    ceilingAmount: "19600",
    note: "4.5% of insurable earnings up to the ZWG ceiling",
  },
  {
    key: "NSSA_POBS_EMPLOYER",
    currency: "ZWG",
    ratePercent: "4.5",
    ceilingAmount: "19600",
    note: "Employer's matching 4.5%, same ZWG ceiling",
  },
  {
    key: "NSSA_APWCS",
    currency: null,
    // Genuinely industry-dependent: the Accident Prevention and Workers
    // Compensation rate is set by risk class. Seeded at the common baseline and
    // flagged, because a mine and a bookshop do not pay the same.
    ratePercent: "0.9",
    note: "APWCS baseline — set by industry risk class, confirm yours",
  },
  {
    key: "ZIMDEF",
    currency: null,
    ratePercent: "1",
    note: "1% of gross, employer only",
  },
  {
    key: "STANDARDS_DEVELOPMENT_LEVY",
    currency: null,
    ratePercent: "0.5",
    note: "Standards Development Levy, employer only",
  },
  {
    key: "BONUS_EXEMPTION",
    currency: "USD",
    // Not a rate — the exempt slice of an annual bonus. Carried on
    // `ceilingAmount` because that is what it is: a cap on what escapes tax.
    ratePercent: "0",
    ceilingAmount: "700",
    note: "Exempt portion of an annual bonus (USD)",
  },
  {
    key: "BONUS_EXEMPTION",
    currency: "ZWG",
    ratePercent: "0",
    ceilingAmount: "19600",
    note: "Exempt portion of an annual bonus (ZWG)",
  },
];

type SeedCredit = {
  key: TaxCreditKey;
  currency: string;
  amount?: string;
  ratePercent?: string;
  note: string;
};

const SEEDED_CREDITS: SeedCredit[] = [
  {
    key: "MEDICAL_AID",
    currency: "USD",
    ratePercent: "50",
    note: "50% of the employee's medical aid contributions",
  },
  {
    key: "MEDICAL_AID",
    currency: "ZWG",
    ratePercent: "50",
    note: "50% of the employee's medical aid contributions",
  },
  {
    key: "ELDERLY",
    currency: "USD",
    amount: "75",
    note: "Elderly persons' credit, monthly",
  },
  {
    key: "ELDERLY",
    currency: "ZWG",
    amount: "2100",
    note: "Elderly persons' credit, monthly",
  },
  {
    key: "DISABILITY",
    currency: "USD",
    amount: "75",
    note: "Disabled persons' credit, monthly",
  },
  {
    key: "DISABILITY",
    currency: "ZWG",
    amount: "2100",
    note: "Disabled persons' credit, monthly",
  },
];

export type SeedStatutoryPackResult = {
  payeTablesCreated: number;
  ratesCreated: number;
  creditsCreated: number;
  skipped: boolean;
};

/**
 * Write the pack for a company, once.
 *
 * Idempotent, and deliberately conservative about it: if the company already
 * has *any* PAYE table at the seed's effective date, nothing is written at all.
 * A company that corrected a seeded rate must not have the correction reverted
 * the next time somebody re-runs provisioning — that would be the worst
 * possible failure mode, since the payroll would keep computing and would
 * silently go back to being wrong.
 */
export async function seedZimbabweStatutoryPack(
  input: { companyId: string; effectiveFrom?: Date },
  db: Db = prisma,
): Promise<SeedStatutoryPackResult> {
  const effectiveFrom = input.effectiveFrom ?? SEEDED_EFFECTIVE_FROM;

  const existing = await db.payeTable.count({
    where: { companyId: input.companyId },
  });
  if (existing > 0) {
    return {
      payeTablesCreated: 0,
      ratesCreated: 0,
      creditsCreated: 0,
      skipped: true,
    };
  }

  let payeTablesCreated = 0;
  for (const table of SEEDED_PAYE_TABLES) {
    await db.payeTable.create({
      data: {
        companyId: input.companyId,
        currency: table.currency,
        cycle: "MONTHLY",
        label: table.label,
        effectiveFrom,
        source: SEEDED_SOURCE,
        isSeeded: true,
        bands: {
          create: table.bands.map((band, index) => ({
            lowerBound: band.lowerBound,
            upperBound: band.upperBound,
            ratePercent: band.ratePercent,
            deductAmount: band.deductAmount,
            sortOrder: index,
          })),
        },
      },
    });
    payeTablesCreated += 1;
  }

  let ratesCreated = 0;
  for (const rate of SEEDED_RATES) {
    await db.statutoryRate.create({
      data: {
        companyId: input.companyId,
        key: rate.key,
        currency: rate.currency,
        ratePercent: rate.ratePercent,
        ceilingAmount: rate.ceilingAmount ?? null,
        floorAmount: rate.floorAmount ?? null,
        effectiveFrom,
        source: `${SEEDED_SOURCE} — ${rate.note}`,
        isSeeded: true,
      },
    });
    ratesCreated += 1;
  }

  let creditsCreated = 0;
  for (const credit of SEEDED_CREDITS) {
    await db.taxCredit.create({
      data: {
        companyId: input.companyId,
        key: credit.key,
        currency: credit.currency,
        amount: credit.amount ?? null,
        ratePercent: credit.ratePercent ?? null,
        effectiveFrom,
        source: `${SEEDED_SOURCE} — ${credit.note}`,
        isSeeded: true,
      },
    });
    creditsCreated += 1;
  }

  // NEC dues are deliberately not seeded. They are set per National Employment
  // Council and there are dozens; guessing one would be worse than having none,
  // because a wrong council name on a remittance is a wrong remittance.

  return { payeTablesCreated, ratesCreated, creditsCreated, skipped: false };
}

/**
 * The warning a UI must show wherever a seeded row is displayed.
 *
 * Exported rather than written inline in a component, so the wording cannot
 * drift between the tables screen, the payslip footnote and the run summary.
 */
export const SEEDED_PACK_WARNING =
  "These rates were seeded as a starting set. Check them against the current ZIMRA and NSSA schedules before you pay anyone from them.";
