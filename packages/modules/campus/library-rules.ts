/**
 * Lending rules, with no database behind them.
 *
 * Pure so the issue desk can show a reader's limit and a fine before anything
 * is written, and so there is one definition rather than one in the handler and
 * another in the UI.
 */

export type LendingPolicy = {
  /** How many books one reader may have out at once. */
  loanLimit: number;
  /** How long a loan runs, in days. */
  loanDays: number;
  /** How many times a loan may be renewed. */
  renewalLimit: number;
  /** Charged per day late, in the school's currency. */
  finePerDay: number;
  /** A fine never exceeds this, however long the book is out. */
  maxFine: number;
};

/**
 * What a school starts with.
 *
 * Three books for two weeks, two renewals, five cents a day capped at ten
 * units. A starting point rather than a rule — every one of these is the kind
 * of thing a librarian changes in the first week, and the cap exists because a
 * book forgotten over a long holiday should not come back with a fine larger
 * than the book.
 */
export const DEFAULT_LENDING_POLICY: LendingPolicy = {
  loanLimit: 3,
  loanDays: 14,
  renewalLimit: 2,
  finePerDay: 0.05,
  maxFine: 10,
};

/** Whole days late, floored at zero. Partial days do not carry a charge. */
export function daysOverdue(dueAt: Date, returnedAt: Date) {
  const day = 24 * 60 * 60 * 1000;
  const due = Date.UTC(dueAt.getUTCFullYear(), dueAt.getUTCMonth(), dueAt.getUTCDate());
  const back = Date.UTC(
    returnedAt.getUTCFullYear(),
    returnedAt.getUTCMonth(),
    returnedAt.getUTCDate(),
  );
  return Math.max(0, Math.round((back - due) / day));
}

/**
 * What is owed on a book returned late.
 *
 * Rounded to two places, because it becomes a line on a fee invoice, and capped
 * because a book forgotten over the summer should not come back owing more than
 * it cost.
 */
export function overdueFine(
  dueAt: Date,
  returnedAt: Date,
  policy: LendingPolicy = DEFAULT_LENDING_POLICY,
) {
  const late = daysOverdue(dueAt, returnedAt);
  if (late === 0) return 0;
  const raw = late * policy.finePerDay;
  return Math.round(Math.min(raw, policy.maxFine) * 100) / 100;
}

/** The due date for a loan issued on `from`. */
export function dueDateFor(from: Date, policy: LendingPolicy = DEFAULT_LENDING_POLICY) {
  return new Date(from.getTime() + policy.loanDays * 24 * 60 * 60 * 1000);
}

/**
 * Why a reader may not take another book out, or null when they may.
 *
 * An unpaid fine stops a loan, which is the only lever a school library has.
 * Being over the limit is separate, because the fix is different: bring one
 * back, versus pay what you owe.
 */
export function borrowingRefusal(
  reader: { name: string; openLoans: number; unpaidFines: number },
  policy: LendingPolicy = DEFAULT_LENDING_POLICY,
): string | null {
  if (reader.unpaidFines > 0) {
    return `${reader.name} owes ${reader.unpaidFines.toFixed(2)} in fines`;
  }
  if (reader.openLoans >= policy.loanLimit) {
    return `${reader.name} already has ${reader.openLoans} book${reader.openLoans === 1 ? "" : "s"} out — the limit is ${policy.loanLimit}`;
  }
  return null;
}
