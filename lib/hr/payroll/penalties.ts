/**
 * Disciplinary penalties on a pay run.
 *
 * A penalty HR marks as deducted (`DisciplinaryAction.penaltyStatus`
 * `DEDUCTED`) in a pay period comes off that period's net pay (owner's
 * decision, 14 Oct). It is a non-statutory deduction taken after every
 * statutory one, so taxable gross, PAYE, the AIDS levy, NSSA and NEC dues are
 * what they would have been without it, and the returns never see it.
 *
 * It is stored as an ordinary `PayrollLineComponent` (type `DEDUCTION`, no
 * statutory key, sequence `PENALTY_SEQUENCE`), so no column or table was
 * needed: `rateOrAmount` holds what HR marked and `amount` what payroll took,
 * which differ only when net pay could not cover it.
 *
 * No Prisma client here: the payslip reads the constants in the browser too.
 */

import type { Prisma } from "@prisma/client";

/**
 * Where a penalty sits in the working: after the post-tax deductions (100) and
 * NEC dues (110), before the employer's side (200). Also how a stored
 * component is known to be a penalty.
 */
export const PENALTY_SEQUENCE = 120;

const NAME_PREFIX = "Disciplinary penalty — ";

/** "Disciplinary penalty — Late for shift", at the length a component's name allows. */
export function penaltyComponentName(summary: string): string {
  return `${NAME_PREFIX}${summary.trim() || "no summary"}`.slice(0, 200);
}

/** The summary HR wrote, back out of a component's name. */
export function penaltySummary(name: string): string {
  return name.startsWith(NAME_PREFIX) ? name.slice(NAME_PREFIX.length) : name;
}

export function isPenaltyComponent(component: { type: string; sequence?: number | null }): boolean {
  return component.type === "DEDUCTION" && component.sequence === PENALTY_SEQUENCE;
}

/**
 * The penalties a run for the period deducts: marked deducted by HR, with an
 * amount, applied in the period (or effective in it when HR left no
 * application date).
 */
export function penaltiesInPeriodWhere(input: {
  companyId: string;
  employeeIds: string[];
  periodStart: Date;
  periodEnd: Date;
}): Prisma.DisciplinaryActionWhereInput {
  const inPeriod = { gte: input.periodStart, lte: input.periodEnd };
  return {
    companyId: input.companyId,
    employeeId: { in: input.employeeIds },
    penaltyStatus: "DEDUCTED",
    penaltyAmount: { gt: 0 },
    OR: [{ appliedAt: inPeriod }, { appliedAt: null, effectiveDate: inPeriod }],
  };
}

/**
 * What is left to deduct of each penalty once earlier runs in the same period
 * have taken `alreadyDeducted` (oldest penalty first). A penalty is deducted
 * once: a second run in the period takes only what the first could not.
 */
export function outstandingPenalties<T extends { amount: number }>(marked: readonly T[], alreadyDeducted: number): T[] {
  // In cents, so a float amount from HR never leaves a stray fraction behind.
  let taken = Math.max(Math.round(alreadyDeducted * 100), 0);
  const left: T[] = [];
  for (const penalty of marked) {
    const cents = Math.round(penalty.amount * 100);
    const covered = Math.min(taken, cents);
    taken -= covered;
    if (cents - covered > 0) left.push({ ...penalty, amount: (cents - covered) / 100 });
  }
  return left;
}
