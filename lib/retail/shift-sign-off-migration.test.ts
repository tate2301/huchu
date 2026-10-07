/**
 * Migration witness for `20261007190000_retail_shift_sign_off` (FLR-05).
 *
 * A manager signs off a drawer that closed short, over or without a count:
 * the decision (accept, recover from the cashier, look into it), who and when,
 * the note and what the cashier owes; the books gain a source for a recovered
 * shortage and the cashier a notification. Differences from before sign-off
 * existed (closed more than seven days before) count as accepted.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261007190000_retail_shift_sign_off/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; udt_name: string; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, udt_name, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumValues(name: string) {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ${name} ORDER BY e.enumsortorder`;
  return rows.map((row) => row.value);
}

describe("a shift's sign-off, as stored", () => {
  it("has the three decisions", async () => {
    expect(await enumValues("RetailShiftSignOff")).toEqual(["ACCEPT", "RECOVER", "LOOK_INTO"]);
  });

  it("keeps the decision, who made it and when, the note and what is owed, all empty until a sign-off writes them", async () => {
    const facts = await columns("RetailShift");
    expect(facts.get("signOffOutcome")).toMatchObject({ data_type: "USER-DEFINED", udt_name: "RetailShiftSignOff", is_nullable: "YES" });
    expect(facts.get("signedOffAt")).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "YES" });
    expect(facts.get("signedOffById")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("signOffNote")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("recoverAmount")).toMatchObject({ data_type: "numeric", numeric_precision: 14, numeric_scale: 2, is_nullable: "YES" });
    const [fk] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'RetailShift_signedOffById_fkey'`;
    expect(fk?.def).toMatch(/REFERENCES "User"\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
  });

  it("finds the drawers waiting for a sign-off by company, status and decision", async () => {
    const [index] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT indexdef AS def FROM pg_indexes WHERE indexname = 'RetailShift_companyId_status_signOffOutcome_idx'`;
    expect(index?.def).toMatch(/\("companyId", status, "signOffOutcome"\)/);
  });

  it("has a books source for a recovered shortage, and a notification for the cashier", async () => {
    expect(await enumValues("AccountingSourceType")).toContain("RETAIL_SHIFT_RECOVERY");
    expect(await enumValues("NotificationType")).toContain("RETAIL_SHIFT_SIGNED_OFF");
  });
});

describe("differences closed before the migration", () => {
  it("count as accepted when they are more than seven days old; the last week's wait for a sign-off", async () => {
    const backfill = readFileSync(MIGRATION, "utf8").split("-- Backfill")[1];
    expect(backfill).toBeTruthy();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `retail_shift_sign_off_${process.pid}_${Date.now()}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`
        CREATE TYPE "RetailShiftSignOff" AS ENUM ('ACCEPT', 'RECOVER', 'LOOK_INTO');
        CREATE TABLE "RetailShift" (
          "id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "closedAt" TIMESTAMP(3), "countedCash" DECIMAL(14,2),
          "variance" DECIMAL(14,2), "signOffOutcome" "RetailShiftSignOff", "signedOffAt" TIMESTAMP(3)
        );
        INSERT INTO "RetailShift" ("id", "status", "closedAt", "countedCash", "variance") VALUES
          ('a-short-8-days', 'CLOSED', now() - interval '8 days', 412.50, -20.00),
          ('b-uncounted-9-days', 'CLOSED', now() - interval '9 days', NULL, NULL),
          ('c-balanced-8-days', 'CLOSED', now() - interval '8 days', 300.00, 0.00),
          ('d-short-2-days', 'CLOSED', now() - interval '2 days', 100.00, -7.15),
          ('e-open', 'OPEN', NULL, NULL, NULL);
      `);
      await client.query(`--${backfill}`);
      const { rows } = await client.query<{ id: string; signOffOutcome: string | null; same: boolean | null }>(
        `SELECT "id", "signOffOutcome"::text AS "signOffOutcome", ("signedOffAt" = "closedAt") AS same FROM "RetailShift" ORDER BY "id"`,
      );
      expect(rows).toEqual([
        { id: "a-short-8-days", signOffOutcome: "ACCEPT", same: true },
        { id: "b-uncounted-9-days", signOffOutcome: "ACCEPT", same: true },
        { id: "c-balanced-8-days", signOffOutcome: null, same: null },
        { id: "d-short-2-days", signOffOutcome: null, same: null },
        { id: "e-open", signOffOutcome: null, same: null },
      ]);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
});
