/**
 * Migration witness for `retail_approval_settings` (ADM-04).
 *
 * Approvals and limits are one typed row per company with the board's
 * defaults (US$500.00 requisitions, managers change prices, below cost needs
 * the owner, US$50.00 adjustments, the owner approves count differences over
 * US$100.00, US$250.00 accounts, asked by WhatsApp and the app). The company
 * takes its row with it; the owner approver and whoever changed it are
 * forgotten when they go.
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
  const company = await prisma.company.findFirst({ where: { retailApprovalSettings: null }, select: { id: true } });
  if (!company) throw new Error("The witness needs a company without approval settings.");
  let row: Record<string, unknown> | null = null;
  await prisma
    .$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "RetailApprovalSettings" ("companyId", "updatedAt") VALUES (${company.id}, now())`;
      const [read] = await tx.$queryRaw<Array<Record<string, unknown>>>`
        SELECT "requisitionOwnerOver"::text AS "requisitionOwnerOver", "ownerApproverId",
               "priceChanges"::text AS "priceChanges", "belowCostNeedsOwner",
               "adjustmentPinOver"::text AS "adjustmentPinOver", "countDifferences"::text AS "countDifferences",
               "countOwnerOver"::text AS "countOwnerOver", "accountOwnerOver"::text AS "accountOwnerOver",
               "askBy"::text AS "askBy", "updatedById"
        FROM "RetailApprovalSettings" WHERE "companyId" = ${company.id}`;
      row = read ?? null;
      throw new Error("rollback");
    })
    .catch((error: unknown) => {
      if (!(error instanceof Error) || error.message !== "rollback") throw error;
    });
  return row;
}

describe("approval settings, as stored", () => {
  it("names the three rules' values in order", async () => {
    expect(await enumLabels("RetailPriceChangeRule")).toEqual(["MANAGERS", "OWNER"]);
    expect(await enumLabels("RetailCountApprovalRule")).toEqual(["ANY_MANAGER", "OWNER_OVER_LIMIT"]);
    expect(await enumLabels("RetailApprovalChannel")).toEqual(["APP", "WHATSAPP_AND_APP"]);
  });

  it("fills a new row with the board's defaults", async () => {
    expect(await defaultsRow()).toEqual({
      requisitionOwnerOver: "500.00",
      ownerApproverId: null,
      priceChanges: "MANAGERS",
      belowCostNeedsOwner: true,
      adjustmentPinOver: "50.00",
      countDifferences: "OWNER_OVER_LIMIT",
      countOwnerOver: "100.00",
      accountOwnerOver: "250.00",
      askBy: "WHATSAPP_AND_APP",
      updatedById: null,
    });
  });

  it("goes with its company and forgets the approver and who changed it when they go", async () => {
    expect(await foreignKey("RetailApprovalSettings_companyId_fkey")).toEqual({
      foreign_table: "Company",
      delete_rule: "CASCADE",
    });
    expect(await foreignKey("RetailApprovalSettings_ownerApproverId_fkey")).toEqual({
      foreign_table: "User",
      delete_rule: "SET NULL",
    });
    expect(await foreignKey("RetailApprovalSettings_updatedById_fkey")).toEqual({
      foreign_table: "User",
      delete_rule: "SET NULL",
    });
  });
});
