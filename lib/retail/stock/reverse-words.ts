import type { StockMovementReason } from "@prisma/client";

import { formatCount } from "@/lib/workspace/format";

/**
 * What can be reversed from Movements, and the words for what cannot
 * (30-stock W-28 step 3). Pure, so the list's toast and the server agree.
 */

export const REVERSIBLE_REASONS: ReadonlySet<StockMovementReason> = new Set<StockMovementReason>([
  "BROKEN",
  "OWN_USE",
  "FOUND",
  "CORRECTION",
  "CASE_BROKEN",
]);

/** The adjustments whose value posted to the books, and so post back. */
export const POSTED_REASONS: ReadonlySet<StockMovementReason> = new Set<StockMovementReason>([
  "BROKEN",
  "OWN_USE",
  "FOUND",
  "CORRECTION",
]);

export type SkipKind = "sale" | "delivery" | "count" | "transfer" | "reversed" | "other";

export type Skipped = { id: string; reference: string | null; kind: SkipKind; why: string };

/** Why a movement is not put back here, or null when it can be. */
export function skipReason(movement: {
  id: string;
  reason: StockMovementReason | null;
  reference: string | null;
  reversed: boolean;
}): Skipped | null {
  const name = movement.reference ?? "That movement";
  const skip = (kind: SkipKind, why: string): Skipped => ({ id: movement.id, reference: movement.reference, kind, why });
  if (movement.reason && REVERSIBLE_REASONS.has(movement.reason)) {
    return movement.reversed ? skip("reversed", `${name} is already reversed.`) : null;
  }
  switch (movement.reason) {
    case "SALE":
    case "REFUND":
    case "VOID":
      return skip("sale", `${name} is a sale: refund it from the sale.`);
    case "RECEIVED":
    case "DELIVERY_DIFFERENCE":
    case "SUPPLIER_RETURN":
      return skip("delivery", `${name} is a delivery: open it instead.`);
    case "COUNT":
      return skip("count", `${name} is a count: open it instead.`);
    case "TRANSFER_OUT":
    case "TRANSFER_IN":
    case "TRANSFER_BACK":
      return skip("transfer", `${name} is a transfer: open it instead.`);
    default:
      return skip("other", `${name} cannot be reversed here.`);
  }
}

const SKIP_WORDS: Record<SkipKind, [one: string, many: string]> = {
  sale: ["was a sale: refund it from the sale", "were sales: refund them from the sale"],
  delivery: ["was a delivery: open it instead", "were deliveries: open them instead"],
  count: ["was a count: open it instead", "were counts: open them instead"],
  transfer: ["was a transfer: open it instead", "were transfers: open them instead"],
  reversed: ["was already reversed", "were already reversed"],
  other: ["cannot be reversed here", "cannot be reversed here"],
};

/** The done toast: "2 movements reversed. 1 was a sale: refund it from the sale." */
export function reversedToast(answer: { reversed: unknown[]; skipped: Array<Pick<Skipped, "kind">> }): string {
  const done = answer.reversed.length;
  const head =
    done === 0 ? "Nothing was reversed." : `${formatCount(done)} ${done === 1 ? "movement" : "movements"} reversed.`;
  const counts = new Map<SkipKind, number>();
  for (const entry of answer.skipped) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const tails = [...counts].map(([kind, count]) => `${formatCount(count)} ${SKIP_WORDS[kind][count === 1 ? 0 : 1]}.`);
  return [head, ...tails].join(" ");
}
