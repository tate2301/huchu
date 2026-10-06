/**
 * Migration witness for `20261006170000_report_template_uses` (INS-07).
 *
 * How often a Reports template is opened in a workspace: one row per template
 * per company, built in ("builtin:<slug>") or saved (its id, with the template
 * it counts). The row goes with its company and with a saved template; whoever
 * opened it last may leave, and the row stays without them.
 */

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

type ColumnFacts = { column_name: string; data_type: string; is_nullable: string; column_default: string | null };

const made: { companyId?: string } = {};

afterAll(async () => {
  if (made.companyId) await prisma.company.delete({ where: { id: made.companyId } }).catch(() => undefined);
});

describe("report template uses, as stored", () => {
  it("has the columns Last opened is read from", async () => {
    const rows = await prisma.$queryRaw<ColumnFacts[]>`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'ReportTemplateUse'`;
    const facts = Object.fromEntries(rows.map((row) => [row.column_name, row]));
    expect(Object.keys(facts).sort()).toEqual(
      ["companyId", "id", "lastOpenedAt", "lastOpenedById", "opens", "templateId", "templateRef"].sort(),
    );
    expect(facts.templateRef).toMatchObject({ data_type: "text", is_nullable: "NO" });
    expect(facts.templateId).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(facts.opens).toMatchObject({ data_type: "integer", is_nullable: "NO", column_default: "0" });
    expect(facts.lastOpenedAt).toMatchObject({ data_type: "timestamp without time zone", is_nullable: "NO" });
    expect(facts.lastOpenedById).toMatchObject({ data_type: "text", is_nullable: "YES" });
  });

  it("keeps one row per template per company, and finds a saved template's row", async () => {
    const indexes = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
      SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ReportTemplateUse'`;
    const byName = Object.fromEntries(indexes.map((row) => [row.indexname, row.indexdef]));
    expect(byName.ReportTemplateUse_companyId_templateRef_key).toContain(
      'CREATE UNIQUE INDEX "ReportTemplateUse_companyId_templateRef_key" ON public."ReportTemplateUse" USING btree ("companyId", "templateRef")',
    );
    expect(byName.ReportTemplateUse_templateId_idx).toContain('USING btree ("templateId")');
  });

  it("goes with its company and its template; outlives whoever opened it last", async () => {
    const rows = await prisma.$queryRaw<Array<{ column: string; on_delete: string }>>`
      SELECT kcu.column_name AS column, rc.delete_rule AS on_delete
      FROM information_schema.referential_constraints rc
      JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
      WHERE kcu.table_name = 'ReportTemplateUse'
      ORDER BY kcu.column_name`;
    expect(rows).toEqual([
      { column: "companyId", on_delete: "CASCADE" },
      { column: "lastOpenedById", on_delete: "SET NULL" },
      { column: "templateId", on_delete: "CASCADE" },
    ]);
  });

  it("deleting a template deletes its use row; deleting the opener keeps it", async () => {
    const suffix = randomUUID().slice(0, 8);
    const company = await prisma.company.create({ data: { name: `Uses witness ${suffix}`, slug: `uses-witness-${suffix}` } });
    made.companyId = company.id;
    const [maker, opener] = await Promise.all(
      ["maker", "opener"].map((who) =>
        prisma.user.create({
          data: { companyId: company.id, name: `${who} ${suffix}`, email: `${who}-${suffix}@uses.test`, password: "x", role: "MANAGER" },
        }),
      ),
    );
    const template = await prisma.reportTemplate.create({
      data: { companyId: company.id, reportKey: "retail-shifts", name: "Mine", view: {}, createdById: maker!.id },
    });
    const now = new Date();
    await prisma.reportTemplateUse.createMany({
      data: [
        { companyId: company.id, templateRef: template.id, templateId: template.id, opens: 3, lastOpenedAt: now, lastOpenedById: opener!.id },
        { companyId: company.id, templateRef: "builtin:stock-on-hand", opens: 1, lastOpenedAt: now, lastOpenedById: opener!.id },
      ],
    });
    await expect(
      prisma.reportTemplateUse.create({
        data: { companyId: company.id, templateRef: "builtin:stock-on-hand", lastOpenedAt: now },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: opener!.id } });
    const builtIn = await prisma.reportTemplateUse.findUnique({
      where: { companyId_templateRef: { companyId: company.id, templateRef: "builtin:stock-on-hand" } },
    });
    expect(builtIn).toMatchObject({ opens: 1, lastOpenedById: null });

    await prisma.reportTemplate.delete({ where: { id: template.id } });
    expect(await prisma.reportTemplateUse.count({ where: { companyId: company.id } })).toBe(1);
  });
});
