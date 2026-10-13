/**
 * Migration witness for `20261013140000_report_schedules`.
 *
 * A schedule is one company's and goes with it, and with the person who set
 * it. It is on until someone stops it, sends a PDF summary unless told
 * otherwise, and the sender finds the due ones by `active` and `nextRunAt`.
 * Vane's reader can read schedules; it is granted nothing else on them.
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

describe("report schedules, as stored", () => {
  it("keeps how often, when, to whom and as what", async () => {
    const facts = await columns("ReportSchedule");
    expect(facts.reportKey).toMatchObject({ is_nullable: "NO" });
    expect(facts.frequency).toMatchObject({ data_type: "USER-DEFINED", is_nullable: "NO" });
    expect(facts.day).toMatchObject({ data_type: "integer", is_nullable: "YES" });
    expect(facts.time).toMatchObject({ data_type: "character varying", is_nullable: "NO" });
    expect(facts.recipientIds).toMatchObject({ data_type: "ARRAY" });
    expect(facts.format).toMatchObject({ column_default: "'PDF'::\"ReportScheduleFormat\"" });
    expect(facts.content).toMatchObject({ column_default: "'SUMMARY'::\"ReportScheduleContent\"" });
    expect(facts.query).toMatchObject({ is_nullable: "NO", column_default: "''::character varying" });
    expect(facts.active).toMatchObject({ is_nullable: "NO", column_default: "true" });
    expect(facts.nextRunAt).toMatchObject({ is_nullable: "YES" });
    expect(facts.lastSentAt).toMatchObject({ is_nullable: "YES" });
  });

  it("sends daily, weekly or monthly", async () => {
    const rows = await prisma.$queryRaw<Array<{ value: string }>>`SELECT unnest(enum_range(NULL::"ReportScheduleFrequency"))::text AS value`;
    expect(rows.map((row) => row.value)).toEqual(["DAILY", "WEEKLY", "MONTHLY"]);
  });

  it("goes with its workspace and with the person who set it", async () => {
    const rows = await prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
      SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'ReportSchedule'
      ORDER BY kcu.column_name`;
    expect(rows).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "createdById", on_delete: "CASCADE" },
    ]);
  });

  it("finds the due schedules by an index", async () => {
    const rows = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'ReportSchedule' AND indexname = 'ReportSchedule_active_nextRunAt_idx'`;
    expect(rows[0]?.indexdef).toContain('(active, "nextRunAt")');
  });

  it("lets Vane's reader read schedules, and only read them", async () => {
    const read = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND privilege_type = 'SELECT' AND table_name = 'ReportSchedule'
      ORDER BY column_name`;
    expect(read.map((row) => row.column_name)).toEqual([
      "active",
      "companyId",
      "content",
      "createdAt",
      "createdById",
      "day",
      "format",
      "frequency",
      "id",
      "lastSentAt",
      "nextRunAt",
      "query",
      "recipientIds",
      "reportKey",
      "time",
      "updatedAt",
    ]);
    const written = await prisma.$queryRaw<Array<{ privilege_type: string }>>`
      SELECT DISTINCT privilege_type FROM information_schema.column_privileges
      WHERE grantee = 'vane_reader' AND table_name = 'ReportSchedule' AND privilege_type <> 'SELECT'`;
    expect(written).toEqual([]);
  });
});
