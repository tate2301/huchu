import { CategoryNameTaken, categoryInput, createRetailCategory, listRetailCategories } from "@/lib/retail/categories";

import { LookupFieldErrors, type LookupNoun, type LookupOption } from "./types";

/** Products' nouns: `category`, with its inline add. */

/** "15.00" → "15%", "7.50" → "7.5%". */
function percentWords(rate: string | number): string {
  return `${Number(rate).toString()}%`;
}

/** "VAT 15%, age check" or "VAT 15%". */
export function categorySub(row: { vatRate: string; ageRestricted: boolean }): string {
  return `VAT ${percentWords(row.vatRate)}${row.ageRestricted ? ", age check" : ""}`;
}

/** "15%", "15", "0 %", "Zero-rated" → a rate; anything else → null. */
export function parseVat(typed: string): number | null {
  const text = typed.trim().toLowerCase();
  if (text === "zero-rated" || text === "zero rated" || text === "exempt") return 0;
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text);
  if (!match) return null;
  const rate = Number(match[1]);
  return rate >= 0 && rate <= 100 ? rate : null;
}

/** "Yes" / "No" (and y, n, true, false) → a boolean; anything else → null. */
export function parseYesNo(typed: string): boolean | null {
  const text = typed.trim().toLowerCase();
  if (["yes", "y", "true"].includes(text)) return true;
  if (["no", "n", "false"].includes(text)) return false;
  return null;
}

const category: LookupNoun = {
  noun: "category",
  read: [["retail.categories", "view"]],
  create: ["retail.categories", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "vat", label: "VAT", placeholder: "15%", value: "15%" },
    { key: "age", label: "18+ check", placeholder: "Yes", value: "Yes" },
  ],
  async search(ctx, q) {
    const needle = q.toLowerCase();
    const rows = await listRetailCategories(ctx.companyId);
    return rows
      .filter((row) => !needle || row.name.toLowerCase().includes(needle))
      .map((row): LookupOption => ({ id: row.id, label: row.name, sub: categorySub(row) }));
  },
  async add(ctx, fields) {
    const errors: Record<string, string> = {};
    const name = (fields.name ?? "").trim();
    if (!name) errors.name = "Name is needed.";
    else if (name.length > 80) errors.name = "Keep the name to 80 characters.";
    const vatRate = parseVat(fields.vat ?? "15%");
    if (vatRate === null) errors.vat = "Give VAT as a percentage, like 15%.";
    const ageRestricted = parseYesNo(fields.age ?? "Yes");
    if (ageRestricted === null) errors.age = "Say Yes or No.";
    if (Object.keys(errors).length > 0) throw new LookupFieldErrors(errors);

    try {
      const created = await createRetailCategory(
        ctx.companyId,
        categoryInput.parse({ name, vatRate, ageRestricted }),
      );
      return { id: created.id, label: created.name, sub: categorySub(created) };
    } catch (error) {
      if (error instanceof CategoryNameTaken) {
        throw new LookupFieldErrors({ name: `There is already a category called ${name}.` });
      }
      throw error;
    }
  },
};

export const PRODUCT_LOOKUPS: LookupNoun[] = [category];
