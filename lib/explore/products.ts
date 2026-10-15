import type { IconName } from "@/components/core/icon";
import { sourceTable, sqlName, type SqlTable } from "@/lib/reports/sql/schema";
import type { ReportColumn } from "@/lib/reports/types";

/**
 * Explore's tables, by product (the ExploreStudio board's panel: CRM, Books,
 * Tender, People…).
 *
 * Until Explore has its own database login (`lib/explore/reader.ts`, waiting
 * for approval), a question reads the report sources the person can already
 * open — the same rows, through the same checks, as Reports — loaded into the
 * report database in their own tab. A source's SQL name is its table here
 * (`crm-site-visits` → `crm_site_visits`); its product is read off its key.
 */

export type ProductKey = "crm" | "books" | "tender" | "people" | "schools" | "operations";

export type ExploreProduct = { key: ProductKey; name: string; icon: IconName };

export const PRODUCTS: readonly ExploreProduct[] = [
  { key: "crm", name: "CRM", icon: "pipeline" },
  { key: "books", name: "Books", icon: "books" },
  { key: "tender", name: "Tender", icon: "store" },
  { key: "people", name: "People", icon: "person" },
  { key: "schools", name: "Schools", icon: "users" },
  { key: "operations", name: "Operations", icon: "grade" },
];

const BY_PREFIX: Array<[RegExp, ProductKey]> = [
  [/^crm-/, "crm"],
  [/^books-/, "books"],
  [/^retail-/, "tender"],
  [/^(people|payroll)-/, "people"],
  [/^school-/, "schools"],
];

/** The product a report source belongs to, by its key: `crm-deals` → CRM. Anything else is Operations. */
export function productOf(sourceKey: string): ProductKey {
  return BY_PREFIX.find(([prefix]) => prefix.test(sourceKey))?.[1] ?? "operations";
}

export function productInfo(key: ProductKey): ExploreProduct {
  return PRODUCTS.find((product) => product.key === key)!;
}

/** A source as Explore's panel lists it: a table, its product and its columns. */
export type ExploreTable = SqlTable & { key: string; product: ProductKey };

export function exploreTable(source: { key: string; title: string; columns: ReportColumn[] }): ExploreTable {
  return { ...sourceTable(source), key: source.key, product: productOf(source.key) };
}

/** A table the person's role does not read, and who does ("Managers"). */
export type LockedTable = { name: string; key: string; product: ProductKey; who: string };

export type ProductGroup<T> = { product: ExploreProduct; tables: T[] };

/** Tables in the products' order, each product once, tables A to Z within it. Products with none are left out. */
export function byProduct<T extends { name: string; product: ProductKey }>(tables: readonly T[]): Array<ProductGroup<T>> {
  return PRODUCTS.flatMap((product) => {
    const own = tables.filter((table) => table.product === product.key).sort((a, b) => a.name.localeCompare(b.name));
    return own.length ? [{ product, tables: own }] : [];
  });
}

/**
 * The panel's search: tables whose name or title matches, and tables with a
 * column that does (with the columns that matched, to show under it).
 */
export function searchTables<T extends ExploreTable>(tables: readonly T[], query: string): Array<{ table: T; columns: string[] }> {
  const needle = query.trim().toLowerCase();
  if (!needle) return tables.map((table) => ({ table, columns: [] }));
  return tables.flatMap((table) => {
    const own = table.name.includes(needle) || table.title.toLowerCase().includes(needle);
    const columns = table.columns
      .filter((column) => column.sql.includes(needle) || column.label.toLowerCase().includes(needle))
      .map((column) => column.sql);
    return own || columns.length ? [{ table, columns }] : [];
  });
}

export { sqlName };
