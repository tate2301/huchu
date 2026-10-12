/**
 * What a screen reader hears as the sale changes: one sentence for what just
 * happened, then the total. The sale column says it in a polite live region,
 * so a cashier who cannot see the screen follows the sale as it is rung up.
 */

import { qty, usd } from "./format";

type Line = { catalogItemId: string; name: string; quantity: number };

export function saleChangeWords(before: readonly Line[], after: readonly Line[], total: number): string {
  const then = new Map(before.map((line) => [line.catalogItemId, line]));
  const now = new Map(after.map((line) => [line.catalogItemId, line]));
  const totalWords = `Total ${usd(total)}.`;
  if (!after.length) return before.length ? "The sale is empty." : "";
  if (!before.length && after.length > 1) return `${after.length} lines back on the sale. ${totalWords}`;
  const added = after.filter((line) => !then.has(line.catalogItemId));
  if (added.length === 1) return `Added ${added[0].name}. ${totalWords}`;
  const removed = before.filter((line) => !now.has(line.catalogItemId));
  if (removed.length === 1 && !added.length) return `Removed ${removed[0].name}. ${totalWords}`;
  const changed = after.find((line) => {
    const was = then.get(line.catalogItemId);
    return was && was.quantity !== line.quantity;
  });
  if (changed) return `${changed.name}, ${qty(changed.quantity)}. ${totalWords}`;
  return totalWords;
}
