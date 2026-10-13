/**
 * Migration witness for `20261013120000_reports_folders_insights`.
 *
 * A report folder is one company's and goes with it; a report keeps its place
 * when its folder is deleted, as "not in a folder". An insight is a Vane item
 * of its own kind. Vane learns when to write them and which board they pin to,
 * and its reader reaches all of it.
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

describe("report folders and insights, as stored", () => {
  it("files a report in at most one folder, and keeps it when the folder goes", async () => {
    expect((await columns("CustomReport")).folderId).toMatchObject({ data_type: "text", is_nullable: "YES" });
    const rows = await prisma.$queryRaw<Array<{ table: string; column: string; on_delete: string }>>`
      SELECT kcu.table_name AS table, kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name IN ('ReportFolder', 'CustomReport') AND kcu.column_name IN ('folderId', 'companyId')
      ORDER BY kcu.table_name, kcu.column_name`;
    expect(rows).toEqual([
      { table: "CustomReport", column: "companyId", on_delete: "CASCADE" },
      { table: "CustomReport", column: "folderId", on_delete: "SET NULL" },
      { table: "ReportFolder", column: "companyId", on_delete: "CASCADE" },
    ]);
  });

  it("names a folder once per workspace", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'ReportFolder' AND indexname = 'ReportFolder_companyId_name_key'`;
    expect(rows[0]?.indexdef).toContain("UNIQUE INDEX");
  });

  it("keeps insights as their own kind of Vane item", async () => {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`SELECT unnest(enum_range(NULL::"VaneItemKind"))::text AS value`;
    expect(rows.map((row) => row.value)).toEqual(["ISSUE", "SUGGESTION", "INSIGHT"]);
  });

  it("writes the week's insights on Monday at 06:00 until a workspace says otherwise", async () => {
    const facts = await columns("VaneSettings");
    expect(facts.insightsSchedule).toMatchObject({ is_nullable: "NO", column_default: "'MON 06:00'::character varying" });
    expect(facts.insightsBoardId).toMatchObject({ is_nullable: "YES" });
  });

  it("lets Vane's reader read folders, a report's folder and the insights settings", async () => {
    const rows = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT'
        AND ((table_name = 'ReportFolder')
          OR (table_name = 'CustomReport' AND column_name = 'folderId')
          OR (table_name = 'VaneSettings' AND column_name IN ('insightsSchedule', 'insightsBoardId')))
      ORDER BY table_name, column_name`;
    expect(rows.map((row) => `${row.table_name}.${row.column_name}`)).toEqual([
      "CustomReport.folderId",
      "ReportFolder.companyId",
      "ReportFolder.createdAt",
      "ReportFolder.createdById",
      "ReportFolder.id",
      "ReportFolder.name",
      "ReportFolder.sortOrder",
      "ReportFolder.updatedAt",
      "VaneSettings.insightsBoardId",
      "VaneSettings.insightsSchedule",
    ]);
  });
});
