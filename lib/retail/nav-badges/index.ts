import { FLOOR_NAV_BADGES } from "./floor";
import { REPORTS_NAV_BADGES } from "./reports";
import { STOCK_NAV_BADGES } from "./stock";
import type { NavBadgeContext, NavBadgeProvider } from "./types";

export type { NavBadgeContext, NavBadgeProvider } from "./types";

/**
 * The figures beside panel items (00-foundations 4.3), one provider per item.
 *
 * Each area keeps its providers in its own file here and adds one line to this
 * list; nothing else in the shell changes when a badge arrives.
 */
export const NAV_BADGE_PROVIDERS: readonly NavBadgeProvider[] = [
  ...FLOOR_NAV_BADGES,
  ...STOCK_NAV_BADGES,
  ...REPORTS_NAV_BADGES,
];

/**
 * The badges for one caller, keyed by nav href. A count of 0 leaves the item
 * bare, so only non-empty figures are returned.
 */
export async function computeNavBadges(
  ctx: NavBadgeContext,
  providers: readonly NavBadgeProvider[],
): Promise<Record<string, string>> {
  const counted = await Promise.all(
    providers.map(async (provider) => [provider, await provider.count(ctx)] as const),
  );
  const badges: Record<string, string> = {};
  for (const [provider, count] of counted) {
    if (count > 0) badges[provider.href] = provider.label(count);
  }
  return badges;
}
