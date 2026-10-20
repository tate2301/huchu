import { resolveBaseCurrency, UnknownExchangeRateError } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * `rateFor`: the rate to freeze on a document, and where it came from
 * (books-final §1.1). Quote units per one base unit on or before the date,
 * from the workspace's own rates (typed in, or the RBZ's feed). A document in
 * the base currency is 1. No rate is an error, never an invented number.
 */

export type FrozenRate = {
  baseCurrency: string;
  currency: string;
  rate: number;
  source: "BASE" | "MANUAL" | "RBZ";
  /** The day the rate is for; null for the base currency. */
  effectiveDate: Date | null;
};

export async function rateFor(
  companyId: string,
  currency: string | null | undefined,
  date: Date = new Date(),
  /** As the rates stood then: a rate typed in later for the same day does not move a frozen allocation. */
  knownAt?: Date,
): Promise<FrozenRate> {
  const baseCurrency = await resolveBaseCurrency(companyId);
  const code = (currency ?? "").trim().toUpperCase() || baseCurrency;
  if (code === baseCurrency) return { baseCurrency, currency: code, rate: 1, source: "BASE", effectiveDate: null };
  const row = await prisma.currencyRate.findFirst({
    where: { companyId, baseCurrency, quoteCurrency: code, effectiveDate: { lte: date }, ...(knownAt ? { createdAt: { lte: knownAt } } : {}) },
    orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    select: { rate: true, source: true, effectiveDate: true },
  });
  if (!row || !(row.rate > 0)) throw new UnknownExchangeRateError(code, baseCurrency);
  // A day with both an RBZ rate and one typed in: the source Money and tax prefers.
  const settings = await prisma.accountingSettings.findUnique({ where: { companyId }, select: { taxSettings: true } });
  const preferred = (settings?.taxSettings as { rates?: { source?: string } } | null)?.rates?.source;
  if (preferred && preferred !== row.source) {
    const same = await prisma.currencyRate.findFirst({
      where: { companyId, baseCurrency, quoteCurrency: code, effectiveDate: row.effectiveDate, source: preferred as never, ...(knownAt ? { createdAt: { lte: knownAt } } : {}) },
      orderBy: { createdAt: "desc" },
      select: { rate: true, source: true, effectiveDate: true },
    });
    if (same && same.rate > 0) return { baseCurrency, currency: code, rate: same.rate, source: same.source === "RBZ" ? "RBZ" : "MANUAL", effectiveDate: same.effectiveDate };
  }
  return { baseCurrency, currency: code, rate: row.rate, source: row.source === "RBZ" ? "RBZ" : "MANUAL", effectiveDate: row.effectiveDate };
}
