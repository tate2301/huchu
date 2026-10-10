import { prisma } from "@/lib/prisma";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { asMeta, countTitle } from "./words";

/** "Three sales to look at" · the newest one's reason · the count, to Sales' flagged ones. */
export function flaggedRow(count: number, newestReason: string | null): NeedsActionRow | null {
  if (count === 0) return null;
  return {
    key: "flagged-sales",
    tone: "warn",
    title: `${countTitle(count, "sale", "sales")} to look at`,
    meta: asMeta(newestReason ?? ""),
    figure: String(count),
    figureTone: "ink",
    href: "/retail/sales?tab=all&flagged=only",
  };
}

export const flaggedSales: NeedsActionProvider = {
  key: "flagged-sales",
  can: ["retail.sell", "update"],
  load: async (ctx) => {
    const flagged = await prisma.retailSale.findMany({
      where: {
        companyId: ctx.companyId,
        ...(ctx.siteIds ? { siteId: { in: ctx.siteIds } } : {}),
        reviewReason: { not: null },
        reviewedAt: null,
      },
      select: { reviewReason: true },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    });
    return [flaggedRow(flagged.length, flagged[0]?.reviewReason ?? null)].filter((row) => row !== null);
  },
};
