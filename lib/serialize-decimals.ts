import { Prisma } from "@prisma/client";

/**
 * Walk an object/array and convert any Prisma.Decimal instance to a Number.
 * Run at every API GET response site that returns Gold data.
 *
 * Decimal precision >= 15 digits would lose precision in JS Number; this is
 * acceptable for Gold (max grams ~9999g, max USD ~$10M) but not for arbitrary
 * financial data. Use Decimal-aware client libraries if precision matters.
 */
export function serializeDecimals<T>(value: T): T {
  if (value == null) return value;
  if (value instanceof Prisma.Decimal) {
    return Number(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(serializeDecimals) as unknown as T;
  }
  if (typeof value === "object") {
    if (value instanceof Date) return value;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeDecimals(v);
    }
    return out as T;
  }
  return value;
}
