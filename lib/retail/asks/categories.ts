import type { Ask } from "@/lib/workspace/ask";
import { formatCount } from "@/lib/workspace/format";

/** "61 products", "1 product". */
export const productsWord = (count: number) => `${formatCount(count)} ${count === 1 ? "product" : "products"}`;

/** A category's "Delete category" (20-products 5.28 `categorydelete`). */
export function categoryDeleteAsk({ name, products, into }: { name: string; products: number; into: string | null }): Ask {
  const move =
    products > 0 && into
      ? `Its ${productsWord(products)} move to ${into} first, with that category's VAT and age check. `
      : "";
  return {
    title: `Delete ${name}?`,
    body: `${move}${name} stays in the bin for 30 days.`,
    keep: "Keep it",
    go: "Delete category",
    fill: "bad",
  };
}

/** Categories › tick rows › Merge (20-products 5.28 `categorymerge`). */
export function categoryMergeAsk({ count, into, products }: { count: number; into: string; products: number }): Ask {
  const one = count === 1;
  return {
    title: `Merge ${formatCount(count)} ${one ? "category" : "categories"} into ${into}?`,
    body: `${one ? "Its" : "Their"} ${productsWord(products)} move into ${into} and take its VAT and age check. ${
      one ? "The other goes" : "The others go"
    } to the bin for 30 days.`,
    keep: "Keep them apart",
    go: "Merge",
    fill: "action",
  };
}
