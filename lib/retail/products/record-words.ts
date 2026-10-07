import { ageCheckWords } from "@/lib/retail/products/age-check";
import { changeOn, changeTone, changeWords } from "@/lib/retail/products/figures";
import type { ProductView } from "@/lib/retail/products/view";
import { formatCount, formatMoney, formatTime } from "@/lib/workspace/format";

/**
 * What the product record says, in words (PRD-04): its five figures and the
 * values of its rail. Browser safe: the record kind and its PDF read the same
 * sentences, so the two never disagree.
 */

/** "12 bottles", "1 bottle", "6 each". */
export function unitsWords(count: number, unit: string): string {
  return `${formatCount(count)} ${unit}${count === 1 || unit === "each" ? "" : "s"}`;
}

export type ProductKpi = {
  label: string;
  value: string;
  lead?: string;
  leadTone?: "ok" | "bad" | "warn" | "plain";
  note: string;
};

/** Sold, 30 days · Takings · Margin · On hand · Sold today, as the Product board draws them. */
export function productKpis(product: ProductView): ProductKpi[] {
  const figures = product.figures;
  const soldChange = changeOn(figures.sold30, figures.soldPrev30);
  const takingsChange = changeOn(figures.takings30, figures.takingsPrev30);
  const plural = product.unit === "each" ? "units" : `${product.unit}s`;
  const cover = figures.coverDays;
  const last = figures.lastSale;
  return [
    {
      label: "Sold, 30 days",
      value: formatCount(figures.sold30),
      lead: changeWords(soldChange),
      leadTone: changeTone(soldChange),
      note: `${plural}, on the 30 before`,
    },
    {
      label: "Takings",
      value: formatMoney(figures.takings30, product.currency),
      lead: changeWords(takingsChange),
      leadTone: changeTone(takingsChange),
      note: "on the 30 before",
    },
    {
      label: "Margin",
      value: product.margin === null ? "—" : `${product.margin.toFixed(1)}%`,
      note:
        product.marginPerUnit === null
          ? product.seesCost
            ? "No cost on file"
            : ""
          : `${formatMoney(product.marginPerUnit, product.currency)} ${product.unit === "each" ? "each" : `a ${product.unit}`}`,
    },
    cover === null
      ? { label: "On hand", value: formatCount(product.stock.onHand), note: "Not sold in 30 days" }
      : {
          label: "On hand",
          value: formatCount(product.stock.onHand),
          lead: formatCount(cover),
          leadTone: cover < 7 ? "warn" : "plain",
          note: `${cover === 1 ? "day" : "days"} at this rate`,
        },
    last
      ? {
          label: "Sold today",
          value: formatCount(figures.soldToday),
          lead: formatTime(last.at),
          leadTone: "plain",
          note: last.till ? `last sale, ${last.till.toLowerCase()}` : "last sale",
        }
      : { label: "Sold today", value: formatCount(figures.soldToday), note: "No sale yet today" },
  ];
}

/** "Shelf prices, Wholesale US$16.90": the default list, then every other with its price. */
export function priceListsWords(product: ProductView): string {
  return [product.listName, ...product.otherLists.map((list) => `${list.name} ${formatMoney(list.price, list.currency)}`)].join(", ");
}

/** "12 bottles"; "Not set"; with levels at two or more sites, "12 at Harare Main Branch, 6 at Borrowdale". */
export function levelWords(product: ProductView, key: "reorderAt" | "reorderQty", unset: string): string {
  if (!product.stock.levelsEditable) {
    const set = product.stock.sites.filter((site) => site[key] !== null);
    return set.length ? set.map((site) => `${formatCount(site[key]!)} at ${site.name}`).join(", ") : unset;
  }
  const value = product.stock[key];
  return value === null ? unset : unitsWords(value, product.unit);
}

/** "None, not returnable"; "US$0.10 a bottle". */
export function depositWords(product: ProductView): string {
  if (!product.returnable || !product.depositAmount) return "None, not returnable";
  return `${formatMoney(product.depositAmount)} ${product.unit === "each" ? "each" : `a ${product.unit}`}`;
}

export const idCheckWords = (product: ProductView) => ageCheckWords(product.ownAgeCheck, product.category);
