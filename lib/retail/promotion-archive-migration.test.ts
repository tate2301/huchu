/**
 * Migration witness for `20261003210000_retail_promotion_archive`: a promotion
 * goes in the bin by date, and every promotion before this was not in it.
 */
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

describe("RetailPromotion.archivedAt, as stored", () => {
  it("is a nullable timestamp", async () => {
    const [column] = await prisma.$queryRaw<Array<{ data_type: string; is_nullable: string }>>`
      SELECT data_type, is_nullable FROM information_schema.columns
      WHERE table_name = 'RetailPromotion' AND column_name = 'archivedAt'`;
    expect(column).toEqual({ data_type: "timestamp without time zone", is_nullable: "YES" });
  });
});
