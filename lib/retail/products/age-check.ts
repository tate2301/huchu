/**
 * A product's 18+ check (the till's ID check). A category that checks ID
 * checks it for every product in it ("Spirits checks ID for every product in
 * it"); outside one, `Product.ageRestricted` is the product's own answer (a
 * lighter under General says yes). Browser safe: the record, the PDF, the
 * Edit sheet, the till's shelf and the sale route read the same rule.
 */

/** Whether the till checks ID for a product: always under a category that checks, else its own answer. */
export function ageCheckFor(product: {
  ageRestricted: boolean | null;
  retailCategory?: { ageRestricted: boolean } | null;
}): boolean {
  return product.retailCategory?.ageRestricted === true || product.ageRestricted === true;
}

/** "Yes, from Spirits" under a category that checks; else "Yes, 18 and over" or "No". */
export function ageCheckWords(own: boolean | null, category: { name: string; ageCheck: boolean } | null): string {
  if (category?.ageCheck) return `Yes, from ${category.name}`;
  return own ? "Yes, 18 and over" : "No";
}

/** The PATCH's refusal of "No" under a category that checks ID. */
export const categoryChecksWords = (category: string) => `${category} checks ID for every product in it.`;

/** The three answers the product sheets offer for it. */
export const AGE_CHECK_SEG = ["As category", "Yes", "No"];

export const ageCheckOfSeg = (seg: unknown): boolean | null => (seg === "Yes" ? true : seg === "No" ? false : null);
export const segOfAgeCheck = (own: boolean | null): string => (own === null ? "As category" : own ? "Yes" : "No");
