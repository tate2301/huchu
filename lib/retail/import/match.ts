/**
 * "By barcode first, then by name" (SET-11): which live product an import row
 * is. An exact barcode (spaces removed) or an exact name (trimmed, any case)
 * updates that product; a name equal once case, spaces and punctuation are
 * set aside only looks like it, and the row asks; anything else is new. Pure.
 */

export type CatalogProduct = { id: string; name: string; barcode: string | null };

export type CatalogIndex = {
  byBarcode: Map<string, CatalogProduct>;
  byName: Map<string, CatalogProduct>;
  byNear: Map<string, CatalogProduct>;
};

export type MatchResult =
  | { kind: "UPDATE"; product: CatalogProduct }
  | { kind: "LOOKS_LIKE"; product: CatalogProduct }
  | { kind: "NEW" };

export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();
export const nearKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
export const barcodeKey = (barcode: string) => barcode.replace(/\s+/g, "");

export function catalogIndex(products: CatalogProduct[]): CatalogIndex {
  const index: CatalogIndex = { byBarcode: new Map(), byName: new Map(), byNear: new Map() };
  for (const product of products) {
    if (product.barcode) index.byBarcode.set(barcodeKey(product.barcode), product);
    if (!index.byName.has(nameKey(product.name))) index.byName.set(nameKey(product.name), product);
    const near = nearKey(product.name);
    if (near && !index.byNear.has(near)) index.byNear.set(near, product);
  }
  return index;
}

export function matchRow(row: { name: string | null; barcode: string | null }, index: CatalogIndex): MatchResult {
  if (row.barcode) {
    const scanned = index.byBarcode.get(barcodeKey(row.barcode));
    if (scanned) return { kind: "UPDATE", product: scanned };
  }
  if (row.name) {
    const named = index.byName.get(nameKey(row.name));
    if (named) return { kind: "UPDATE", product: named };
    const near = nearKey(row.name);
    const alike = near ? index.byNear.get(near) : undefined;
    if (alike) return { kind: "LOOKS_LIKE", product: alike };
  }
  return { kind: "NEW" };
}
