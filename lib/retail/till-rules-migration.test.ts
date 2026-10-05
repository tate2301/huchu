/**
 * Migration witness for `retail_till_rules` (SET-06).
 *
 * The till rules are one typed row per company with the board's defaults
 * (US$20.00 refunds, voids always need a PIN, the two reason lists, split
 * tender and references on, 10%, the drawer shut, US$500.00, 24 hours), and
 * the JSON rows they replace under the reserved provider keys are gone.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label
    FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name}
    ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function foreignKey(name: string) {
  const [fk] = await prisma.$queryRaw<Array<{ foreign_table: string; delete_rule: string }>>`
    SELECT ccu.table_name AS foreign_table, rc.delete_rule
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${name}`;
  return fk;
}

/** A row inserted with nothing but its company, read back as the database filled it, then rolled back. */
async function defaultsRow() {
  const company = await prisma.company.findFirst({ where: { retailTillRules: null }, select: { id: true } });
  if (!company) throw new Error("The witness needs a company without till rules.");
  let row: Record<string, unknown> | null = null;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "RetailTillRules" ("companyId", "updatedAt") VALUES (${company.id}, now())`;
      const [read] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "refundPinOver"::text AS "refundPinOver", "voidPin"::text AS "voidPin", "refundReasons", "voidReasons",
               "splitTender", "referenceRequired", "maxCashierDiscountPercent"::text AS "maxCashierDiscountPercent",
               "drawerOpenWithoutSale", "cashDropPromptOver"::text AS "cashDropPromptOver", "offlineHours", "updatedById"
        FROM "RetailTillRules" WHERE "companyId" = ${company.id}`;
      row = read ?? null;
      throw new Error("rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  return row;
}

describe("till rules, as stored", () => {
  it("names the three void rules in order", async () => {
    expect(await enumLabels("RetailVoidPinRule")).toEqual(["ALWAYS", "AFTER_5_MINUTES", "NEVER"]);
  });

  it("fills a new row with the board's defaults, the two reason lists included", async () => {
    expect(await defaultsRow()).toEqual({
      refundPinOver: "20.00",
      voidPin: "ALWAYS",
      refundReasons: ["Damaged", "Wrong item", "Changed mind", "Overcharged"],
      voidReasons: ["Rang up wrong", "Customer left", "Test sale"],
      splitTender: true,
      referenceRequired: true,
      maxCashierDiscountPercent: "10.00",
      drawerOpenWithoutSale: false,
      cashDropPromptOver: "500.00",
      offlineHours: 24,
      updatedById: null,
    });
  });

  it("goes with its company and forgets who changed it when they go", async () => {
    expect(await foreignKey("RetailTillRules_companyId_fkey")).toEqual({ foreign_table: "Company", delete_rule: "CASCADE" });
    expect(await foreignKey("RetailTillRules_updatedById_fkey")).toEqual({ foreign_table: "User", delete_rule: "SET NULL" });
  });

  it("leaves no row under the reserved provider keys", async () => {
    const reserved = await prisma.fiscalisationProviderConfig.count({
      where: { providerKey: { in: ["RETAIL_POS_POLICY", "RETAIL_TENDER_POLICY"] } },
    });
    expect(reserved).toBe(0);
  });
});
