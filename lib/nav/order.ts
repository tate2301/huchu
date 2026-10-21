import type { NavRank } from "@/lib/navigation";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const TIER: Record<NavRank | "pinned" | "rest", number> = {
  pinned: 0,
  flow: 1,
  own: 2,
  rest: 3,
};

/**
 * The order a sidebar list is read in.
 *
 * What the person pinned comes first, A to Z. Then the business's own work in
 * the order it was declared, which is the order that work moves; then the
 * person's own pages; then everything else. With `alphabetical`, that last
 * tier is A to Z, so a row is found by its name rather than by remembering
 * where the product happened to put it. Without it, the declared order stands.
 */
export function orderRows<T>(
  items: readonly T[],
  {
    label,
    rank = () => undefined,
    isPinned = () => false,
    alphabetical = true,
  }: {
    label: (item: T) => string;
    rank?: (item: T) => NavRank | undefined;
    isPinned?: (item: T) => boolean;
    alphabetical?: boolean;
  },
): T[] {
  const tierOf = (item: T) => TIER[isPinned(item) ? "pinned" : (rank(item) ?? "rest")];
  return [...items].sort((a, b) => {
    const tier = tierOf(a) - tierOf(b);
    if (tier !== 0) return tier;
    const byName = tierOf(a) === TIER.pinned || (tierOf(a) === TIER.rest && alphabetical);
    return byName ? collator.compare(label(a), label(b)) : 0;
  });
}
