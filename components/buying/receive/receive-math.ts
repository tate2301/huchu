import { formatCount, formatMoney } from "@/lib/workspace/format";

/**
 * Receive's live figures (40-buying 5.7): each line's To come and Value as
 * typed, the Σ row, and the four "When you post" sentences. Pure, so the page
 * and its test read the same arithmetic. Value is what goes into stock at
 * cost ex VAT: (this time − damaged) × cost, to the cent.
 */

export type Rest = "KEEP" | "CLOSE";

export type ReceiveRow = {
  key: string;
  name: string;
  /** Null on a line the order did not have (added from the scan box). */
  ordered: number | null;
  due: number | null;
  unitCost: number;
  thisTime: number;
  damaged: number;
  rest: Rest;
};

const cents = (n: number) => Math.round(n * 100) / 100;

export type RowFigures = {
  /** Still to come after this delivery: max(0, due − this time). */
  toCome: number;
  inStock: number;
  value: number;
  /** This time above what is due: "More than is still to come." */
  over: boolean;
  /** More damaged than came. */
  tooBroken: boolean;
};

export function rowFigures(row: ReceiveRow): RowFigures {
  const toCome = row.due === null ? 0 : Math.max(0, row.due - row.thisTime);
  const inStock = Math.max(0, row.thisTime - row.damaged);
  return {
    toCome,
    inStock,
    value: cents(inStock * row.unitCost),
    over: row.due !== null && row.thisTime > row.due,
    tooBroken: row.damaged > row.thisTime,
  };
}

export type ReceiveTotals = {
  lines: number;
  ordered: number;
  thisTime: number;
  damaged: number;
  toCome: number;
  inStock: number;
  value: number;
  damagedValue: number;
  keptLines: number;
  keptUnits: number;
  closedLines: number;
};

export function receiveTotals(rows: readonly ReceiveRow[]): ReceiveTotals {
  const totals: ReceiveTotals = { lines: rows.length, ordered: 0, thisTime: 0, damaged: 0, toCome: 0, inStock: 0, value: 0, damagedValue: 0, keptLines: 0, keptUnits: 0, closedLines: 0 };
  for (const row of rows) {
    const figures = rowFigures(row);
    totals.ordered += row.ordered ?? 0;
    totals.thisTime += row.thisTime;
    totals.damaged += row.damaged;
    totals.toCome += figures.toCome;
    totals.inStock += figures.inStock;
    totals.value += figures.value;
    totals.damagedValue += cents(row.damaged * row.unitCost);
    if (figures.toCome > 0 && row.rest === "KEEP") {
      totals.keptLines += 1;
      totals.keptUnits += figures.toCome;
    }
    if (figures.toCome > 0 && row.rest === "CLOSE") totals.closedLines += 1;
  }
  totals.value = cents(totals.value);
  totals.damagedValue = cents(totals.damagedValue);
  return totals;
}

const units = (n: number) => `${formatCount(n)} ${n === 1 ? "unit" : "units"}`;

export type PostSentence = { tone: "ok" | "warn" | "hollow" | "bad"; text: string };

/** The aside's four "When you post" sentences, live. */
export function whenYouPost(totals: ReceiveTotals, site: string, supplier: string): PostSentence[] {
  return [
    { tone: "ok", text: `${units(totals.inStock)} go into stock at ${site}, on sale at once.` },
    totals.keptLines > 0
      ? {
          tone: "warn",
          text: `${formatCount(totals.keptLines)} ${totals.keptLines === 1 ? "line stays" : "lines stay"} on order: ${units(totals.keptUnits)} still to come. The order stays part delivered.`,
        }
      : { tone: "warn", text: "Nothing left to come. The order closes." },
    totals.closedLines > 0
      ? { tone: "hollow", text: `${formatCount(totals.closedLines)} ${totals.closedLines === 1 ? "line is" : "lines are"} closed short. You pay only for what came.` }
      : { tone: "hollow", text: "No lines closed short." },
    totals.damaged > 0
      ? { tone: "bad", text: `A claim for ${formatCount(totals.damaged)} damaged ${totals.damaged === 1 ? "unit" : "units"}, ${formatMoney(totals.damagedValue)}, goes to ${supplier}.` }
      : { tone: "bad", text: "Nothing damaged, nothing to claim." },
  ];
}

/** "420 units in stock, 36 still on order." */
export function postedWords(inStock: number, stillOnOrder: number): string {
  return stillOnOrder > 0 ? `${units(inStock)} in stock, ${formatCount(stillOnOrder)} still on order.` : `${units(inStock)} in stock. Nothing is left on order.`;
}

/** "Tafara Nyathi or Tendai Mhlanga will post it." */
export function checkersWords(names: readonly string[]): string {
  if (names.length === 0) return "An owner or a manager will post it.";
  if (names.length === 1) return `${names[0]} will post it.`;
  return `${names.slice(0, -1).join(", ")} or ${names.at(-1)} will post it.`;
}
