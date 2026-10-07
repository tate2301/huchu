import type { OnHandLine } from "@/lib/retail/stock/on-hand";

import type { NeedsActionProvider, NeedsActionRow } from "./types";
import { countTitle } from "./words";

type StockLine = Pick<OnHandLine, "product" | "onHand" | "coverDays" | "level">;

/** Least cover first: an empty line, then the fewest days left, then a line that sells nothing, by what is on hand. */
export function byLeastCover(a: StockLine, b: StockLine): number {
  const cover = (line: StockLine) => (line.onHand <= 0 ? -1 : (line.coverDays ?? Number.POSITIVE_INFINITY));
  return cover(a) - cover(b) || a.onHand - b.onHand || a.product.localeCompare(b.product);
}

/** "Jameson Irish Whiskey 750ml has 9 left, about 3 days", or "… is out". */
export function stockLeftWords(line: StockLine): string {
  if (line.onHand <= 0) return `${line.product} is out`;
  const left = `${line.product} has ${line.onHand.toLocaleString("en-US")} left`;
  if (line.coverDays === null) return left;
  return `${left}, about ${line.coverDays} ${line.coverDays === 1 ? "day" : "days"}`;
}

/** "Seven products below reorder level" · the one that runs out first · the count, to On hand's Low tab. */
export function lowStockRow(lines: ReadonlyArray<StockLine>): NeedsActionRow | null {
  const low = lines.filter((line) => line.level === "LOW" || line.level === "OUT").sort(byLeastCover);
  if (low.length === 0) return null;
  return {
    key: "low-stock",
    tone: "warn",
    title: `${countTitle(low.length, "product", "products")} below reorder level`,
    meta: stockLeftWords(low[0]!),
    figure: String(low.length),
    figureTone: "ink",
    href: "/retail/stock?tab=low",
  };
}

export const lowStock: NeedsActionProvider = {
  key: "low-stock",
  can: ["retail.stock", "view"],
  load: async (ctx) => [lowStockRow(await ctx.lowStock())].filter((row) => row !== null),
};
