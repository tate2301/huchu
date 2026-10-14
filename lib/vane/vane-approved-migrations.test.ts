/**
 * Migration witnesses for the Vane changes the owner approved on 14 October:
 *
 * - `20261014190000_vane_card_choices`: what one person chose for a kind of
 *   card they keep setting aside (Stop it for me, Keep showing it).
 * - `20261014200000_vane_plans_wait_for_start`: a plan waits for Start, and
 *   keeps the job that laid it out.
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

describe("a person's choice for a kind of card", () => {
  it("keeps one choice per person and kind in a workspace, and goes with the workspace or the person", async () => {
    const facts = await columns("VaneCardChoice");
    expect(Object.keys(facts)).toEqual(["cardKey", "companyId", "createdAt", "id", "stopped", "updatedAt", "userId"]);
    expect(facts.stopped).toMatchObject({ data_type: "boolean", is_nullable: "NO" });
    expect(facts.cardKey).toMatchObject({ data_type: "text", is_nullable: "NO" });
    const unique = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'VaneCardChoice' AND indexname = 'VaneCardChoice_companyId_userId_cardKey_key'`;
    expect(unique[0]?.indexdef).toContain("UNIQUE INDEX");
    const keys = await prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
      SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'VaneCardChoice'
      ORDER BY kcu.column_name`;
    expect(keys).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "userId", on_delete: "CASCADE" },
    ]);
  });

  it("is readable by Vane's reader, one workspace at a time", async () => {
    expect(await readerColumns("VaneCardChoice")).toEqual(["cardKey", "companyId", "createdAt", "id", "stopped", "updatedAt", "userId"]);
    const policies = await prisma.$queryRaw<Array<{ policyname: string }>>`
      SELECT policyname FROM pg_policies WHERE tablename = 'VaneCardChoice' ORDER BY policyname`;
    expect(policies.map((row) => row.policyname)).toEqual(["app_all", "vane_workspace"]);
  });
});

describe("a plan waits for Start, and keeps its job", () => {
  it("has a waiting state before open", async () => {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`SELECT unnest(enum_range(NULL::"VanePlanStatus"))::text AS value`;
    expect(rows.map((row) => row.value)).toEqual(["WAITING", "OPEN", "DONE", "CANCELLED"]);
  });

  it("points at the job that laid it out, and keeps the plan when the job goes", async () => {
    expect((await columns("VanePlan")).jobId).toMatchObject({ data_type: "text", is_nullable: "YES" });
    const keys = await prisma.$queryRaw<Array<{ on_delete: string }>>`
      SELECT rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'VanePlan' AND kcu.column_name = 'jobId'`;
    expect(keys).toEqual([{ on_delete: "SET NULL" }]);
  });

  it("lets Vane's reader read it", async () => {
    expect(await readerColumns("VanePlan")).toContain("jobId");
  });
});
