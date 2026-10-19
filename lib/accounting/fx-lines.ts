/**
 * A journal in the base currency for a document in another (D3, D4,
 * books-final §5.9). Pure.
 *
 * The posting rule is run on the document's own amounts; each line is then
 * converted to the base currency at the document's frozen rate (quote units
 * per one base unit, so base = amount ÷ rate) and keeps the original beside
 * it (`currency`, `amountInCurrency`, `exchangeRate`). Rounding each line to
 * the cent can leave the entry a cent or two out: the difference goes on the
 * largest line of the side with more lines, so the entry always balances in
 * base and a lone control line keeps its document's exact base amount.
 *
 * Base-only adjustments (a realised exchange difference) are added after,
 * with no currency of their own.
 */

export type FxSpec = { currency: string; rate: number };

export type SimLine = { accountId: string; debit: number; credit: number; memo: string; costCenterId: string | null };

export type FxLine = SimLine & { currency: string | null; amountInCurrency: number | null; exchangeRate: number | null };

export type Adjustment = { accountId: string; debit: number; credit: number; memo: string };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function readFx(payload: Record<string, unknown> | null | undefined): FxSpec | null {
  const fx = payload?.fx;
  if (!fx || typeof fx !== "object") return null;
  const { currency, rate } = fx as Record<string, unknown>;
  if (typeof currency !== "string" || !currency) return null;
  if (typeof rate !== "number" || !(rate > 0)) return null;
  return { currency: currency.toUpperCase(), rate };
}

export function convertLines(lines: SimLine[], fx: FxSpec | null): FxLine[] {
  if (!fx || fx.rate === 1) return lines.map((line) => ({ ...line, currency: null, amountInCurrency: null, exchangeRate: null }));
  const converted: FxLine[] = lines.map((line) => {
    const original = line.debit || line.credit;
    const base = round2(original / fx.rate);
    return {
      ...line,
      debit: line.debit ? base : 0,
      credit: line.credit ? base : 0,
      currency: fx.currency,
      amountInCurrency: round2(original),
      exchangeRate: fx.rate,
    };
  });
  const debit = round2(converted.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(converted.reduce((sum, line) => sum + line.credit, 0));
  const gap = round2(debit - credit);
  if (gap !== 0) {
    // The cent goes on the side with more lines (revenue beside VAT, expense beside VAT), so a
    // single control line (the receivable, the payable) keeps exactly its document's base
    // amount and agrees with the sub-ledger; with one line each side, on the lighter side.
    const debits = converted.filter((line) => line.debit > 0);
    const credits = converted.filter((line) => line.credit > 0);
    const side: "debit" | "credit" = debits.length === credits.length ? (gap > 0 ? "credit" : "debit") : debits.length > credits.length ? "debit" : "credit";
    const lighter = side === "debit" ? gap < 0 : gap > 0;
    const largest = (side === "debit" ? debits : credits).sort((a, b) => b[side] - a[side])[0];
    if (largest) largest[side] = round2(largest[side] + (lighter ? Math.abs(gap) : -Math.abs(gap)));
  }
  return converted;
}

/** Base-only lines appended after conversion, turned round when the entry is. */
export function adjustmentLines(adjustments: Adjustment[], invert: boolean): FxLine[] {
  return adjustments
    .filter((line) => round2(line.debit) > 0 || round2(line.credit) > 0)
    .map((line) => ({
      accountId: line.accountId,
      debit: round2(invert ? line.credit : line.debit),
      credit: round2(invert ? line.debit : line.credit),
      memo: line.memo,
      costCenterId: null,
      currency: null,
      amountInCurrency: null,
      exchangeRate: null,
    }));
}

/** An amount in the base currency at a rate (quote units per one base unit). */
export function toBase(amount: number, rate: number): number {
  return rate > 0 ? round2(amount / rate) : round2(amount);
}
