import { formatCount } from "@/lib/workspace/format";

/**
 * Loyalty tiers (CUS-01, 60-customers §3.2): a name and the spend in 12
 * months it starts from, written "Silver, from US$500". Browser-safe; the
 * spend itself is read by `spendOverYear` in `ledger.ts`.
 */

export type LoyaltyTier = { name: string; from: string };

export const TIER_WRONG = "Write each tier as “Silver, from US$500”.";

const TIER_PATTERN = /^\s*(.+?)\s*,\s*from\s+US\$\s*([\d,]+(?:\.\d{1,2})?)\s*$/i;

const cents = (amount: string | number) => Math.round(Number(amount) * 100);

/** "Silver, from US$500" → `{ name: "Silver", from: "500.00" }`; null when it is not written that way. */
export function parseTier(text: string): LoyaltyTier | null {
  const match = TIER_PATTERN.exec(text);
  if (!match) return null;
  const amount = match[2]!.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) > 10_000_000) return null;
  const name = match[1]!.trim();
  if (!name || name.length > 40) return null;
  return { name, from: Number(amount).toFixed(2) };
}

/** `{ name: "Gold", from: "1500.00" }` → "Gold, from US$1,500". */
export function tierTag(tier: LoyaltyTier): string {
  const value = cents(tier.from);
  const whole = value % 100 === 0;
  const amount = whole
    ? formatCount(value / 100)
    : `${formatCount(Math.floor(value / 100))}.${String(value % 100).padStart(2, "0")}`;
  return `${tier.name}, from US$${amount}`;
}

/** Tiers lowest first. */
export function sortTiers(tiers: LoyaltyTier[]): LoyaltyTier[] {
  return [...tiers].sort((a, b) => cents(a.from) - cents(b.from));
}

/** The top tier: the one that earns `topTierEarnPerDollar`. */
export function isTopTier(name: string | null, tiers: LoyaltyTier[]): boolean {
  const sorted = sortTiers(tiers);
  return name !== null && sorted.length > 0 && sorted[sorted.length - 1]!.name === name;
}

/**
 * The customer's tier: one held for them while `until` has not passed and the
 * tier still exists, else the highest whose `from` their spend in 12 months
 * has reached. Null when no tier starts low enough (never, with a tier from
 * US$0).
 */
export function tierFor(input: {
  spend12m: string | number;
  settings: { tiers: LoyaltyTier[] };
  held: { name: string; until: string } | null;
  /** `YYYY-MM-DD` in the shop's zone. */
  today: string;
}): string | null {
  const tiers = sortTiers(input.settings.tiers);
  if (input.held && input.held.until >= input.today && tiers.some((tier) => tier.name === input.held!.name)) {
    return input.held.name;
  }
  const spend = cents(input.spend12m);
  let reached: string | null = null;
  for (const tier of tiers) if (cents(tier.from) <= spend) reached = tier.name;
  return reached;
}
