import { z } from "zod";

import { fieldRuleSchema, isShown, measureOf, measureUnit, MEASURE_FIELD_TYPES, type FieldDefinition } from "@/lib/forms/fields";

/**
 * The quote a form drafts from its own answers.
 *
 * A line says what is sold and where its quantity comes from: a figure on
 * the form (the areas' total, a run of coving, a count of doorways), scaled
 * and rounded up to whole packs, or a fixed number. Measure the floor on site
 * and the quote is already written — nobody types 240 m² a second time.
 */

export const quoteLineSchema = z
  .object({
    id: z.string().min(1).max(40),
    description: z.string().trim().min(1, "Say what the line is").max(200),
    /** The catalogue product it sells, when it sells one; its price is the line's starting price. */
    productId: z.string().max(64).optional(),
    /** What the quantity is counted in on the quote: m², m, boxes, each. */
    unit: z.string().trim().max(12).optional(),
    unitPrice: z.number().finite().nonnegative(),
    taxRate: z.number().finite().min(0).max(100).optional(),
    quantity: z.discriminatedUnion("from", [
      z.object({ from: z.literal("fixed"), value: z.number().finite().nonnegative() }),
      z.object({
        from: z.literal("field"),
        key: z.string().min(1).max(64),
        /** Times this — 1.08 for 8% waste. */
        factor: z.number().finite().positive().default(1),
        /** Sold in packs of this much: the quantity is how many packs, rounded up. */
        per: z.number().finite().positive().optional(),
      }),
    ]),
    /** Drafted only when the answers say so: a damp-proof primer when moisture is over 4%. */
    showWhen: fieldRuleSchema.optional(),
  })
  .strict();
export type QuoteLine = z.infer<typeof quoteLineSchema>;

export const quoteLinesSchema = z.array(quoteLineSchema).max(60);

/** A line as drafted from one set of answers. */
export type DraftedLine = {
  lineId: string;
  description: string;
  productId?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  taxRate?: number;
  amount: number;
  /** Where the quantity came from, in words: "Areas to be coated: 240.00 m² × 1.08". */
  source: string;
};

const money = (value: number) => Math.round(value * 100) / 100;
const quantity = (value: number) => Math.round(value * 10_000) / 10_000;

/** What is wrong with a form's quote lines, against the form's own questions. */
export function quoteLineProblems(lines: readonly QuoteLine[], fields: readonly FieldDefinition[]): string[] {
  const problems: string[] = [];
  for (const line of lines) {
    if (line.quantity.from !== "field") continue;
    const key = line.quantity.key;
    const field = fields.find((candidate) => candidate.key === key);
    if (!field) problems.push(`"${line.description}" takes its quantity from "${key}", which is not on the form.`);
    else if (!MEASURE_FIELD_TYPES.includes(field.type)) {
      problems.push(`"${line.description}" takes its quantity from "${field.label}", which is not a measurement.`);
    }
  }
  return problems;
}

/**
 * The lines a set of answers drafts. A line whose rule does not hold, or
 * whose measurement is not answered yet or comes to nothing, is left out
 * rather than quoted at zero.
 */
export function draftQuote(
  lines: readonly QuoteLine[],
  fields: readonly FieldDefinition[],
  answers: Record<string, unknown>,
): DraftedLine[] {
  const drafted: DraftedLine[] = [];
  for (const line of lines) {
    if (line.showWhen) {
      const asIf = { key: `__line_${line.id}`, label: line.description, type: "text", required: false, showWhen: line.showWhen } as FieldDefinition;
      if (!isShown(asIf, fields, answers)) continue;
    }

    let amount: number;
    let source: string;
    if (line.quantity.from === "fixed") {
      amount = line.quantity.value;
      source = "Fixed";
    } else {
      const { key, factor, per } = line.quantity;
      const field = fields.find((candidate) => candidate.key === key);
      if (!field || !isShown(field, fields, answers)) continue;
      const measured = measureOf(field, answers[key]);
      if (measured === null) continue;
      const scaled = measured * factor;
      amount = per ? Math.ceil(quantity(scaled / per)) : quantity(scaled);
      const unit = measureUnit(field);
      source = `${field.label}: ${quantity(measured)}${unit ? ` ${unit}` : ""}${factor !== 1 ? ` × ${factor}` : ""}${per ? `, in packs of ${per}` : ""}`;
    }
    if (!(amount > 0)) continue;

    drafted.push({
      lineId: line.id,
      description: line.description,
      ...(line.productId ? { productId: line.productId } : {}),
      quantity: amount,
      ...(line.unit ? { unit: line.unit } : {}),
      unitPrice: line.unitPrice,
      ...(line.taxRate !== undefined ? { taxRate: line.taxRate } : {}),
      amount: money(amount * line.unitPrice),
      source,
    });
  }
  return drafted;
}

/** The drafted lines added up, before tax. */
export function draftSubtotal(lines: readonly DraftedLine[]): number {
  return money(lines.reduce((sum, line) => sum + line.amount, 0));
}
