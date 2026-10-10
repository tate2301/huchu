/**
 * A price as a person types it, read one way everywhere (PRD-07): the
 * worksheet, Change many prices, the phone's price sheet, the product form,
 * the import and the preview. Digits with at most two decimals, an optional
 * "US$", under US$10,000,000. Anything else — "1e3", "1.234", a figure with
 * eleven digits — is refused, never rounded or read as something else.
 * Browser-safe, so a sheet can check what the server checks.
 */

/** Whole digits a price may have: up to US$9,999,999.99. */
export const PRICE_DIGITS = 7;

export const PRICE_FIGURE_MESSAGE = "Write the price as a figure, like 2.10.";

const FIGURE = new RegExp(`^\\s*(?:US\\$|\\$)?\\s*0*(\\d{1,${PRICE_DIGITS}})(?:\\.(\\d{1,2}))?\\s*$`);

/** "18.99", "US$ 18.99" or "18" in whole cents; null when it is not a price. */
export function centsOf(typed: string): number | null {
  const match = FIGURE.exec(typed);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}
