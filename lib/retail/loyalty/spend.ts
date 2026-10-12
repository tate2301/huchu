import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * Spending points at the till (CUS-01, W-46): the sentences a spend is
 * refused with, what points are worth, and the spread of that worth over
 * the sale's lines. Browser-safe — the till previews with the same sums the
 * server charges; `ledger.ts#spendPoints` writes the spend.
 */

/** A spend the till's rules refuse: 400 with the till's sentence, 409 for a replay. */
export class LoyaltyRefusal extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 = 400,
  ) {
    super(message);
    this.name = "LoyaltyRefusal";
  }
}

export const LOYALTY_OFF = "Loyalty is off.";
export const PICK_THE_CUSTOMER = "Pick the customer first.";
export const SPENDING_NEEDS_THE_INTERNET = "Spending points needs the internet.";

/** "Tapiwa" from "Tapiwa Marange". */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** What `points` are worth at `pointValue` a point, floored to the cent: 500 at 0.01 → 5.00. */
export function pointsValue(points: number, pointValue: number): number {
  // Whole numbers throughout: the value in ten-thousandths of a dollar a point.
  const perPoint = Math.round(pointValue * 10_000);
  return Math.floor((Math.max(points, 0) * perPoint) / 100) / 100;
}

/**
 * Why these points cannot be spent on this sale, as the till says it; null
 * when they can. `payable` is what the lines points may pay come to (alcohol
 * left out where the shop's rule says).
 */
export function spendRefusal(input: {
  enabled: boolean;
  customer: { name: string; balance: number } | null;
  points: number;
  spendFrom: number;
  pointValue: number;
  payable: number;
}): string | null {
  if (!input.enabled) return LOYALTY_OFF;
  if (!input.customer) return PICK_THE_CUSTOMER;
  const name = firstName(input.customer.name);
  const balance = input.customer.balance;
  if (balance < input.spendFrom) {
    return `${name} needs ${formatCount(input.spendFrom)} points to spend them. They have ${formatCount(Math.max(balance, 0))}.`;
  }
  if (input.points > balance) return `${name} has ${formatCount(balance)} points.`;
  if (pointsValue(input.points, input.pointValue) > input.payable + 0.0001) {
    return `Points can pay ${formatMoney(input.payable)} of this sale.`;
  }
  return null;
}

export type SpreadLine = {
  /** What the line comes to, VAT included, after its own and the order's discounts. */
  lineTotal: number;
  discountAmount: number;
  taxAmount: number;
  taxPercent: number;
  /** Points may pay this line (not alcohol where the shop's rule says). */
  payable: boolean;
};

const toCents = (value: number) => Math.round(value * 100);

/**
 * The points' worth taken off the payable lines in proportion to what each
 * comes to, cents rounded down and the remainder on the largest line. Each
 * line's `lineTotal` falls by its share and its VAT is carved again from the
 * new inclusive total at its rate; its discount takes the rest, so
 * base − discount + tax = lineTotal still holds. The shares add up to
 * `value` exactly, so the sale's total falls by exactly `value`.
 */
export function spreadPointsDiscount<T extends SpreadLine>(lines: T[], value: number): { lines: T[]; shares: number[] } {
  const pool = toCents(value);
  const weights = lines.map((line) => (line.payable ? Math.max(toCents(line.lineTotal), 0) : 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (pool <= 0 || total <= 0) return { lines: lines.map((line) => ({ ...line })), shares: lines.map(() => 0) };
  if (pool > total) throw new LoyaltyRefusal(`Points can pay ${formatMoney(total / 100)} of this sale.`);
  const shares = weights.map((weight) => Math.floor((pool * weight) / total));
  let largest = 0;
  weights.forEach((weight, index) => {
    if (weight > weights[largest]!) largest = index;
  });
  shares[largest]! += pool - shares.reduce((sum, share) => sum + share, 0);
  const spread = lines.map((line, index) => {
    const share = shares[index]!;
    if (share === 0) return { ...line };
    const gross = toCents(line.lineTotal) - share;
    const net = line.taxPercent > 0 ? Math.round(gross / (1 + line.taxPercent / 100)) : gross;
    const oldNet = toCents(line.lineTotal) - toCents(line.taxAmount);
    return {
      ...line,
      lineTotal: gross / 100,
      taxAmount: (gross - net) / 100,
      discountAmount: (toCents(line.discountAmount) + (oldNet - net)) / 100,
    };
  });
  return { lines: spread, shares: shares.map((share) => share / 100) };
}
