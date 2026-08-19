/**
 * Money — one place that knows what an amount of money is.
 *
 * This began life as `lib/schools/money.ts`, written when the school fee
 * columns moved off `Float`. Nothing in it was ever school-specific, and
 * payroll needs exactly the same guarantees, so it lives here now and
 * `lib/schools/money.ts` re-exports it. Fees, payroll and anything else that
 * counts cents share one implementation rather than three that disagree in the
 * third decimal place.
 *
 * Before S-2.1 every fee column was a `Float` and six route files each carried
 * their own copy of
 *
 *   `Math.round((value + Number.EPSILON) * 100) / 100`
 *
 * to paper over it. That helper is not merely inelegant, it is wrong: 8.575
 * comes back as 8.57, because 8.575 is not representable in binary and the
 * epsilon nudge is far too small at that magnitude to reach the tie. Postgres
 * `numeric` rounds the same value to 8.58, which is the cent a bursar counted
 * into the tin. The columns are `Decimal(14,2)` now and this file is what the
 * routes use instead.
 *
 * The rule, borrowed verbatim from `lib/gold/decimal-utils.ts`: **never
 * silently lose precision.** Anything that accumulates — a sum over invoice
 * lines, over allocations, over waivers — stays a `Prisma.Decimal` from the
 * read to the write. `toNumber` exists only for the two places a plain number
 * is genuinely wanted: a comparison against a request body, and a value handed
 * to an API that takes `number`.
 *
 * Responses need no help. `successResponse` runs `serializeDecimals`, which
 * turns every `Prisma.Decimal` in the payload into a `Number` — safe below 15
 * significant digits, which `Decimal(14,2)` is and `Decimal(14,4)` would not
 * be.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/** Anything Prisma or a request body may hand us where money is expected. */
export type MoneyLike =
  | Prisma.Decimal
  | number
  | bigint
  | string
  | null
  | undefined;

/** Cents. Every `@db.Decimal(14,2)` money column in the product. */
export const MONEY_SCALE = 2;

/**
 * Quantities and exchange rates — `@db.Decimal(12,4)`. Four places because a
 * term billed a third at a time is 0.3333 of it, and because the repo already
 * uses `Decimal(12,4)` for every per-unit rate it has.
 */
export const RATE_SCALE = 4;

/** Tax rates — `@db.Decimal(5,2)`, a percentage between 0 and 100. */
export const PERCENT_SCALE = 2;

/**
 * Half-up, away from zero. The same rule Postgres `numeric` applies, so a
 * value rounded here and a value rounded by the column agree.
 */
const HALF_UP = Prisma.Decimal.ROUND_HALF_UP;

export const ZERO = new Prisma.Decimal(0);

function decimalise(value: MoneyLike): Prisma.Decimal {
  if (value == null) return new Prisma.Decimal(0);
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "bigint") return new Prisma.Decimal(value.toString());
  const decimal = new Prisma.Decimal(value);
  if (!decimal.isFinite()) {
    throw new TypeError(`Not a finite money value: ${String(value)}`);
  }
  return decimal;
}

/** Coerce to a money `Decimal`, rounded to the cent. Null and undefined are zero. */
export function money(value: MoneyLike): Prisma.Decimal {
  return decimalise(value).toDecimalPlaces(MONEY_SCALE, HALF_UP);
}

/** As `money`, but a missing value stays missing rather than becoming zero. */
export function moneyOrNull(value: MoneyLike): Prisma.Decimal | null {
  if (value == null) return null;
  return money(value);
}

/** A quantity or an exchange rate, at four places. */
export function rate(value: MoneyLike): Prisma.Decimal {
  return decimalise(value).toDecimalPlaces(RATE_SCALE, HALF_UP);
}

/**
 * A quantity, at four places. The same scale as `rate`, under the name the
 * caller means.
 *
 * S-1. `InventoryItem.currentStock` and `StockMovement.quantity` became
 * `Decimal(12,4)`, and the code that moves stock now has to say so. It could
 * call `rate()` — the scale is identical — but `rate(input.quantity)` reads as
 * a mistake at every call site, and a helper whose name lies is how the next
 * person routes a quantity through an exchange-rate code path.
 */
export function quantity(value: MoneyLike): Prisma.Decimal {
  return decimalise(value).toDecimalPlaces(RATE_SCALE, HALF_UP);
}

/** A tax rate, at two places. */
export function percent(value: MoneyLike): Prisma.Decimal {
  return decimalise(value).toDecimalPlaces(PERCENT_SCALE, HALF_UP);
}

/**
 * Sum money exactly.
 *
 * Accumulates in `Decimal` and rounds once at the end, so a hundred invoice
 * lines cannot drift the way a hundred `+=` on a double would.
 */
export function sumMoney(values: Iterable<MoneyLike>): Prisma.Decimal {
  let total = new Prisma.Decimal(0);
  for (const value of values) total = total.plus(decimalise(value));
  return total.toDecimalPlaces(MONEY_SCALE, HALF_UP);
}

/** `quantity × unitAmount`, at the cent. */
export function multiplyMoney(quantity: MoneyLike, unitAmount: MoneyLike) {
  return decimalise(quantity)
    .times(decimalise(unitAmount))
    .toDecimalPlaces(MONEY_SCALE, HALF_UP);
}

/** Tax on a net amount at a percentage rate, at the cent. */
export function taxOn(netAmount: MoneyLike, taxRatePercent: MoneyLike) {
  return decimalise(netAmount)
    .times(decimalise(taxRatePercent))
    .dividedBy(100)
    .toDecimalPlaces(MONEY_SCALE, HALF_UP);
}

/** The larger of two money values. */
export function maxMoney(a: MoneyLike, b: MoneyLike): Prisma.Decimal {
  const left = money(a);
  const right = money(b);
  return left.greaterThan(right) ? left : right;
}

/** The smaller of two money values. */
export function minMoney(a: MoneyLike, b: MoneyLike): Prisma.Decimal {
  const left = money(a);
  const right = money(b);
  return left.lessThan(right) ? left : right;
}

/** Never below zero. */
export function clampAtZero(value: MoneyLike): Prisma.Decimal {
  const amount = money(value);
  return amount.isNegative() ? new Prisma.Decimal(0) : amount;
}

export function isPositive(value: MoneyLike): boolean {
  return money(value).greaterThan(0);
}

export function isZeroOrLess(value: MoneyLike): boolean {
  return !isPositive(value);
}

/** `a > b`, exactly. Replaces the `a - b > 0.009` epsilon fudges. */
export function exceeds(a: MoneyLike, b: MoneyLike): boolean {
  return money(a).greaterThan(money(b));
}

/**
 * Coerce to `number`. Null and undefined stay null.
 *
 * Post S-2.1 Float→Decimal: use this only at a boundary that genuinely takes a
 * number. Do not use it to do arithmetic — that is what the helpers above are
 * for.
 */
export function toNumber(value: MoneyLike): number | null {
  if (value == null) return null;
  return Number(value);
}

export function toNumberOrZero(value: MoneyLike): number {
  if (value == null) return 0;
  return Number(value);
}

/**
 * The document amount expressed in the company's base currency.
 *
 * `exchangeRate` follows the repo's one existing FX convention, `CurrencyRate`:
 * the rate is **quote units per one base unit** — `{baseCurrency: "USD",
 * quoteCurrency: "ZWG", rate: 27.5}` means 27.5 ZWG buys 1 USD. So a ZWG
 * invoice divides by the rate to reach USD, and a document already in the base
 * currency carries a rate of 1 and converts to itself.
 */
export function toBaseAmount(amount: MoneyLike, exchangeRate: MoneyLike) {
  const fx = rate(exchangeRate);
  if (fx.lessThanOrEqualTo(0)) {
    throw new RangeError("Exchange rate must be greater than zero");
  }
  return decimalise(amount)
    .dividedBy(fx)
    .toDecimalPlaces(MONEY_SCALE, HALF_UP);
}

/**
 * Convert a document total to the base currency and split it in two, exactly.
 *
 * S-2.3. A journal entry is refused if its debits and credits differ, and two
 * *independent* conversions are all it takes to make them differ. 100 ZWG at
 * 3.00 is 33.33; a 50/50 split converted separately is 16.67 and 16.67, which
 * is 33.34. The invoice hit the same wall with net and tax, and the receipt
 * would have hit it with the settled and unsettled halves.
 *
 * So only one side is ever converted. The other is the remainder, and the two
 * add up to the total by construction:
 *
 *   base      the whole document, in base currency
 *   basePart  `part` converted, never more than `base` and never below zero
 *   baseRest  `base − basePart`
 *
 * Which side to convert is a judgement, and the caller makes it. An invoice
 * converts its **tax**, because a VAT return is filed on that figure and the
 * revenue line can absorb a cent. A receipt converts the **allocated** part,
 * because that is what settles a named invoice.
 */
export function apportionBase(input: {
  amount: MoneyLike;
  part: MoneyLike;
  exchangeRate: MoneyLike;
}): { base: Prisma.Decimal; basePart: Prisma.Decimal; baseRest: Prisma.Decimal } {
  const base = toBaseAmount(input.amount, input.exchangeRate);
  const converted = toBaseAmount(input.part, input.exchangeRate);
  const basePart = minMoney(clampAtZero(converted), clampAtZero(base));
  return { base, basePart, baseRest: money(base.minus(basePart)) };
}

/** The currency a company's ledger is kept in. */
export async function resolveBaseCurrency(companyId: string): Promise<string> {
  const settings = await prisma.accountingSettings.findUnique({
    where: { companyId },
    select: { baseCurrency: true },
  });
  return settings?.baseCurrency?.trim().toUpperCase() || "USD";
}

/**
 * The rate to stamp on a document, from the company's own `CurrencyRate` table.
 *
 * A document in the base currency is always 1. Anything else takes the most
 * recent rate on or before the document date; a company that has not entered
 * one gets an error rather than a silently invented number, because a wrong
 * rate is a wrong ledger. Payroll leans on this hard: a ZWG payslip computed
 * against an invented rate is a wrong number handed to a person.
 */
export async function resolveExchangeRate(input: {
  companyId: string;
  currency: string;
  baseCurrency: string;
  on?: Date;
}): Promise<Prisma.Decimal> {
  const currency = input.currency.trim().toUpperCase();
  const baseCurrency = input.baseCurrency.trim().toUpperCase();
  if (currency === baseCurrency) return new Prisma.Decimal(1);

  const row = await prisma.currencyRate.findFirst({
    where: {
      companyId: input.companyId,
      baseCurrency,
      quoteCurrency: currency,
      effectiveDate: { lte: input.on ?? new Date() },
    },
    orderBy: [{ effectiveDate: "desc" }],
    select: { rate: true },
  });

  const resolved = row ? rate(row.rate) : null;
  if (!resolved || resolved.lessThanOrEqualTo(0)) {
    throw new UnknownExchangeRateError(currency, baseCurrency);
  }
  return resolved;
}

export type ResolvedDocumentCurrency = {
  /** The currency the company keeps its books in. */
  baseCurrency: string;
  /** The currency this invoice, receipt, waiver or payslip is denominated in. */
  currency: string;
  /** Quote units per one base unit, at the document's date. */
  exchangeRate: Prisma.Decimal;
};

/**
 * Everything a document needs to stamp itself.
 *
 * Omitting `currency` means "the company's own", which is the case for every
 * tenant that has not turned on a second one — so the whole feature costs an
 * existing tenant nothing.
 */
export async function resolveDocumentCurrency(input: {
  companyId: string;
  currency?: string | null;
  on?: Date;
}): Promise<ResolvedDocumentCurrency> {
  const baseCurrency = await resolveBaseCurrency(input.companyId);
  const currency = input.currency?.trim().toUpperCase() || baseCurrency;
  const exchangeRate = await resolveExchangeRate({
    companyId: input.companyId,
    currency,
    baseCurrency,
    on: input.on,
  });
  return { baseCurrency, currency, exchangeRate };
}

export class UnknownExchangeRateError extends Error {
  constructor(currency: string, baseCurrency: string) {
    super(
      `No ${currency} to ${baseCurrency} exchange rate has been set`,
    );
    this.name = "UnknownExchangeRateError";
  }
}
