/**
 * The migration witness for `20260929090000_report_settings`, and the round
 * trip of a workspace's report settings through it.
 *
 * Read from `information_schema` rather than trusted from the schema file: a
 * green `prisma generate` says nothing about whether the table exists.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { defaultLayout } from "./layout";
import { disabledReportKeys, readReportSetting, readReportSettings, saveReportSetting } from "./settings";

type ColumnRow = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

let companyId = "";
let otherId = "";

beforeAll(async () => {
  const stamp = Date.now();
  const [company, other] = await Promise.all([
    prisma.company.create({ data: { name: `Report settings ${stamp}`, slug: `report-settings-${stamp}` } }),
    prisma.company.create({ data: { name: `Report settings other ${stamp}`, slug: `report-settings-other-${stamp}` } }),
  ]);
  companyId = company.id;
  otherId = other.id;
});

afterAll(async () => {
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherId] } } });
});

describe("20260929090000_report_settings", () => {
  it("creates ReportSetting with the columns the settings read", async () => {
    const rows = await prisma.$queryRaw<ColumnRow[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'ReportSetting'
    `;
    const cols = new Map(rows.map((row) => [row.column_name, row]));
    expect(cols.get("reportKey")?.is_nullable).toBe("NO");
    // On unless switched off: a report is offered until somebody says otherwise.
    expect(cols.get("enabled")?.column_default).toBe("true");
    expect(cols.get("enabled")?.is_nullable).toBe("NO");
    expect(cols.get("layout")?.data_type).toBe("jsonb");
    expect(cols.get("view")?.data_type).toBe("jsonb");
  });

  it("keeps one row per workspace and report", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexdef: string }>>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'ReportSetting'
    `;
    expect(indexes.some((row) => /UNIQUE.*\("companyId", "reportKey"\)/.test(row.indexdef))).toBe(true);
  });
});

describe("report settings", () => {
  it("saves a layout and a switch, and clears a layout back to the report's own", async () => {
    const layout = defaultLayout({ columns: [{ key: "stage", label: "Stage", kind: "status" }] });
    await saveReportSetting(companyId, "crm-deals", { layout }, "user-1");
    expect((await readReportSetting(companyId, "crm-deals"))?.layout).toEqual(layout);

    await saveReportSetting(companyId, "crm-deals", { enabled: false }, "user-1");
    const saved = await readReportSetting(companyId, "crm-deals");
    expect(saved?.enabled).toBe(false);
    // A switch leaves the layout alone.
    expect(saved?.layout).toEqual(layout);

    await saveReportSetting(companyId, "crm-deals", { layout: null }, "user-1");
    expect((await readReportSetting(companyId, "crm-deals"))?.layout).toBeNull();
  });

  it("keeps each workspace's settings its own", async () => {
    await saveReportSetting(companyId, "crm-leads", { enabled: false }, "user-1");
    expect(await disabledReportKeys(companyId)).toContain("crm-leads");
    expect(await disabledReportKeys(otherId)).not.toContain("crm-leads");
    expect((await readReportSettings(otherId)).size).toBe(0);
  });

  it("treats a stored layout that no longer parses as not saved", async () => {
    await prisma.reportSetting.create({
      data: { companyId, reportKey: "shift", layout: { blocks: [{ id: "x", type: "hologram" }] } },
    });
    const setting = await readReportSetting(companyId, "shift");
    expect(setting?.layout).toBeNull();
    expect(setting?.enabled).toBe(true);
  });
});
