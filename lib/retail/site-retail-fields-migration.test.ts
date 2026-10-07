/**
 * Migration witness for `20261005145439_retail_sites_and_places` (SET-02).
 *
 * A site carries its phone, its opening hours, the price list its tills sell
 * from, and when and by whom it was closed; a price list or a person going
 * away lets go of the site rather than blocking. The places inside a site keep
 * the owner's order.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { data_type: string; is_nullable: string; column_default: string | null };

async function column(table: string, name: string): Promise<ColumnFacts | undefined> {
  const [facts] = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${name}`;
  return facts;
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

describe("a site's retail fields and its places' order, as stored", () => {
  it("keeps the phone and the opening hours as optional text", async () => {
    expect(await column("Site", "phone")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
    expect(await column("Site", "openingHours")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
  });

  it("points at a price list, and lets go when the list goes", async () => {
    expect(await column("Site", "priceListId")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
    expect(await foreignKey("Site_priceListId_fkey")).toEqual({ foreign_table: "PriceList", delete_rule: "SET NULL" });
  });

  it("says when it was closed and by whom, and keeps the site if that person goes", async () => {
    expect(await column("Site", "closedAt")).toEqual({
      data_type: "timestamp without time zone",
      is_nullable: "YES",
      column_default: null,
    });
    expect(await column("Site", "closedById")).toEqual({ data_type: "text", is_nullable: "YES", column_default: null });
    expect(await foreignKey("Site_closedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });

  it("orders the places inside a site, starting at nought", async () => {
    expect(await column("StockLocation", "sortOrder")).toEqual({
      data_type: "integer",
      is_nullable: "NO",
      column_default: "0",
    });
  });
});
