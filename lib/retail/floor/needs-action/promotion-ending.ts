import { prisma } from "@/lib/prisma";
import { startOfDayIn } from "@/lib/reports/list-query";
import { addDays, DEFAULT_TIME_ZONE } from "@/lib/workspace/format";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { countTitle } from "./words";

/** "Promotion ends tomorrow" · its name; several: "Two promotions end tomorrow" · their names. */
export function promotionRow(names: ReadonlyArray<string>): NeedsActionRow | null {
  if (names.length === 0) return null;
  return {
    key: "promotion-ending",
    tone: "info",
    title: names.length === 1 ? "Promotion ends tomorrow" : `${countTitle(names.length, "promotion", "promotions")} end tomorrow`,
    meta: names.join(", "),
    figure: String(names.length),
    figureTone: "ink",
    href: "/retail/products/promotions",
  };
}

export const promotionEnding: NeedsActionProvider = {
  key: "promotion-ending",
  can: ["retail.promotions", "view"],
  load: async (ctx) => {
    const promotions = await prisma.retailPromotion.findMany({
      where: {
        companyId: ctx.companyId,
        archivedAt: null,
        status: { not: "INACTIVE" },
        endsAt: { gte: startOfDayIn(ctx.tomorrow, DEFAULT_TIME_ZONE), lt: startOfDayIn(addDays(ctx.tomorrow, 1), DEFAULT_TIME_ZONE) },
      },
      select: { name: true },
      orderBy: { endsAt: "asc" },
    });
    return [promotionRow(promotions.map((promotion) => promotion.name))].filter((row) => row !== null);
  },
};
