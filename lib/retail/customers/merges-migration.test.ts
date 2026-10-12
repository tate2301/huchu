/**
 * Migration witness for `20261012050000_retail_customer_merges` (CUS-05, 65-customers-merge).
 *
 * The merge table with its columns and defaults, one row per duplicate (the
 * unique), the survivor index, and both links to the customer that cascade.
 * Read off the database.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function indexDef(name: string) {
  const [row] = await prisma.$queryRaw<Array<{ def: string }>>`SELECT indexdef AS def FROM pg_indexes WHERE indexname = ${name}`;
  return row?.def ?? null;
}

async function foreignKey(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
    SELECT rc.delete_rule AS rule, ccu.table_name AS target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${constraint}`;
  return row ?? null;
}

describe("customer merges, as stored", () => {
  it("keeps who went into whom, what moved and when it was undone", async () => {
    for (const name of ["id", "companyId", "survivorId", "duplicateId"]) {
      expect(await column("RetailCustomerMerge", name)).toMatchObject({ type: "text", nullable: false });
    }
    for (const name of ["survivorPhoneBefore", "mergedById", "undoneById"]) {
      expect(await column("RetailCustomerMerge", name)).toMatchObject({ type: "text", nullable: true });
    }
    for (const name of ["saleIds", "laybyIds", "voucherIds", "noteIds"]) {
      expect(await column("RetailCustomerMerge", name)).toMatchObject({ type: "_text" });
    }
    expect(await column("RetailCustomerMerge", "filledFields")).toMatchObject({ type: "_text", fallback: "ARRAY[]::text[]" });
    expect(await column("RetailCustomerMerge", "accountMoved")).toMatchObject({ type: "bool", nullable: false, fallback: "false" });
    expect(await column("RetailCustomerMerge", "points")).toMatchObject({ type: "int4", nullable: false });
    expect(await column("RetailCustomerMerge", "visits")).toMatchObject({ type: "int4", nullable: false });
    expect(await column("RetailCustomerMerge", "createdAt")).toMatchObject({ type: "timestamp", nullable: false, fallback: "CURRENT_TIMESTAMP" });
    expect(await column("RetailCustomerMerge", "undoneAt")).toMatchObject({ type: "timestamp", nullable: true });
  });

  it("holds one merge per duplicate and finds a survivor's merges", async () => {
    expect(await indexDef("RetailCustomerMerge_duplicateId_key")).toContain("UNIQUE INDEX");
    expect(await indexDef("RetailCustomerMerge_duplicateId_key")).toContain(`("duplicateId")`);
    expect(await indexDef("RetailCustomerMerge_companyId_survivorId_idx")).toContain(`("companyId", "survivorId")`);
  });

  it("goes with the company and with either customer", async () => {
    expect(await foreignKey("RetailCustomerMerge_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailCustomerMerge_survivorId_fkey")).toEqual({ rule: "CASCADE", target: "Customer" });
    expect(await foreignKey("RetailCustomerMerge_duplicateId_fkey")).toEqual({ rule: "CASCADE", target: "Customer" });
  });
});
