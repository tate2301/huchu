/**
 * A product's 18+ check (the till's ID check). `Product.ageRestricted` is the
 * product's own answer and null follows its category: alcohol-free beer filed
 * under Beer says no for itself, a lighter under General says yes. Browser
 * safe: the record, the PDF, the Edit sheet, the till's shelf and the sale
 * route read the same rule.
 */

/** Whether the till checks ID for a product: its own answer when it has one, else its category's. */
export function ageCheckFor(product: {
  ageRestricted: boolean | null;
  retailCategory?: { ageRestricted: boolean } | null;
}): boolean {
  return product.ageRestricted ?? product.retailCategory?.ageRestricted ?? false;
}

/** "Yes, 18 and over", "No", or "As Beer: yes, 18 and over" while it follows its category. */
export function ageCheckWords(own: boolean | null, category: { name: string; ageCheck: boolean } | null): string {
  if (own !== null) return own ? "Yes, 18 and over" : "No";
  if (!category) return "No";
  return `As ${category.name}: ${category.ageCheck ? "yes, 18 and over" : "no"}`;
}

/** The three answers the product sheets offer for it. */
export const AGE_CHECK_SEG = ["As category", "Yes", "No"];

export const ageCheckOfSeg = (seg: unknown): boolean | null => (seg === "Yes" ? true : seg === "No" ? false : null);
export const segOfAgeCheck = (own: boolean | null): string => (own === null ? "As category" : own ? "Yes" : "No");
