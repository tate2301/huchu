/**
 * The built-in custom reports: every one is a document the editor accepts,
 * reads only reports that exist, runs in Postgres, and is offered to every
 * kind of business — each its own first, and only to whoever may read it.
 */
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { CLIENT_BUNDLE_TEMPLATES, getClientTemplateDisabledFeatureKeys, getClientTemplateFeatureKeys } from "@/lib/platform/client-templates";
import { canReadReport } from "@/lib/reports/access";
import { customDocumentSchema } from "@/lib/reports/custom/document";
import { checkBlocks } from "@/lib/reports/custom/run";
import { CUSTOM_TEMPLATES, templateReads, templatesFor } from "@/lib/reports/custom/templates";
import { REPORT_DEFINITIONS } from "@/lib/reports/registry";
import { ReportDatabase } from "@/lib/reports/sql/engine";
import { sourceTable } from "@/lib/reports/sql/schema";
import { getWorkspaceProfileForTemplate } from "@/lib/workspaces";

const tables = REPORT_DEFINITIONS.map((definition) => sourceTable(definition));

describe("every built-in custom report", () => {
  it("has its own key", () => {
    const keys = CUSTOM_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(CUSTOM_TEMPLATES.map((template) => [template.key, template] as const))("%s is a document the editor accepts, over reports that exist", (_, template) => {
    expect(customDocumentSchema.safeParse(template.document).success).toBe(true);
    for (const [block, check] of checkBlocks(template.document.blocks, tables)) {
      expect(check.ok ? null : `${block}: ${check.problem.message}`).toBeNull();
    }
    expect(templateReads().get(template.key)?.length).toBeGreaterThan(0);
  });
});

describe("a breakdown in a built-in", () => {
  it("reads plain rows: it counts and totals them itself, so grouped rows would all count one", () => {
    for (const template of CUSTOM_TEMPLATES) {
      for (const block of template.document.blocks) {
        if (block.type === "query" && block.display.type === "breakdown") expect(block.query, `${template.key} @${block.name}`).not.toMatch(/group by/i);
      }
    }
  });
});

describe("in Postgres", () => {
  let db: ReportDatabase;
  beforeAll(async () => {
    db = new ReportDatabase(await PGlite.create());
    // Empty: what is checked is that each query runs, not what it finds.
    for (const table of tables) await db.load(table, [], "v1");
  });

  it.each(CUSTOM_TEMPLATES.map((template) => [template.key, template] as const))("%s runs", async (_, template) => {
    const checks = checkBlocks(template.document.blocks, tables);
    for (const check of checks.values()) {
      if (!check.ok) throw new Error(check.problem.message);
      const ran = await db.run(check.checked.body, { from: "2026-01-01", to: "2026-12-31" });
      expect(ran.ok ? null : ran.error.message).toBeNull();
    }
  });
});

describe("offered to every business", () => {
  const offered = (code: string, role: string, profile: string | null = getWorkspaceProfileForTemplate(code)) => {
    const disabled = new Set(getClientTemplateDisabledFeatureKeys(code));
    const enabledFeatures = getClientTemplateFeatureKeys(code).filter((key) => !disabled.has(key));
    const readable = REPORT_DEFINITIONS.filter((definition) => canReadReport(definition, { role, enabledFeatures }));
    return { list: templatesFor(readable, { id: "u", role }, profile) };
  };

  it.each([
    ["TEMPLATE_GOLD_MINE", "GOLD_MINE"],
    ["TEMPLATE_SCHOOLS", "SCHOOLS"],
    ["TEMPLATE_RETAIL", "RETAIL"],
    ["TEMPLATE_CRM", "GENERAL"],
    ["TEMPLATE_PAYROLL_BUREAU", "PAYROLL"],
    // A sales desk's profile is GENERAL: it is set, not inferred, so it is passed as a session carries it.
  ])("%s gets its own business's first", (code, profile) => {
    const { list } = offered(code, "MANAGER", profile);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.profiles).toContain(profile);
  });

  it("offers every provisioning template something", () => {
    for (const template of CLIENT_BUNDLE_TEMPLATES) expect(offered(template.code, "SUPERADMIN").list.length, template.code).toBeGreaterThan(0);
  });

  it("keeps a managers' report from someone who is not one, and a report from someone who cannot read its sources", () => {
    const manager = offered("TEMPLATE_SCHOOLS", "SCHOOL_ADMIN").list.map((template) => template.key);
    const teacher = offered("TEMPLATE_SCHOOLS", "TEACHER").list.map((template) => template.key);
    expect(manager).toContain("school-fees-owed");
    expect(teacher).not.toContain("school-fees-owed");
    expect(offered("TEMPLATE_SCHOOLS", "SUPERADMIN").list.map((template) => template.key)).not.toContain("mine-production-week");
  });
});
