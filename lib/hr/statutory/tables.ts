/**
 * Reading the Zimbabwe statutory tables for a pay period.
 *
 * One rule governs this whole file: **a missing table is an error, never a
 * fallback.** If no PAYE table covers August 2026, the run stops and says so.
 * It does not use July's, and it does not use the newest one on file.
 *
 * That is a deliberate choice against the obvious convenience. A stale band
 * table does not fail loudly — it produces a payslip that looks right, is
 * wrong by a few dollars, and is wrong the same way for every employee, so
 * nobody notices until ZIMRA reconciles the P2 against what was remitted. The
 * cost of stopping is one operator adding a row. The cost of guessing is a
 * quiet under-remittance across a whole workforce.
 *
 * Everything here is a plain read plus `Decimal` arithmetic — no writes, no
 * feature checks — so the engine in `lib/hr/payroll/` can be tested against
 * hand-worked figures without a database.
 */

import { Prisma } from "@prisma/client";
import type {
  PayrollCycle,
  StatutoryRateKey,
  TaxCreditKey,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  clampAtZero,
  maxMoney,
  minMoney,
  money,
  percent,
  taxOn,
  ZERO,
  type MoneyLike,
} from "@/lib/money";

/** Anything Prisma-shaped we can read through, including a transaction. */
type Db = typeof prisma | Prisma.TransactionClient;

/**
 * No statutory row covers the pay period.
 *
 * Carries the pieces separately as well as the message, so a UI can offer
 * "add a PAYE table for August 2026" rather than only printing a sentence.
 */
export class MissingStatutoryTableError extends Error {
  constructor(
    readonly what: string,
    readonly periodLabel: string,
    readonly currency?: string,
  ) {
    super(
      currency
        ? `No ${what} covers ${periodLabel} for ${currency}`
        : `No ${what} covers ${periodLabel}`,
    );
    this.name = "MissingStatutoryTableError";
  }
}

const PERIOD_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** "August 2026" — what the refusal message names. */
export function periodLabel(on: Date) {
  return PERIOD_LABEL.format(on);
}

/**
 * Effective-dating, in one place.
 *
 * A row covers a date when it started on or before it and has not ended by it.
 * `effectiveTo: null` means open-ended, which is the normal state of the
 * current table.
 */
function coversDate(on: Date) {
  return {
    effectiveFrom: { lte: on },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: on } }],
  };
}

export type ResolvedPayeBand = {
  lowerBound: Prisma.Decimal;
  upperBound: Prisma.Decimal | null;
  ratePercent: Prisma.Decimal;
  deductAmount: Prisma.Decimal;
};

export type ResolvedPayeTable = {
  id: string;
  label: string;
  currency: string;
  cycle: PayrollCycle;
  effectiveFrom: Date;
  bands: ResolvedPayeBand[];
};

/**
 * The PAYE table for one currency over one period.
 *
 * Throws `MissingStatutoryTableError` when nothing covers the period, and also
 * when a table exists but has no bands — an empty table would otherwise tax
 * everybody at zero, which is the same silent-wrong-number failure by another
 * route.
 */
export async function resolvePayeTable(
  input: {
    companyId: string;
    currency: string;
    on: Date;
    cycle?: PayrollCycle;
  },
  db: Db = prisma,
): Promise<ResolvedPayeTable> {
  const currency = input.currency.trim().toUpperCase();
  const cycle = input.cycle ?? "MONTHLY";

  const table = await db.payeTable.findFirst({
    where: {
      companyId: input.companyId,
      currency,
      cycle,
      ...coversDate(input.on),
    },
    orderBy: [{ effectiveFrom: "desc" }],
    select: {
      id: true,
      label: true,
      currency: true,
      cycle: true,
      effectiveFrom: true,
      bands: {
        orderBy: [{ sortOrder: "asc" }, { lowerBound: "asc" }],
        select: {
          lowerBound: true,
          upperBound: true,
          ratePercent: true,
          deductAmount: true,
        },
      },
    },
  });

  if (!table) {
    throw new MissingStatutoryTableError(
      "PAYE table",
      periodLabel(input.on),
      currency,
    );
  }
  if (table.bands.length === 0) {
    throw new MissingStatutoryTableError(
      `PAYE table with bands ("${table.label}" has none)`,
      periodLabel(input.on),
      currency,
    );
  }

  return table;
}

/**
 * PAYE on a taxable gross, by the published subtract method.
 *
 * `tax = taxableGross × ratePercent − deductAmount`, using the band the gross
 * falls in. This is the arithmetic on the ZIMRA circular, so an accountant can
 * check a payslip against it line by line.
 *
 * Never negative: the first band's deduction is zero and later deductions are
 * calibrated to the band floor, but a mistranscribed table could invert that,
 * and a negative PAYE would become a payment *to* the employee.
 */
export function payeOn(
  taxableGross: MoneyLike,
  table: ResolvedPayeTable,
): { tax: Prisma.Decimal; band: ResolvedPayeBand | null } {
  const gross = money(taxableGross);
  if (gross.lessThanOrEqualTo(0)) return { tax: ZERO, band: null };

  const band = table.bands.find((candidate) => {
    if (gross.lessThan(candidate.lowerBound)) return false;
    if (candidate.upperBound === null) return true;
    return gross.lessThanOrEqualTo(candidate.upperBound);
  });

  // Above every band with a ceiling and no open-ended top band — a table that
  // stops short. Taxing at zero would be the wrong answer, so refuse to guess
  // and use the highest band on file, which is the accountant's reading of an
  // incomplete circular.
  const applicable = band ?? table.bands[table.bands.length - 1] ?? null;
  if (!applicable) return { tax: ZERO, band: null };

  const gross_tax = taxOn(gross, applicable.ratePercent);
  return {
    tax: clampAtZero(gross_tax.minus(applicable.deductAmount)),
    band: applicable,
  };
}

export type ResolvedStatutoryRate = {
  key: StatutoryRateKey;
  currency: string | null;
  ratePercent: Prisma.Decimal;
  ceilingAmount: Prisma.Decimal | null;
  floorAmount: Prisma.Decimal | null;
};

/**
 * One statutory rate for a period.
 *
 * A currency-specific row wins over a currency-agnostic one — the NSSA ceiling
 * is denominated, the AIDS levy is not. Returns null rather than throwing,
 * because whether a given levy is *required* is the caller's judgement: ZIMDEF
 * is mandatory, APWCS depends on the industry class, and a company with no NEC
 * has none.
 */
export async function resolveStatutoryRate(
  input: {
    companyId: string;
    key: StatutoryRateKey;
    currency?: string | null;
    on: Date;
  },
  db: Db = prisma,
): Promise<ResolvedStatutoryRate | null> {
  const currency = input.currency?.trim().toUpperCase() ?? null;

  const rows = await db.statutoryRate.findMany({
    where: {
      companyId: input.companyId,
      key: input.key,
      // `{ in: [currency, null] }` is rejected by Prisma 7 — a null cannot sit
      // in an `in` list — so the two cases are an explicit OR. Nested under
      // `AND` because `coversDate` already owns the top-level `OR`.
      AND: [
        currency
          ? { OR: [{ currency }, { currency: null }] }
          : { currency: null },
        coversDate(input.on),
      ],
    },
    orderBy: [{ effectiveFrom: "desc" }],
    select: {
      key: true,
      currency: true,
      ratePercent: true,
      ceilingAmount: true,
      floorAmount: true,
    },
  });

  if (rows.length === 0) return null;
  return rows.find((row) => row.currency === currency) ?? rows[0];
}

/**
 * As `resolveStatutoryRate`, but the caller has decided this one is mandatory.
 *
 * Used for the levies a Zimbabwean employer cannot opt out of. The error names
 * the key, so "No NSSA_POBS_EMPLOYEE rate covers August 2026" tells an operator
 * exactly which row to add.
 */
export async function requireStatutoryRate(
  input: {
    companyId: string;
    key: StatutoryRateKey;
    currency?: string | null;
    on: Date;
  },
  db: Db = prisma,
): Promise<ResolvedStatutoryRate> {
  const rate = await resolveStatutoryRate(input, db);
  if (!rate) {
    throw new MissingStatutoryTableError(
      `${input.key} rate`,
      periodLabel(input.on),
      input.currency ?? undefined,
    );
  }
  return rate;
}

/**
 * A contribution at a rate, with the ceiling and floor applied to the *base*.
 *
 * The order matters and is easy to get backwards: NSSA is 4.5% of insurable
 * earnings **capped at the ceiling**, not 4.5% of earnings then capped at the
 * ceiling. On a ceiling of 700 and earnings of 5,000 the first gives 31.50 and
 * the second gives 225. Only the first is what NSSA collects.
 */
export function contributionOn(
  base: MoneyLike,
  rate: Pick<ResolvedStatutoryRate, "ratePercent" | "ceilingAmount" | "floorAmount">,
): { amount: Prisma.Decimal; basis: Prisma.Decimal } {
  let basis = clampAtZero(base);
  if (rate.floorAmount !== null) basis = maxMoney(basis, rate.floorAmount);
  if (rate.ceilingAmount !== null) basis = minMoney(basis, rate.ceilingAmount);
  return { amount: taxOn(basis, rate.ratePercent), basis };
}

export type ResolvedTaxCredit = {
  key: TaxCreditKey;
  amount: Prisma.Decimal | null;
  ratePercent: Prisma.Decimal | null;
};

/** Every credit on file for a currency and period. */
export async function resolveTaxCredits(
  input: { companyId: string; currency: string; on: Date },
  db: Db = prisma,
): Promise<ResolvedTaxCredit[]> {
  const rows = await db.taxCredit.findMany({
    where: {
      companyId: input.companyId,
      currency: input.currency.trim().toUpperCase(),
      ...coversDate(input.on),
    },
    orderBy: [{ key: "asc" }, { effectiveFrom: "desc" }],
    select: { key: true, amount: true, ratePercent: true },
  });

  // Effective-dating can return two rows for one key when a new one starts
  // mid-window; the newest wins. `orderBy` puts it first.
  const byKey = new Map<TaxCreditKey, ResolvedTaxCredit>();
  for (const row of rows) if (!byKey.has(row.key)) byKey.set(row.key, row);
  return Array.from(byKey.values());
}

/**
 * What a credit is worth to this employee.
 *
 * A flat credit is its amount. A proportional one — medical aid at 50% — is a
 * share of what the employee actually contributed, so it is worth nothing to
 * somebody who contributed nothing.
 */
export function creditValue(
  credit: ResolvedTaxCredit,
  contribution: MoneyLike = ZERO,
): Prisma.Decimal {
  if (credit.ratePercent !== null) {
    return taxOn(contribution, credit.ratePercent);
  }
  return money(credit.amount);
}

/** The NEC agreement in force, if the company has one. */
export async function resolveNecAgreement(
  input: { companyId: string; currency: string; on: Date },
  db: Db = prisma,
) {
  return db.necAgreement.findFirst({
    where: {
      companyId: input.companyId,
      currency: input.currency.trim().toUpperCase(),
      isActive: true,
      ...coversDate(input.on),
    },
    orderBy: [{ effectiveFrom: "desc" }],
    select: {
      id: true,
      councilName: true,
      currency: true,
      employeeRatePercent: true,
      employeeFixedAmount: true,
      employerRatePercent: true,
      employerFixedAmount: true,
    },
  });
}

/** A side of an NEC agreement, resolved to an amount. */
export function necDues(
  base: MoneyLike,
  side: {
    ratePercent: Prisma.Decimal | null;
    fixedAmount: Prisma.Decimal | null;
  },
): Prisma.Decimal {
  if (side.ratePercent !== null) return taxOn(base, side.ratePercent);
  return money(side.fixedAmount);
}

/**
 * Whether a company has enough on file to run payroll for a period at all.
 *
 * Called before a run computes, so the exceptions screen can list every gap at
 * once rather than surfacing them one failed run at a time. An operator would
 * rather see "no PAYE table for ZWG, no NSSA rate" together than fix one, retry,
 * and find the next.
 */
export async function findStatutoryGaps(
  input: { companyId: string; currencies: string[]; on: Date },
  db: Db = prisma,
): Promise<string[]> {
  const gaps: string[] = [];
  const label = periodLabel(input.on);

  for (const raw of new Set(input.currencies)) {
    const currency = raw.trim().toUpperCase();
    try {
      await resolvePayeTable({ companyId: input.companyId, currency, on: input.on }, db);
    } catch (error) {
      if (error instanceof MissingStatutoryTableError) gaps.push(error.message);
      else throw error;
    }

    const nssa = await resolveStatutoryRate(
      { companyId: input.companyId, key: "NSSA_POBS_EMPLOYEE", currency, on: input.on },
      db,
    );
    if (!nssa) gaps.push(`No NSSA employee rate covers ${label} for ${currency}`);
  }

  const aids = await resolveStatutoryRate(
    { companyId: input.companyId, key: "AIDS_LEVY", on: input.on },
    db,
  );
  if (!aids) gaps.push(`No AIDS levy rate covers ${label}`);

  return gaps;
}

/** Cheap re-export so callers need one import for the percentage helpers. */
export { percent };
