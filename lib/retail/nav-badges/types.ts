import type { RetailAction, RetailResource } from "@/lib/retail/permission-matrix";

/** Who is asking: the figures are worked out for the caller's role. */
export type NavBadgeContext = {
  companyId: string;
  userId: string;
  role: string;
};

/** One panel item's figure (00-foundations 4.3). */
export type NavBadgeProvider = {
  /** The nav item's href, exactly as `lib/navigation.ts` declares it. */
  href: string;
  /** Any of these grants shows the figure. */
  requires: ReadonlyArray<readonly [RetailResource, RetailAction]>;
  count(ctx: NavBadgeContext): Promise<number>;
  /** The words beside the item: "2 open", "3 on". */
  label(count: number): string;
};
