/**
 * Migration witness for `20261003220000_retail_line_deposit_and_z_deposits`.
 *
 * Each sale line keeps the deposit it took, so a refund of part of the line can
 * hand back exactly its share; and the Z-report keeps the day's deposits held
 * beside its takings. Both are money to two places, not null, and nothing on
 * every row written before the columns existed.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

const COLUMNS: Array<[table: string, column: string]> = [
  ["RetailSaleLine", "depositAmount"],
  ["RetailZReport", "depositTotal"],
];

describe("bottle deposits per line and per day, as stored", () => {
  it.each(COLUMNS)('"%s"."%s" is money to two places that defaults to nothing', async (table, column) => {
    const [facts] = await prisma.$queryRaw<
      Array<{ data_type: string; numeric_precision: number; numeric_scale: number; is_nullable: string; column_default: string }>
    >`
      SELECT data_type, numeric_precision, numeric_scale, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = ${table} AND column_name = ${column}`;
    expect(facts).toEqual({
      data_type: "numeric",
      numeric_precision: 14,
      numeric_scale: 2,
      is_nullable: "NO",
      column_default: "0",
    });
  });
});
