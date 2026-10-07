/**
 * The words and small rules of a category that the browser needs too (the
 * sheets, the asks): what VAT a category is and how it reads, its path, its
 * subline, the target margin as typed. No database here.
 */

type DecimalLike = { toString(): string } | number | string;

/* ── VAT ──────────────────────────────────────────────────────────────────── */

export const CATEGORY_VATS = ["STANDARD", "ZERO_RATED", "EXEMPT"] as const;
export type CategoryVat = (typeof CATEGORY_VATS)[number];

/** The standard rate, what "15%" writes. */
export const STANDARD_VAT_RATE = 15;

/** Which of the three a stored rate is. Any positive rate is standard-rated. */
export function vatOf(row: { vatRate: DecimalLike; vatExempt: boolean }): CategoryVat {
  if (Number(row.vatRate) > 0) return "STANDARD";
  return row.vatExempt ? "EXEMPT" : "ZERO_RATED";
}

/** "15% included", "Zero-rated", "Exempt". */
export function vatLabelOf(row: { vatRate: DecimalLike; vatExempt: boolean }): string {
  const vat = vatOf(row);
  if (vat === "STANDARD") return `${Number(row.vatRate)}% included`;
  return vat === "EXEMPT" ? "Exempt" : "Zero-rated";
}

/** "61 products · VAT 15% · 18+". */
export function categorySubline(row: {
  products: number;
  vatRate: DecimalLike;
  vatExempt: boolean;
  ageCheck: boolean;
}): string {
  const vat = vatOf(row);
  return [
    `${row.products} ${row.products === 1 ? "product" : "products"}`,
    vat === "STANDARD" ? `VAT ${Number(row.vatRate)}%` : vat === "EXEMPT" ? "VAT exempt" : "Zero-rated",
    row.ageCheck ? "18+" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Spirits · Liqueur" for a category inside another, else its name. */
export function categoryPath(row: { name: string; parent: { name: string } | null }): string {
  return row.parent ? `${row.parent.name} · ${row.name}` : row.name;
}

const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });

/** The other category whose name sorts nearest after this one's (else nearest before). */
export function nearestByName<T extends { label: string }>(name: string, others: T[]): T | null {
  if (others.length === 0) return null;
  const sorted = [...others].sort((a, b) => collator.compare(a.label, b.label));
  return sorted.find((other) => collator.compare(other.label, name) > 0) ?? sorted[sorted.length - 1]!;
}

/** "30%", "30", "22.5 %" → 30, 22.5; "" → null; anything else → undefined. */
export function parseMargin(typed: string | null | undefined): number | null | undefined {
  const text = (typed ?? "").trim();
  if (!text) return null;
  const match = /^(\d{1,2}(?:\.\d)?)\s*%?$/.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  return value >= 0 && value <= 99.9 ? value : undefined;
}

