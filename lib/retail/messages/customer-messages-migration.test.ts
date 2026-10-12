/**
 * Migration witness for `20261012130400_retail_customer_messages` (CUS-06).
 *
 * The purpose enum's labels in order, the batch table, the message's
 * customer and batch columns, both links letting go (`SET NULL`), and the
 * customer's message index. Read off the database.
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

describe("customer messages, as stored", () => {
  it("names the purposes in order", async () => {
    const rows = await prisma.$queryRaw<Array<{ label: string }>>`
      SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'RetailMessagePurpose' ORDER BY e.enumsortorder`;
    expect(rows.map((row) => row.label)).toEqual(["OFFER", "ACCOUNT_REMINDER", "LAYBY_REMINDER", "STATEMENT"]);
  });

  it("creates the batch table", async () => {
    expect(await column("RetailMessageBatch", "purpose")).toMatchObject({ type: "RetailMessagePurpose", nullable: false });
    expect(await column("RetailMessageBatch", "audience")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailMessageBatch", "template")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailMessageBatch", "scheduledFor")).toMatchObject({ type: "timestamp", nullable: true });
    expect(await column("RetailMessageBatch", "total")).toMatchObject({ type: "int4", nullable: false });
    expect(await column("RetailMessageBatch", "createdById")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailMessageBatch", "createdAt")).toMatchObject({ type: "timestamp", nullable: false });
    expect(await foreignKey("RetailMessageBatch_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailMessageBatch_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });

  it("adds the message's customer and batch, both letting go", async () => {
    expect(await column("RetailMessage", "customerId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailMessage", "batchId")).toMatchObject({ type: "text", nullable: true });
    expect(await foreignKey("RetailMessage_customerId_fkey")).toEqual({ rule: "SET NULL", target: "Customer" });
    expect(await foreignKey("RetailMessage_batchId_fkey")).toEqual({ rule: "SET NULL", target: "RetailMessageBatch" });
  });

  it("indexes a customer's messages by when", async () => {
    expect(await indexDef("RetailMessage_customerId_createdAt_idx")).toContain(`("customerId", "createdAt")`);
  });

  it("adds no second schedule and no document columns", async () => {
    expect(await column("RetailMessage", "documentUrl")).toBeNull();
    expect(await column("RetailMessage", "documentName")).toBeNull();
    const schedules = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_name = 'RetailMessage' AND column_name ILIKE '%schedul%'`;
    expect(schedules.map((row) => row.name)).toEqual(["scheduledFor"]);
  });
});
