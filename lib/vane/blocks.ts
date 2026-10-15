import { z } from "zod";

/**
 * What Vane can put in an answer besides its words (the `show` tool): figures
 * to read at a glance, a chart, a card for one record, a quote it drafted, and
 * the knowledge it went by. Each is checked here before it is kept; links lead
 * inside the app only. A quote is kept by its id and drawn from the quote as it
 * stands when the answer is read, so an edit to the quote shows.
 */

const path = z
  .string()
  .max(400)
  .regex(/^\/(?!\/)/, "a path inside the app, starting with /");

export const blockSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("figures"),
    title: z.string().max(80).optional(),
    figures: z
      .array(
        z.object({
          label: z.string().min(1).max(40),
          value: z.string().min(1).max(30).describe('As it reads: "$12,480.00", "7", "53%".'),
          note: z.string().max(60).optional().describe('What it is against: "up from 41%", "3 overdue".'),
        }),
      )
      .min(1)
      .max(4),
  }),
  z.object({
    kind: z.literal("chart"),
    title: z.string().min(1).max(80),
    form: z.enum(["bars", "trend"]).describe("bars: amounts by category; trend: amounts over time, oldest first."),
    unit: z.enum(["money", "number", "percent"]),
    currency: z.string().length(3).optional(),
    points: z.array(z.object({ label: z.string().min(1).max(40), value: z.number() })).min(2).max(24),
  }),
  z.object({
    kind: z.literal("record"),
    title: z.string().min(1).max(100),
    subtitle: z.string().max(120).optional(),
    status: z.string().max(30).optional(),
    href: path,
    fields: z.array(z.object({ label: z.string().min(1).max(30), value: z.string().min(1).max(80) })).max(8).default([]),
  }),
  z.object({
    kind: z.literal("quote"),
    quotationId: z.string().min(1).describe("The SalesQuotation you drafted (the draft tool's quotationId)."),
  }),
  z.object({
    kind: z.literal("sources"),
    items: z
      .array(z.object({ title: z.string().min(1).max(100), href: path, note: z.string().max(120).optional() }))
      .min(1)
      .max(8),
  }),
]);

export type VaneBlock = z.infer<typeof blockSchema>;

/** What a quote block draws: the quote as it stands, each line with where its price came from. */
export type VaneQuoteView = {
  kind: "quote";
  quotationId: string;
  number: string;
  status: string;
  madeByVane: boolean;
  customer: string;
  currency: string;
  href: string;
  lines: Array<{ description: string; quantity: number; unitPrice: number; amount: number; source: { title: string; href: string } | null }>;
  subTotal: number;
  taxTotal: number;
  total: number;
  /** Lines with no price behind them: Vane's estimate, to be checked. */
  unpriced: number;
};

/** A block as the panel draws it: as kept, or a quote filled in (or gone, when the quote was deleted). */
export type VaneBlockView = Exclude<VaneBlock, { kind: "quote" }> | VaneQuoteView | { kind: "gone"; what: string };

/** Blocks kept on a message: what parses is drawn, what no longer does is dropped. */
export function asBlocks(value: unknown): VaneBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = blockSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}
