/**
 * Decimal coercion helpers for Gold.
 *
 * Prisma returns `Decimal` for any column typed `Decimal` in the schema, but
 * almost every Gold code path wants a plain `number` to do arithmetic with.
 * Hand-rolled `Number(x.grams)` calls have proliferated — each one will need
 * to be revisited when Epic 6 widens the set of Decimal columns. Centralise
 * the coercion now so that migration touches one file.
 *
 * Owner: `gold-domain-backend` (lib/gold/**). HR/disbursements callers
 * should keep using their own coercion paths and not import these.
 *
 * Hard rule: never silently lose precision. If a caller needs more than
 * `number` precision (USD totals at scale, period summaries), keep the
 * `Decimal` and do the arithmetic with `Prisma.Decimal`.
 */
import type { Prisma } from "@prisma/client";

/** A column shape Prisma may hand back: Decimal, number, bigint, string, or null. */
export type DecimalLike =
  | Prisma.Decimal
  | number
  | bigint
  | string
  | null
  | undefined;

/**
 * Coerce a Decimal-like to `number`. Null/undefined inputs return null.
 * Use for gram weights — values that fit comfortably in a JS double.
 */
export function toGrams(v: DecimalLike): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

/**
 * Same as toGrams, but returns 0 instead of null. Use when the caller is
 * about to do arithmetic and can treat "missing" as "zero" (e.g. summing
 * `boysGrams` across rows where some are nullable).
 */
export function toGramsOrZero(v: DecimalLike): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/**
 * Coerce a Decimal-like USD amount to `number`. Same shape as toGrams —
 * separate function so the type signature documents intent at the call
 * site and so we can swap the implementation later (e.g. to round at the
 * cent boundary) without grepping every coercion.
 */
export function toUsd(v: DecimalLike): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

export function toUsdOrZero(v: DecimalLike): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/**
 * Map the four canonical gram fields on a `GoldLedgerImportEntry`-shaped row
 * from Decimal-like to number. Used by the import commit path to normalise
 * a batch of rows in one pass.
 *
 * Generic so callers keep their full row shape; the function only touches
 * the gram fields.
 */
export function mapEntryGrams<
  T extends {
    gramsTotal: DecimalLike;
    boysGrams: DecimalLike;
    mdaraGrams: DecimalLike;
    balGrams: DecimalLike;
  },
>(row: T): Omit<T, "gramsTotal" | "boysGrams" | "mdaraGrams" | "balGrams"> & {
  gramsTotal: number | null;
  boysGrams: number | null;
  mdaraGrams: number | null;
  balGrams: number | null;
} {
  return {
    ...row,
    gramsTotal: toGrams(row.gramsTotal),
    boysGrams: toGrams(row.boysGrams),
    mdaraGrams: toGrams(row.mdaraGrams),
    balGrams: toGrams(row.balGrams),
  };
}
