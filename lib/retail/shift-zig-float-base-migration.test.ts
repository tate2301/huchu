/**
 * Migration witness for `20261007150000_retail_shift_zig_float_base` (FLR-03).
 *
 * A shift keeps the dollar value of its ZiG float at the rate it was counted
 * in, zero for a dollars-only drawer, so the Z-report's expected cash and a
 * backfill of the opening journal add the same figure the opening did.
 */
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("a shift's ZiG float in dollars, as stored", () => {
  it("is numeric(14,2), required, zero by default", async () => {
    const [column] = await prisma.$queryRaw<
      Array<{ data_type: string; is_nullable: string; column_default: string | null; numeric_precision: number | null; numeric_scale: number | null }>
    >`
      SELECT data_type, is_nullable, column_default, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'RetailShift' AND column_name = 'openingFloatZigBase'`;
    expect(column).toMatchObject({ data_type: "numeric", numeric_precision: 14, numeric_scale: 2, is_nullable: "NO" });
    expect(column?.column_default).toMatch(/^0/);
  });
});
