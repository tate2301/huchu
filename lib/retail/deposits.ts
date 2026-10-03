/**
 * Deposits on returnable bottles.
 *
 * A liquor store charges a deposit on each returnable bottle it sells and
 * takes it off again for each empty the customer brings back for that line —
 * the swap a bottle store does all day: twelve empties in, twelve full out,
 * no deposit. Empties back are counted per line and never more than the line
 * sells, so a basket's deposit is never negative; a customer returning empties
 * without buying is a cash payout, not a sale.
 *
 * Client-safe, and in whole cents rather than `lib/money`, which brings Prisma
 * with it: the till shows the deposit with the same arithmetic the server
 * charges, and a deposit is a price times a count, so cents are exact.
 */
export type DepositLine = {
  quantity: number;
  returnable?: boolean;
  depositAmount?: number | null;
  emptiesBack?: number;
};

/** Empties back that count against a line: whole bottles, at most what it sells. */
export function emptiesCounted(line: DepositLine): number {
  const back = Math.floor(Math.max(line.emptiesBack ?? 0, 0));
  return Math.min(back, Math.floor(Math.max(line.quantity, 0)));
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

/** One line's deposit after its empties, in cents. */
function lineDepositCents(line: DepositLine) {
  if (!line.returnable || !line.depositAmount) return 0;
  const bottles = Math.max(Math.floor(line.quantity) - emptiesCounted(line), 0);
  return cents(line.depositAmount) * bottles;
}

/** One line's deposit, after its empties. */
export function lineDeposit(line: DepositLine): number {
  return lineDepositCents(line) / 100;
}

/** The basket's deposit. */
export function depositsDue(lines: readonly DepositLine[]): number {
  return lines.reduce((total, line) => total + lineDepositCents(line), 0) / 100;
}
