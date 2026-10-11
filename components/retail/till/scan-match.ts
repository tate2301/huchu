/**
 * What a scan, or a code typed and entered, means on the shelf. The search
 * finds anything whose name, SKU or barcode contains the text, so the product
 * the code is exactly comes first; otherwise the first the search ranked.
 */

type Scannable = { name: string; sku: string; barcode: string | null };

/**
 * "3*6001234", typed before a scan or a code: three of it. Up to 999 at a
 * time; anything else is the code alone, one of it. Only `*` (or `×`)
 * counts, so a code like "12X500" is never read as twelve.
 */
export function parseScan(text: string): { quantity: number; code: string } {
  const counted = /^\s*(\d{1,3})\s*[*×]\s*(\S.*)$/.exec(text);
  if (counted && Number(counted[1]) > 0) return { quantity: Number(counted[1]), code: counted[2].trim() };
  return { quantity: 1, code: text.trim() };
}

export function pickScanned<T extends Scannable>(items: readonly T[], code: string): T | null {
  if (!code.trim()) return null;
  return exactMatch(items, code) ?? items[0] ?? null;
}

/** The product the code is exactly, by barcode and then by SKU: the shelf the till keeps answers a scan without asking. */
export function exactMatch<T extends Scannable>(items: readonly T[], code: string): T | null {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return null;
  return items.find((item) => item.barcode?.toLowerCase() === wanted) ?? items.find((item) => item.sku.toLowerCase() === wanted) ?? null;
}

/** The cached shelf searched the way `loadShelfListings` searches: name, SKU or barcode containing the text. */
export function searchShelf<T extends Scannable>(items: readonly T[], code: string): T[] {
  const wanted = code.trim().toLowerCase();
  if (!wanted) return [];
  return items.filter(
    (item) =>
      item.name.toLowerCase().includes(wanted) ||
      item.sku.toLowerCase().includes(wanted) ||
      Boolean(item.barcode?.toLowerCase().includes(wanted)),
  );
}
