/**
 * Migration witness for `20261013130000_saved_views`.
 *
 * A saved view is one company's page address under a name: it goes with the
 * company and with the person who made it, is looked up by company and page,
 * and Vane's reader reaches every column of it.
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

describe("saved views, as stored", () => {
  it("keeps a page, a name and its query, just yours until shared", async () => {
    const facts = await columns("SavedView");
    expect(Object.keys(facts).sort()).toEqual(
      ["companyId", "createdAt", "createdById", "id", "isShared", "name", "path", "query", "updatedAt"].sort(),
    );
    expect(facts.path).toMatchObject({ data_type: "character varying", is_nullable: "NO" });
    expect(facts.name).toMatchObject({ data_type: "character varying", is_nullable: "NO" });
    expect(facts.query).toMatchObject({ is_nullable: "NO", column_default: "''::character varying" });
    expect(facts.isShared).toMatchObject({ data_type: "boolean", is_nullable: "NO", column_default: "false" });
  });

  it("goes with its company and with the person who made it", async () => {
    const rows = await prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
      SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'SavedView'
      ORDER BY kcu.column_name`;
    expect(rows).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "createdById", on_delete: "CASCADE" },
    ]);
  });

  it("is looked up by company and page", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'SavedView' AND indexname = 'SavedView_companyId_path_idx'`;
    expect(rows[0]?.indexdef).toContain('("companyId", path)');
  });

  it("lets Vane's reader read every column, inside its workspace", async () => {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT' AND table_name = 'SavedView'
      ORDER BY column_name`;
    expect(rows.map((row) => row.column_name)).toEqual([
      "companyId",
      "createdAt",
      "createdById",
      "id",
      "isShared",
      "name",
      "path",
      "query",
      "updatedAt",
    ]);
    const policies = await prisma.$queryRaw<Array<{ policyname: string }>>`
      SELECT policyname FROM pg_policies WHERE tablename = 'SavedView' ORDER BY policyname`;
    expect(policies.map((row) => row.policyname)).toEqual(["app_all", "vane_workspace"]);
  });
});
