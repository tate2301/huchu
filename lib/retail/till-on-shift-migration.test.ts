/**
 * Migration witness for `retail_till_on_shift_and_sale` (SET-04).
 *
 * A shift is on a till: `RetailShift.registerId` is required, with a foreign
 * key that keeps a till while it has shifts, and every shift the migration
 * found was given one (a till code with no till row got an inactive till).
 * A sale names its till and device when the till rang it, and carries the
 * printed time and the review flag a manager reads.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { data_type: string; is_nullable: string };

async function column(table: string, name: string): Promise<ColumnFacts | undefined> {
  const [facts] = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT data_type, is_nullable
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

describe("a shift and a sale on their till, as stored", () => {
  it("requires a till on every shift and keeps the till while it has shifts", async () => {
    expect(await column("RetailShift", "registerId")).toEqual({ data_type: "text", is_nullable: "NO" });
    expect(await foreignKey("RetailShift_registerId_fkey")).toEqual({ foreign_table: "RetailRegister", delete_rule: "RESTRICT" });
  });

  it("leaves no shift without a till", async () => {
    const [row] = await prisma.$queryRaw<Array<{ orphans: bigint }>>`
      SELECT COUNT(*) AS orphans FROM "RetailShift" sh
      LEFT JOIN "RetailRegister" r ON r."id" = sh."registerId"
      WHERE r."id" IS NULL`;
    expect(Number(row.orphans)).toBe(0);
  });

  it("names the device a shift was opened on, and lets go when the device row goes", async () => {
    expect(await column("RetailShift", "deviceId")).toEqual({ data_type: "text", is_nullable: "YES" });
    expect(await foreignKey("RetailShift_deviceId_fkey")).toEqual({ foreign_table: "RetailDevice", delete_rule: "SET NULL" });
  });

  it("stamps a sale with its till and device, both optional for back-office sales", async () => {
    expect(await column("RetailSale", "registerId")).toEqual({ data_type: "text", is_nullable: "YES" });
    expect(await column("RetailSale", "deviceId")).toEqual({ data_type: "text", is_nullable: "YES" });
    expect(await foreignKey("RetailSale_registerId_fkey")).toEqual({ foreign_table: "RetailRegister", delete_rule: "SET NULL" });
    expect(await foreignKey("RetailSale_deviceId_fkey")).toEqual({ foreign_table: "RetailDevice", delete_rule: "SET NULL" });
  });

  it("keeps when the receipt printed and why a manager should look at a sale", async () => {
    expect(await column("RetailSale", "printedAt")).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "YES" });
    expect(await column("RetailSale", "reviewReason")).toEqual({ data_type: "text", is_nullable: "YES" });
    expect(await column("RetailSale", "reviewedAt")).toMatchObject({ is_nullable: "YES" });
    expect(await foreignKey("RetailSale_reviewedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });

  it("indexes the shifts open on a till and a till's sales by time", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('RetailShift_registerId_status_idx', 'RetailSale_companyId_registerId_postedAt_idx')`;
    expect(indexes.map((index) => index.indexname).sort()).toEqual([
      "RetailSale_companyId_registerId_postedAt_idx",
      "RetailShift_registerId_status_idx",
    ]);
  });
});

describe("the setup profile, gone (retail_drop_setup_profile)", () => {
  it("leaves no RETAIL_SETUP_PROFILE row: a till is the one a device is paired to", async () => {
    expect(await prisma.fiscalisationProviderConfig.count({ where: { providerKey: "RETAIL_SETUP_PROFILE" } })).toBe(0);
  });
});
