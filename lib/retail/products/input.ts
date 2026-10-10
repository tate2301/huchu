import { z } from "zod";

import { PRICE_DIGITS } from "@/lib/retail/prices/figure";

/**
 * What a product is made from (20-products 4.2, PRD-03): one shape for the New
 * product and Edit a product sheets, `POST /products`, `PATCH /products/[id]`
 * and the `product` lookup's quick add. Browser-safe: the sheets check the
 * same rules before they send.
 *
 * Money and counts travel as text ("2.10", "48"): what was typed, checked
 * here, and turned into `Decimal` by the services. A number is accepted too
 * (a script, a test) and read as its text. An empty field is null.
 */

const MONEY = /^\d+(\.\d{1,2})?$/;

/**
 * The most whole digits a figure takes, so it fits its column: money is
 * `Decimal(14,2)`, a count `Decimal(12,4)` with room left for the stock it
 * is added to.
 */
const MONEY_DIGITS = 10;
const COUNT_DIGITS = 7;
const wholeDigits = (text: string) => text.split(".")[0].replace(/^0+(?=\d)/, "").length;

/** "", null and undefined → null; a number → its text; text → trimmed. */
const blankToNull = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : value;
  if (typeof value === "string") return value.trim() === "" ? null : value.trim();
  return value;
};

/** A price is what a till charges, so it keeps to the price rule's digits (`centsOf`); a cost fits its column. */
const moneyText = (label: string, digits = MONEY_DIGITS) =>
  z.preprocess(
    blankToNull,
    z
      .string({ message: `${label} is a figure, like 2.10.` })
      .regex(MONEY, `Write ${label.toLowerCase()} as a figure, like 2.10.`)
      .refine((text) => wholeDigits(text) <= digits, `${label} is too big. Keep it under ${(10 ** digits).toLocaleString("en-US")}.`),
  );

const optionalMoney = (label: string) => moneyText(label).nullable().optional();

const countText = (label: string) =>
  z
    .preprocess(
      blankToNull,
      z
        .string({ message: `${label} is a figure.` })
        .regex(/^\d+(\.\d+)?$/, `${label} is a figure, zero or more.`)
        .refine((text) => wholeDigits(text) <= COUNT_DIGITS, `${label} is too big. Keep it under 10,000,000.`),
    )
    .nullable()
    .optional();

/** "5", "12.5": a percentage up to 100, at most two decimals. */
const percentText = (label: string) =>
  z
    .preprocess(
      blankToNull,
      z
        .string({ message: `${label} is a percentage, like 10.` })
        .regex(/^\d+(\.\d{1,2})?$/, `Write ${label.toLowerCase()} as a percentage, like 10.`)
        .refine((text) => Number(text) <= 100, `${label} is at most 100%.`)
        .nullable(),
    )
    .optional();

const id = (message: string) => z.preprocess(blankToNull, z.string().uuid(message).nullable().optional());

/** "6001496 00112" → "600149600112"; anything but digits and spaces, or not 8–14 digits, is refused. */
export const BARCODE_MESSAGE = "A barcode has 8 to 14 digits.";
export function normalizeBarcode(typed: string): string | null {
  if (!/^[\d ]+$/.test(typed)) return null;
  const digits = typed.replace(/ /g, "");
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

const barcode = z.preprocess(
  blankToNull,
  z
    .string()
    .transform((typed, ctx) => {
      const digits = normalizeBarcode(typed);
      if (digits === null) {
        ctx.addIssue({ code: "custom", message: BARCODE_MESSAGE });
        return z.NEVER;
      }
      return digits;
    })
    .nullable()
    .optional(),
);

export const SOLD_AS = ["SINGLE", "BY_WEIGHT"] as const;
export type SoldAs = (typeof SOLD_AS)[number];

/** The fields both a new product and a change take. */
const fields = {
  name: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.string({ message: "Name is needed." }).min(1, "Name is needed.").max(200, "Keep the name to 200 characters."),
  ),
  categoryId: id("That category is not one of this shop's."),
  price: moneyText("Price", PRICE_DIGITS),
  barcode,
  cost: optionalMoney("Cost"),
  supplierId: id("That supplier is not one of this shop's."),
  openingStock: countText("Opening stock"),
  siteId: id("That site is not one of this shop's."),
  reorderAt: countText("Reorder at"),
  soldAs: z.enum(SOLD_AS, { message: "Choose Single or By weight." }),
  returnable: z.boolean().optional(),
  depositAmount: optionalMoney("Deposit"),
  imageUrl: z.preprocess(blankToNull, z.string().max(2_000).nullable().optional()),
  /** The product's own 18+ check: true or false; null follows its category (`age-check.ts`). */
  ageCheck: z.boolean({ message: "Choose As category, Yes or No." }).nullable().optional(),
  /** The most any discount may take off it, a manager's included. Null: no limit. */
  maxDiscountPercent: percentText("Most off"),
};

/** Opening stock: whole for a single, three decimals at most by weight. */
function openingStockRule(value: { openingStock?: string | null; soldAs?: SoldAs }, ctx: z.RefinementCtx) {
  if (!value.openingStock) return;
  const byWeight = value.soldAs === "BY_WEIGHT";
  const ok = byWeight ? /^\d+(\.\d{1,3})?$/.test(value.openingStock) : /^\d+$/.test(value.openingStock);
  if (!ok) {
    ctx.addIssue({
      code: "custom",
      path: ["openingStock"],
      message: byWeight ? "Opening stock is a weight, up to three decimals." : "Opening stock is a whole number.",
    });
  }
}

/** A new product. The category is asked for by the sheet; the lookup's quick add leaves it out. */
export const productInput = z
  .object({ ...fields, soldAs: fields.soldAs.default("SINGLE"), andAnother: z.boolean().optional() })
  .superRefine(openingStockRule);

export type ProductInput = z.infer<typeof productInput>;

/** A change: any of the fields, and what only the record edits. */
export const productPatch = z
  .object({
    ...fields,
    reorderQty: countText("Reorder"),
    code: z.preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.string().min(1, "Code is needed.").max(40, "Keep the code to 40 characters."),
    ),
  })
  .partial()
  .superRefine(openingStockRule);

export type ProductPatch = z.infer<typeof productPatch>;

/** What a body that is not a set of fields at all (not a JSON object) is answered with. */
export const CHECK_THE_FIELDS = "Check the fields.";

/**
 * The first sentence per field, for `{ error, fieldErrors }`, and the
 * sentence to lead with. An issue with no field (the body is not an object)
 * belongs under none: it is answered "Check the fields." with no field errors.
 */
export function productFieldErrors(error: z.ZodError): { error: string; fieldErrors: Record<string, string> } {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path.length === 0) return { error: CHECK_THE_FIELDS, fieldErrors: {} };
    const field = String(issue.path[0]);
    if (!fieldErrors[field]) fieldErrors[field] = issue.message;
  }
  return { error: Object.values(fieldErrors)[0] ?? CHECK_THE_FIELDS, fieldErrors };
}

/** "Savanna Light 330ml" → "SAVANNA-LIGHT-330ML": upper case, anything else a dash, at most 20. */
export function normalizeSku(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20)
    .replace(/-+$/g, "");
}
