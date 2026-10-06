/**
 * Migration witness for `20261006140000_retail_z_report_approved_discounts`.
 *
 * An end-of-day report keeps how many of the day's discounts a manager
 * approved, frozen with it like its other counts; a report taken before reads 0.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

describe("the approved discounts on an end-of-day report, as stored", () => {
  it("is a count, never empty, 0 unless set", async () => {
    const [column] = await prisma.$queryRaw<Array<{ type: string; nullable: string; default: string | null }>>`
      SELECT udt_name AS type, is_nullable AS nullable, column_default AS default
      FROM information_schema.columns
      WHERE table_name = 'RetailZReport' AND column_name = 'approvedDiscountCount'`;
    expect(column).toMatchObject({ type: "int4", nullable: "NO", default: "0" });
  });
});
