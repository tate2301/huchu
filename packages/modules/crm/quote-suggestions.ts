/**
 * What to offer on a quote line, from the two places a line can come from.
 *
 * Pulled out of the picker so it can be tested. The component around it is a
 * text box, a popover and some keyboard handling — none of which is where the
 * mistakes are. The mistakes are here: which source wins, what a suggestion
 * carries into the line, and what happens to a measured item that nobody
 * priced. Those are worth pinning down, especially since the last rewrite of
 * this field shipped a bug that made it untypeable for weeks.
 */

export type VisitItemOption = {
  id: string;
  description: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  /** Which visit it was measured on, so two surveys stay distinguishable. */
  visitLabel: string;
};

export type CatalogueProduct = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  line: {
    description: string;
    unitPrice: number;
    taxRate: number;
    priceSource: string;
  };
};

export type LinePick = {
  productId?: string;
  description: string;
  /** Null when nobody has priced it yet — not zero, which reads as free. */
  unitPrice: number | null;
  taxRate?: number;
  quantity?: number;
};

export type Suggestion = {
  key: string;
  source: "catalogue" | "visit";
  title: string;
  detail: string;
  trailing: string | null;
  pick: LinePick;
};

const VISIT_LIMIT = 6;
const CATALOGUE_LIMIT = 8;

function money(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function visitSuggestions(
  items: VisitItemOption[],
  query: string,
): Suggestion[] {
  const needle = query.trim().toLowerCase();

  return items
    .filter((item) => item.description.trim())
    .filter((item) => !needle || item.description.toLowerCase().includes(needle))
    .slice(0, VISIT_LIMIT)
    .map((item) => ({
      key: `visit-${item.id}`,
      source: "visit" as const,
      title: item.description,
      detail: [
        item.quantity ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}` : null,
        item.visitLabel,
      ]
        .filter(Boolean)
        .join(" · "),
      trailing: item.unitPrice != null ? money(item.unitPrice) : null,
      pick: {
        description: item.description,
        // Carried through as null rather than coerced. A measurement taken
        // without a price is a size somebody wrote down, and filling the box
        // with 0.00 would look like a decision nobody made.
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      },
    }));
}

export function catalogueSuggestions(products: CatalogueProduct[]): Suggestion[] {
  return products
    .filter((product) => product.isActive)
    .slice(0, CATALOGUE_LIMIT)
    .map((product) => ({
      key: `product-${product.id}`,
      source: "catalogue" as const,
      title: product.name,
      // A price off a named list is worth saying so: somebody reading the
      // quote later needs to know it was not the standard rate.
      detail:
        product.line.priceSource !== "standard"
          ? `${product.code} · ${product.line.priceSource} price`
          : product.code,
      trailing: money(product.line.unitPrice),
      pick: {
        productId: product.id,
        description: product.line.description || product.name,
        unitPrice: product.line.unitPrice,
        taxRate: product.line.taxRate,
      },
    }));
}

/**
 * Both sources, measured first.
 *
 * On a job that had a survey, the thing being quoted is almost always the
 * thing somebody stood in front of and measured — so those go at the top,
 * where the first arrow-down lands.
 */
export function buildSuggestions(params: {
  visitItems: VisitItemOption[];
  products: CatalogueProduct[];
  query: string;
}): Suggestion[] {
  return [
    ...visitSuggestions(params.visitItems, params.query),
    ...catalogueSuggestions(params.products),
  ];
}
