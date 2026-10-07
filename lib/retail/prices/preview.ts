import { z } from "zod";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * Change many prices' lines (W-15, PRD-07): what each ticked product costs
 * now and what it will cost, worked out in whole cents so a raise and its
 * rounding never drift. `previewLines` is pure; `previewForList` reads the
 * list's rows for it.
 *
 *   Raise by a percentage  next = now × (1 + by/100)
 *   Set a margin           next = cost ÷ (1 − by/100); no cost leaves the price as it is
 *   Set one price          next = by
 *
 * then rounded up to the next 5 or 10 cents.
 */

export type PreviewHow = "RAISE" | "MARGIN" | "ONE_PRICE";
export type PreviewRound = "NO" | "UP_5" | "UP_10";

export type PreviewRow = { productId: string; name: string; price: number; cost: number | null };

export type PreviewLine = {
  productId: string;
  name: string;
  now: number;
  /** The margin at today's price, one decimal; null without a cost. */
  margin: number | null;
  next: number;
  nextMargin: number | null;
  belowCost: boolean;
  note: string | null;
};

export const NO_COST_NOTE = "No cost yet, left as it is";

/** A percentage typed as "5%", "5" or "-2.5%", in hundredths of a percent; null when it is not one. */
export function basisPoints(typed: string): number | null {
  const match = /^\s*(-?\d{1,4}(?:\.\d{1,2})?)\s*%?\s*$/.exec(typed);
  return match ? Math.round(Number(match[1]) * 100) : null;
}

/** "18.99" or "US$18.99" in cents; null when it is not a price. */
export function centsOf(typed: string): number | null {
  const match = /^\s*(?:US\$|\$)?\s*(\d{1,7})(?:\.(\d{1,2}))?\s*$/.exec(typed);
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? "0").padEnd(2, "0"));
}

const toCents = (value: number) => Math.round(value * 100);

function roundUp(cents: number, round: PreviewRound): number {
  if (round === "UP_5") return Math.ceil(cents / 5) * 5;
  if (round === "UP_10") return Math.ceil(cents / 10) * 10;
  return cents;
}

function marginOf(priceCents: number, costCents: number | null): number | null {
  if (costCents === null || priceCents <= 0) return null;
  return Math.round(((priceCents - costCents) / priceCents) * 1000) / 10;
}

/** Why the "By" is refused, or null: a raise of −90% to 1,000%, a margin under 100%, a price. */
export function byProblem(how: PreviewHow, by: string): string | null {
  if (how === "ONE_PRICE") return centsOf(by) === null ? "Write the price as a figure, like 2.10." : null;
  const points = basisPoints(by);
  if (how === "MARGIN") return points === null || points < 0 || points >= 10000 ? "Write the margin as a percentage under 100, like 30%." : null;
  return points === null || points <= -9000 || points > 100000 ? "Write the raise as a percentage, like 5%." : null;
}

export function previewLines(rows: PreviewRow[], input: { how: PreviewHow; by: string; round: PreviewRound }): PreviewLine[] {
  const points = basisPoints(input.by) ?? 0;
  const one = centsOf(input.by) ?? 0;
  return rows.map((row) => {
    const now = toCents(row.price);
    const cost = row.cost === null ? null : toCents(row.cost);
    let next: number;
    let note: string | null = null;
    if (input.how === "RAISE") next = roundUp(Math.round((now * (10000 + points)) / 10000), input.round);
    else if (input.how === "ONE_PRICE") next = roundUp(one, input.round);
    else if (cost === null) {
      next = now;
      note = NO_COST_NOTE;
    } else next = roundUp(Math.round((cost * 10000) / (10000 - points)), input.round);
    return {
      productId: row.productId,
      name: row.name,
      now: now / 100,
      margin: marginOf(now, cost),
      next: next / 100,
      nextMargin: marginOf(next, cost),
      belowCost: cost !== null && next < cost,
      note,
    };
  });
}

export const previewInput = z.object({
  listId: z.string().uuid(),
  productIds: z.array(z.string().uuid()).min(1).max(500),
  how: z.enum(["RAISE", "MARGIN", "ONE_PRICE"]),
  by: z.string().max(20),
  round: z.enum(["NO", "UP_5", "UP_10"]),
});

export type PreviewInput = z.infer<typeof previewInput>;

/**
 * The lines for the products ticked on one list, in the order ticked; a
 * product that is not on the list (or not the shop's) is left out. Null when
 * the list is not one of the shop's.
 */
export async function previewForList(companyId: string, input: PreviewInput): Promise<PreviewLine[] | null> {
  const list = await prisma.priceList.findFirst({
    where: { id: input.listId, companyId, archivedAt: null },
    select: { id: true, minQuantity: true },
  });
  if (!list) return null;
  const rows = await prisma.productPrice.findMany({
    where: { priceListId: list.id, minQuantity: list.minQuantity, productId: { in: input.productIds }, product: { archivedAt: null } },
    select: { productId: true, unitPrice: true, product: { select: { name: true, costPrice: true } } },
  });
  const byId = new Map(rows.map((row) => [row.productId, row]));
  const ordered = input.productIds.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            productId: id,
            name: row.product.name,
            price: toNumberOrZero(row.unitPrice),
            cost: row.product.costPrice === null ? null : toNumberOrZero(row.product.costPrice),
          },
        ]
      : [];
  });
  return previewLines(ordered, input);
}
