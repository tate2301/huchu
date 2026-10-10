/**
 * Migration witness for `20261004120000_report_templates`.
 *
 * A template is one company's, made by one person, read from one report by
 * key. It goes with its company and with whoever made it, keeps its view as
 * JSON, its kept params as JSON that is empty rather than missing, and is
 * private until someone shares it.
 */

import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

describe("report templates, as stored", () => {
  it("has the columns a template is read from", async () => {
    const rows = await prisma.$queryRaw<ColumnFacts[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'ReportTemplate'
      ORDER BY column_name`;
    const facts = Object.fromEntries(rows.map((row) => [row.column_name, row]));
    expect(facts.view).toMatchObject({ data_type: "jsonb", is_nullable: "NO", column_default: null });
    expect(facts.params).toMatchObject({ data_type: "jsonb", is_nullable: "NO", column_default: "'{}'::jsonb" });
    expect(facts.audience).toMatchObject({ data_type: "USER-DEFINED", is_nullable: "NO", column_default: "'JUST_ME'::\"ReportTemplateAudience\"" });
    expect(facts.description).toMatchObject({ is_nullable: "YES" });
    expect(facts.reportKey).toMatchObject({ data_type: "text", is_nullable: "NO" });
  });

  it("offers exactly three audiences", async () => {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`
      SELECT unnest(enum_range(NULL::"ReportTemplateAudience"))::text AS value`;
    expect(rows.map((row) => row.value)).toEqual(["JUST_ME", "MANAGERS", "EVERYONE"]);
  });

  it("goes with its company and with whoever made it", async () => {
    const rows = await prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
      SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'ReportTemplate'
      ORDER BY kcu.column_name`;
    expect(rows).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "createdById", on_delete: "CASCADE" },
    ]);
  });
});
