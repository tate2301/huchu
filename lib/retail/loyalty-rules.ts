/**
 * The loyalty scheme's rules, with no database behind them, so the till can
 * work out a redemption offline. `lib/retail/loyalty.ts` reads balances.
 */
export const LOYALTY_REDEEM_POINTS_PER_USD = 100;
export const LOYALTY_MAX_REDEEM_SHARE = 0.2;

export function getLoyaltyTier(points: number) {
  if (points >= 2_000) return "GOLD";
  if (points >= 500) return "SILVER";
  return "BRONZE";
}

export function parseLoyaltyRedeemPoints(notes: string | null | undefined) {
  const text = notes ?? "";
  const match = text.match(/LOYALTY_REDEEM:(\d+)/);
  return match ? Number(match[1]) : 0;
}
