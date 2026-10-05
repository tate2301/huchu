import {
  CategoryRefusal,
  categoryInput,
  createCategory,
  liveCategories,
  vatOf,
  type CategoryVat,
} from "@/lib/retail/categories";

import { LookupFieldErrors, type LookupNoun, type LookupOption } from "./types";

/** Products' nouns: `category`, with its inline add. */

/** "VAT 15%, age check", "VAT 0%", "VAT exempt". */
export function categorySub(row: { vatRate: unknown; vatExempt?: boolean; ageRestricted: boolean }): string {
  const vat = vatOf({ vatRate: Number(row.vatRate), vatExempt: row.vatExempt ?? false });
  const rate = vat === "EXEMPT" ? "VAT exempt" : `VAT ${Number(row.vatRate).toString()}%`;
  return `${rate}${row.ageRestricted ? ", age check" : ""}`;
}

/** "15%", "15", "Zero-rated", "0%", "Exempt" → the VAT it means; anything else → null. */
export function parseVat(typed: string): CategoryVat | null {
  const text = typed.trim().toLowerCase();
  if (text === "exempt") return "EXEMPT";
  if (text === "zero-rated" || text === "zero rated") return "ZERO_RATED";
  const match = /^(\d+(?:\.\d+)?)\s*%?$/.exec(text);
  if (!match) return null;
  const rate = Number(match[1]);
  if (rate === 0) return "ZERO_RATED";
  return rate === 15 ? "STANDARD" : null;
}

/** "Yes" / "No" (and y, n, true, false) → a boolean; anything else → null. */
export function parseYesNo(typed: string): boolean | null {
  const text = typed.trim().toLowerCase();
  if (["yes", "y", "true"].includes(text)) return true;
  if (["no", "n", "false"].includes(text)) return false;
  return null;
}

/**
 * Categories (FND, changed by PRD-02): read with the range, so anyone who
 * files a product can pick one; children read "Spirits · Liqueur".
 * `context.topLevel` offers only top-level ones ("Inside"); `context.exclude`
 * leaves out a category and those inside it (where its products may move).
 */
const category: LookupNoun = {
  noun: "category",
  read: [["retail.catalog", "view"]],
  create: ["retail.categories", "create"],
  quick: [
    { key: "name", label: "Name", placeholder: "" },
    { key: "vat", label: "VAT", placeholder: "15%", value: "15%" },
    { key: "age", label: "18+ check", placeholder: "Yes", value: "Yes" },
  ],
  async search(ctx, q, context) {
    const needle = q.toLowerCase();
    const exclude = typeof context.exclude === "string" ? context.exclude : null;
    const rows = await liveCategories(ctx.companyId);
    return rows
      .filter((row) => !(context.topLevel && row.parentId))
      .filter((row) => !exclude || (row.id !== exclude && row.parentId !== exclude))
      .filter((row) => !needle || row.path.toLowerCase().includes(needle))
      .map((row): LookupOption => ({ id: row.id, label: row.path, sub: categorySub(row) }));
  },
  async add(ctx, fields) {
    const errors: Record<string, string> = {};
    const name = (fields.name ?? "").trim();
    if (!name) errors.name = "Name is needed.";
    else if (name.length > 80) errors.name = "Keep the name to 80 characters.";
    const vat = parseVat(fields.vat ?? "15%");
    if (vat === null) errors.vat = "Give VAT as 15%, Zero-rated or Exempt.";
    const ageCheck = parseYesNo(fields.age ?? "Yes");
    if (ageCheck === null) errors.age = "Say Yes or No.";
    if (Object.keys(errors).length > 0) throw new LookupFieldErrors(errors);

    try {
      const created = await createCategory(
        { companyId: ctx.companyId, userId: ctx.userId, userName: ctx.userName, userRole: ctx.session.user?.role ?? null },
        categoryInput.parse({ name, vat, ageCheck }),
      );
      return {
        id: created.id,
        label: created.path,
        sub: categorySub({ vatRate: created.vat === "STANDARD" ? 15 : 0, vatExempt: created.vat === "EXEMPT", ageRestricted: created.ageCheck }),
      };
    } catch (error) {
      if (error instanceof CategoryRefusal && error.field) throw new LookupFieldErrors({ [error.field === "name" ? "name" : "vat"]: error.message });
      throw error;
    }
  },
};

export const PRODUCT_LOOKUPS: LookupNoun[] = [category];
