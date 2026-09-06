/**
 * How accounting prints a figure.
 *
 * Four pages had grown their own local `fmtMoney` — the same
 * `toLocaleString(2dp)` copied into the overview, receivables, payables and
 * financial reports — and none of them matched what the artboards actually
 * draw, which is two formats for two different jobs:
 *
 *   a headline     $61,240     no decimals, currency symbol. KPI tiles and
 *                              band chips. Cents on a figure read at a glance
 *                              are three characters the eye has to skip past
 *                              to compare it with the tile beside it.
 *   a ledger line  61,240.00   two decimals, no symbol. Every table cell. Here
 *                              the cents are the point — this is the column
 *                              somebody reconciles — and a symbol repeated
 *                              down forty rows is chrome, not information.
 *
 * Client-safe on purpose. `lib/money.ts` is the server's `Prisma.Decimal`
 * arithmetic, and importing it from a page would pull Prisma into the browser
 * bundle; these take the plain numbers an API has already serialised.
 */

/** The default when a caller has no currency symbol to hand. */
const DEFAULT_SYMBOL = "$";

/**
 * A headline figure — KPI tiles, band chips, the total at the foot of a
 * report. Whole units, grouped, with the symbol.
 */
export function formatHeadline(value: number, symbol: string = DEFAULT_SYMBOL): string {
  // Rounded rather than truncated: a figure shown to the nearest dollar should
  // be the nearest dollar, or the headline and the ledger line beneath it
  // disagree by a cent and somebody has to work out which one is lying.
  const rounded = Math.round(value);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}${symbol}${Math.abs(rounded).toLocaleString(undefined, {
    maximumFractionDigits: 0,
  })}`;
}

/**
 * A ledger figure — every amount inside a table. Two decimals, grouped, no
 * symbol, so a column lines up on the decimal point.
 */
export function formatAmount(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * A signed change against a prior period — "+12%", "-4%".
 *
 * Null when there is nothing to compare against, which is not the same as no
 * change: a first period has no previous one, and printing "+0%" there claims
 * a comparison that was never made.
 */
export function formatDeltaPercent(current: number, previous: number): string | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  const change = ((current - previous) / Math.abs(previous)) * 100;
  if (!Number.isFinite(change)) return null;
  const rounded = Math.round(change);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

/** A count with its noun — "9 late", "3 accounts". Plural handled here once. */
export function formatCount(count: number, singular: string, plural?: string): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}
