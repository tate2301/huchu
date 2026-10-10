/**
 * Migration witness for `20261008020000_retail_print_jobs` (PRD-06, 20-products §4.12).
 *
 * Shelf labels sent to a till's printer wait as a print job the till pulls;
 * a job with no till is one printed here. Read off the database.
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

async function enumLabels(name: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ label: string }>>`
    SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.label);
}

async function column(table: string, name: string) {
  const [row] = await prisma.$queryRaw<Array<{ type: string; nullable: string; fallback: string | null }>>`
    SELECT udt_name AS type, is_nullable AS nullable, column_default AS fallback
    FROM information_schema.columns WHERE table_name = ${table} AND column_name = ${name}`;
  return row ? { type: row.type, nullable: row.nullable === "YES", fallback: row.fallback } : null;
}

async function foreignKey(constraint: string) {
  const [row] = await prisma.$queryRaw<Array<{ rule: string; target: string }>>`
    SELECT rc.delete_rule AS rule, ccu.table_name AS target
    FROM information_schema.referential_constraints rc
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = rc.unique_constraint_name
    WHERE rc.constraint_name = ${constraint}`;
  return row ?? null;
}

describe("print jobs, as stored", () => {
  it("adds the kind and status enums", async () => {
    expect(await enumLabels("RetailPrintJobKind")).toEqual(["LABELS"]);
    expect(await enumLabels("RetailPrintJobStatus")).toEqual(["QUEUED", "PRINTED", "FAILED"]);
  });

  it("creates the table: a till or none, the payload, QUEUED by default", async () => {
    expect(await column("RetailPrintJob", "companyId")).toMatchObject({ type: "text", nullable: false });
    expect(await column("RetailPrintJob", "registerId")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailPrintJob", "kind")).toMatchObject({ type: "RetailPrintJobKind", nullable: false });
    expect(await column("RetailPrintJob", "payload")).toMatchObject({ type: "jsonb", nullable: false });
    expect(await column("RetailPrintJob", "status")).toMatchObject({
      type: "RetailPrintJobStatus",
      nullable: false,
      fallback: "'QUEUED'::\"RetailPrintJobStatus\"",
    });
    expect(await column("RetailPrintJob", "error")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailPrintJob", "createdById")).toMatchObject({ type: "text", nullable: true });
    expect(await column("RetailPrintJob", "createdAt")).toMatchObject({ type: "timestamp", nullable: false });
    expect(await column("RetailPrintJob", "printedAt")).toMatchObject({ type: "timestamp", nullable: true });
  });

  it("indexes a till's waiting jobs in order", async () => {
    const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'RetailPrintJob_registerId_status_createdAt_idx'`;
    expect(row?.def).toContain(`("registerId", status, "createdAt")`);
  });

  it("goes with its company and its till, and outlives the person who printed it", async () => {
    expect(await foreignKey("RetailPrintJob_companyId_fkey")).toEqual({ rule: "CASCADE", target: "Company" });
    expect(await foreignKey("RetailPrintJob_registerId_fkey")).toEqual({ rule: "CASCADE", target: "RetailRegister" });
    expect(await foreignKey("RetailPrintJob_createdById_fkey")).toEqual({ rule: "SET NULL", target: "User" });
  });
});
