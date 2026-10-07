/**
 * Migration witness for `20261007170000_retail_shift_count` (FLR-04).
 *
 * A shift's close keeps its count by note (US$, ZiG and the rate that added
 * them, with the rows typed), who closed it (let go of if their account is
 * removed), what happened and what went to the safe; the books have a source
 * for the cash a close sends to the safe, and a drawer that closed out is
 * something a manager is told about. Shifts closed before it read as counted
 * in US$ at 1, with their notes as what happened.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "pg";
import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

const MIGRATION = path.join(process.cwd(), "prisma/migrations/20261007170000_retail_shift_count/migration.sql");

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; numeric_precision: number | null; numeric_scale: number | null };

async function columns(table: string) {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${table}`;
  return new Map(rows.map((row) => [row.column_name, row]));
}

async function enumValues(name: string) {
  const rows = await prisma.$queryRaw<Array<{ value: string }>>`
    SELECT e.enumlabel AS value FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = ${name}`;
  return rows.map((row) => row.value);
}

describe("a shift's count and close, as stored", () => {
  it("keeps the count by note, the note, who closed it and what went to the safe, all empty until a close writes them", async () => {
    const facts = await columns("RetailShift");
    for (const name of ["countedUsd", "countedZig", "toSafe"]) {
      expect(facts.get(name), name).toMatchObject({ data_type: "numeric", numeric_precision: 14, numeric_scale: 2, is_nullable: "YES" });
    }
    expect(facts.get("countRate")).toMatchObject({ data_type: "numeric", numeric_precision: 12, numeric_scale: 4, is_nullable: "YES" });
    expect(facts.get("countLines")).toMatchObject({ data_type: "jsonb", is_nullable: "YES" });
    expect(facts.get("closeNote")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.get("closedById")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    const [row] = await prisma.$queryRaw<Array<{ def: string }>>`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'RetailShift_closedById_fkey'`;
    expect(row?.def).toMatch(/REFERENCES "User"\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
  });

  it("has a books source for the close's cash to the safe, and a notification for a drawer that closed out", async () => {
    expect(await enumValues("AccountingSourceType")).toContain("RETAIL_SHIFT_CLOSE");
    expect(await enumValues("NotificationType")).toContain("RETAIL_SHIFT_DIFFERENCE");
  });
});

describe("shifts closed before the migration", () => {
  it("read as counted in US$ at a rate of 1, with their notes as what happened", async () => {
    // The backfill alone, on a table shaped like the old one: the enum changes need the real types.
    const backfill = readFileSync(MIGRATION, "utf8").split("-- Backfill")[1];
    expect(backfill).toBeTruthy();
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const schema = `retail_shift_count_${process.pid}_${Date.now()}`;
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET LOCAL search_path TO "${schema}"`);
      await client.query(`
        CREATE TABLE "RetailShift" (
          "id" TEXT PRIMARY KEY, "status" TEXT NOT NULL, "countedCash" DECIMAL(14,2), "notes" TEXT,
          "countedUsd" DECIMAL(14,2), "countRate" DECIMAL(12,4), "closeNote" TEXT
        );
        INSERT INTO "RetailShift" ("id", "status", "countedCash", "notes") VALUES
          ('closed', 'CLOSED', 812.40, 'Short a 10'),
          ('uncounted', 'CLOSED', NULL, 'Device lost'),
          ('open', 'OPEN', NULL, 'Opened late');
      `);
      await client.query(`--${backfill}`);
      const { rows } = await client.query<{ id: string; countedCash: string | null; countedUsd: string | null; countRate: string | null; closeNote: string | null }>(
        `SELECT "id", "countedCash"::text, "countedUsd"::text, "countRate"::text, "closeNote" FROM "RetailShift" ORDER BY "id"`,
      );
      expect(rows).toEqual([
        { id: "closed", countedCash: "812.40", countedUsd: "812.40", countRate: "1.0000", closeNote: "Short a 10" },
        { id: "open", countedCash: null, countedUsd: null, countRate: null, closeNote: null },
        { id: "uncounted", countedCash: null, countedUsd: null, countRate: null, closeNote: "Device lost" },
      ]);
      expect(rows.find((row) => row.id === "closed")?.countedUsd).toBe(rows.find((row) => row.id === "closed")?.countedCash);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });
});
