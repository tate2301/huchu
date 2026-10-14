/**
 * Migration witnesses for the Vane changes the owner approved on 14 October:
 *
 * - `20261014120000_vane_job_request`: a job keeps the person's whole request.
 *
 * Each checks the column or table as Postgres stores it, and that Vane's
 * reader can read it (the lines `pnpm vane:reader-sql` prints).
 */

import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

const columns = async (table: string) => {
  const rows = await prisma.$queryRaw<ColumnFacts[]>`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = ${table}
    ORDER BY column_name`;
  return Object.fromEntries(rows.map((row) => [row.column_name, row]));
};

const readerColumns = async (table: string) => {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.column_privileges
    WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT' AND table_name = ${table}
    ORDER BY column_name`;
  return rows.map((row) => row.column_name);
};

describe("a job keeps the person's whole request", () => {
  it("stores the request as text of any length, empty for jobs no person gave", async () => {
    expect((await columns("VaneJob")).request).toMatchObject({ data_type: "text", is_nullable: "YES", column_default: null });
  });

  it("lets Vane's reader read it", async () => {
    expect(await readerColumns("VaneJob")).toContain("request");
  });
});
