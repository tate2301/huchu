/**
 * The change as it leaves the drawer: which notes, largest first, from the
 * notes the drawer is counted in (`DENOMINATIONS`), and what is left under the
 * smallest note as coins. "US$3 and ZiG 11" becomes "US$2 · US$1 · ZiG 10 ·
 * ZiG 1 in coins", so the counter picks the notes without working it out.
 *
 * Pure and browser-safe; works in whole cents.
 */

import { DENOMINATIONS, type CountCurrency } from "./floor/count";
import type { ChangeSplit } from "./payment-words";

export type ChangePiece = { currency: CountCurrency; note: number; count: number } | { currency: CountCurrency; coins: number };

function piecesOf(currency: CountCurrency, amount: number): ChangePiece[] {
  let cents = Math.round(amount * 100);
  const pieces: ChangePiece[] = [];
  for (const denomination of DENOMINATIONS[currency]) {
    const note = Number(denomination);
    const count = Math.floor(cents / (note * 100));
    if (count > 0) {
      pieces.push({ currency, note, count });
      cents -= count * note * 100;
    }
  }
  if (cents > 0) pieces.push({ currency, coins: cents / 100 });
  return pieces;
}

export function changeNotes(change: Pick<ChangeSplit, "usd" | "zig">): ChangePiece[] {
  return [...(change.usd > 0.004 ? piecesOf("USD", change.usd) : []), ...(change.zig > 0.004 ? piecesOf("ZWG", change.zig) : [])];
}

function money(currency: CountCurrency, value: number) {
  const figure = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return currency === "USD" ? `US$${figure}` : `ZiG ${figure}`;
}

/** "US$2 · 2 × US$1 · ZiG 10 · ZiG 1 in coins"; empty when there is nothing to give back. */
export function changeNoteWords(change: Pick<ChangeSplit, "usd" | "zig">): string {
  return changeNotes(change)
    .map((piece) =>
      "coins" in piece
        ? `${money(piece.currency, piece.coins)} in coins`
        : `${piece.count > 1 ? `${piece.count} × ` : ""}${money(piece.currency, piece.note)}`,
    )
    .join(" · ");
}
