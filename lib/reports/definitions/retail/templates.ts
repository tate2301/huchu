import type { ReportArea } from "@/lib/reports/types";

/**
 * The built-in Reports templates (70-insights-reports 5.13): code, not rows,
 * each reading one source through its report face. Saved templates are
 * `ReportTemplate` rows; these are the ones every shop starts with.
 *
 * A template reaches Reports only when its source is registered with a report
 * face — `templates.test.ts` refuses one that is not — so a built-in on a
 * source still to be built (sales, orders, requisitions, bills, customers,
 * accounts) joins this list with the unit that builds its source:
 *   1. a `report:` block on the source's definition (5.14);
 *   2. one row here (5.13);
 *   3. its source key in the expected list of `templates.test.ts`.
 */

/**
 * A template's query, as the address would carry it: the filters by key, the
 * rollup keys, the visible columns in order, the sort (a face's sort key, or
 * `column:dir` rules joined with ","), the group (`none` for none) and the
 * search.
 */
export type TemplateQuery = {
  filters: Record<string, string>;
  rows?: string[];
  cols?: string[];
  sort?: string;
  group?: string;
  q?: string;
};

/** Who a built-in is offered to: everyone who opens Reports, or the managers (owner, manager, bookkeeper). */
export type BuiltInAudience = "EVERYONE" | "MANAGERS";

export type BuiltInTemplate = {
  slug: string;
  name: string;
  summary: string;
  area: ReportArea;
  /** The report source it reads, through that source's report face. */
  source: string;
  audience: BuiltInAudience;
  query: TemplateQuery;
};

export const RETAIL_BUILT_INS: readonly BuiltInTemplate[] = [
  {
    slug: "items-sold",
    name: "Items sold",
    summary: "Each line sold: quantity, price, revenue and margin",
    area: "selling",
    source: "retail-items-sold",
    audience: "EVERYONE",
    query: {
      filters: { when: "30d" },
      cols: ["item", "date", "quantity", "unitPrice", "revenue", "cost", "margin"],
      sort: "newest",
    },
  },
  {
    slug: "stock-on-hand",
    name: "Stock on hand",
    summary: "What is on the shelf at cost and at price, by shop",
    area: "stock",
    source: "retail-stock-on-hand",
    audience: "EVERYONE",
    query: {
      filters: {},
      cols: ["product", "category", "site", "onHand", "value", "valueAtPrice"],
      sort: "most-value",
      group: "site",
    },
  },
  {
    slug: "count-differences",
    name: "Count differences",
    summary: "What each count found short or over, at cost",
    area: "stock",
    source: "retail-stock-movements",
    audience: "MANAGERS",
    query: {
      filters: { when: "30d", kind: "counts" },
      rows: ["reference"],
      cols: ["reference", "movements", "short", "over", "value"],
      sort: "newest",
    },
  },
  {
    slug: "stock-movements",
    name: "Stock movements",
    summary: "Every receipt, sale, adjustment and transfer, by product",
    area: "stock",
    source: "retail-stock-movements",
    audience: "MANAGERS",
    query: {
      filters: { when: "30d" },
      cols: ["when", "product", "kind", "reference", "change", "value"],
      sort: "newest",
      group: "product",
    },
  },
  {
    slug: "takings-by-payment",
    name: "Takings by payment",
    summary: "Cash, EcoCash, card and account, by day and till",
    area: "money",
    source: "retail-payments",
    audience: "MANAGERS",
    query: {
      filters: { when: "this-month" },
      rows: ["day", "till"],
      // ZiG after Card: the shop takes ZiG, and a row's tenders must add up to Taken.
      cols: ["day", "till", "cash", "ecocash", "card", "zig", "account", "other", "taken"],
      sort: "newest",
      group: "day",
    },
  },
  {
    slug: "till-shifts",
    name: "Till shifts",
    summary: "Each shift: float, takings, counted, short or over",
    area: "floor",
    source: "retail-shifts",
    audience: "MANAGERS",
    query: {
      filters: { opened: "30d" },
      cols: ["shiftNo", "till", "cashier", "openedAt", "float", "takings", "expected", "counted", "variance"],
      sort: "newest",
    },
  },
];

export function builtInTemplate(slug: string): BuiltInTemplate | null {
  return RETAIL_BUILT_INS.find((template) => template.slug === slug) ?? null;
}
