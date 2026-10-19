/** What Books' forms choose from (`lib/books/form-options.ts` reads it). No database here: the forms import it. */
export type BooksFormOptions = {
  base: string;
  /** The base currency first, then every other one the workspace holds or has a rate for. */
  currencies: string[];
  /** The latest rate for each other currency: quote units to one base unit. */
  rates: Record<string, { rate: number; source: string; day: string }>;
  parties: Array<{ id: string; name: string; vatNumber: string | null; tin: string | null }>;
  taxCodes: Array<{ id: string; label: string; rate: number }>;
  costCentres: Array<{ id: string; label: string }>;
  accounts: Array<{ id: string; label: string; currency: string; kind: string }>;
  /** The number the document will take when it is issued: shown, not reserved. */
  nextNumber: string;
};

/** "ZiG" for ZWG, "US$" for USD, as the boards write them. */
export function currencyWord(code: string): string {
  if (code === "ZWG") return "ZiG";
  if (code === "USD") return "US$";
  return code;
}
