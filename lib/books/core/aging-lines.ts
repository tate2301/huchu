import type { AccountingSourceType } from "@prisma/client";

/**
 * The one aging's arithmetic (books-final §6.1 fix 14), pure, so a page's
 * own read and a client view can share it: sub-ledger lines aged from each
 * line's date, per currency and in the base currency at each line's frozen
 * rate. `statement-aging.ts` reads the lines.
 */

export type PartyKind = "customer" | "supplier";

export type Buckets = { current: number; days30: number; days60: number; days90: number; over90: number; total: number };

export type AgingRow = Buckets & {
  partyId: string;
  name: string;
  /** In the base currency. The buckets above are base too. */
  byCurrency: Array<Buckets & { currency: string }>;
};

export type PartyAging = { kind: PartyKind; asOf: string; baseCurrency: string; rows: AgingRow[]; total: Buckets; byCurrency: Array<Buckets & { currency: string }> };

const DAY = 86_400_000;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const empty = (): Buckets => ({ current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 });

export function bucketOf(entryDate: Date, asOf: Date): keyof Omit<Buckets, "total"> {
  const days = Math.floor((asOf.getTime() - entryDate.getTime()) / DAY);
  return days <= 30 ? "current" : days <= 60 ? "days30" : days <= 90 ? "days60" : days <= 120 ? "days90" : "over90";
}

function addTo(target: Buckets, bucket: keyof Omit<Buckets, "total">, amount: number) {
  target[bucket] = round2(target[bucket] + amount);
  target.total = round2(target.total + amount);
}

export type LedgerLine = { partyId: string | null; entryDate: Date; debit: number; credit: number; currency: string; sourceType: AccountingSourceType; sourceId: string; invoiceId: string | null; billId: string | null };

/** Aging from sub-ledger lines, pure: `rateOf` gives each line's frozen rate (1 in the base currency). */
export function ageLedgerLines(
  kind: PartyKind,
  lines: LedgerLine[],
  names: Map<string, string>,
  asOf: Date,
  base: string,
  rateOf: (line: LedgerLine) => number | null,
): Omit<PartyAging, "kind" | "asOf" | "baseCurrency"> {
  const rows = new Map<string, AgingRow & { currencies: Map<string, Buckets & { currency: string }> }>();
  const total = empty();
  const totals = new Map<string, Buckets & { currency: string }>();
  for (const line of lines) {
    if (!line.partyId) continue;
    const owed = kind === "customer" ? line.debit - line.credit : line.credit - line.debit;
    if (owed === 0) continue;
    const bucket = bucketOf(line.entryDate, asOf);
    const currency = (line.currency || base).toUpperCase();
    const rate = currency === base.toUpperCase() ? 1 : rateOf(line);
    const owedBase = rate && rate > 0 ? round2(owed / rate) : 0;
    const row =
      rows.get(line.partyId) ??
      ({ partyId: line.partyId, name: names.get(line.partyId) ?? (kind === "customer" ? "Customer" : "Supplier"), ...empty(), byCurrency: [], currencies: new Map() } as AgingRow & { currencies: Map<string, Buckets & { currency: string }> });
    addTo(row, bucket, owedBase);
    const inCurrency = row.currencies.get(currency) ?? { currency, ...empty() };
    addTo(inCurrency, bucket, owed);
    row.currencies.set(currency, inCurrency);
    rows.set(line.partyId, row);
    addTo(total, bucket, owedBase);
    const overall = totals.get(currency) ?? { currency, ...empty() };
    addTo(overall, bucket, owed);
    totals.set(currency, overall);
  }
  const list = [...rows.values()]
    .map(({ currencies, ...row }) => ({ ...row, byCurrency: [...currencies.values()].filter((entry) => Math.abs(entry.total) >= 0.005) }))
    .filter((row) => Math.abs(row.total) >= 0.005 || row.byCurrency.length > 0)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return { rows: list, total, byCurrency: [...totals.values()].filter((entry) => Math.abs(entry.total) >= 0.005) };
}
