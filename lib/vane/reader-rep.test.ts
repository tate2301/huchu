/**
 * A sales rep's reading (the PageVanePhone board), signed in as the reader
 * roles: Vane reads a rep's own leads and the quotes on them, not another
 * rep's, and nothing outside the CRM tables a visit and its quote need. With
 * no rep, the same reader reads the whole workspace as before.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { readWorkspace, tablesFor } from "./reader";
import { useTestReaderLogins } from "./test-reader-logins";

const suffix = randomUUID().slice(0, 8);
const made = { company: "", rudo: "", kuda: "" };

beforeAll(async () => {
  await useTestReaderLogins();
  const company = await prisma.company.create({ data: { name: `Vane rep ${suffix}`, slug: `vane-rep-${suffix}` } });
  const rep = (name: string) =>
    prisma.user.create({ data: { email: `${name.toLowerCase()}-${suffix}@rep.test`, name, role: "SALES_REP", companyId: company.id }, select: { id: true } });
  const [rudo, kuda] = [await rep("Rudo"), await rep("Kuda")];
  for (const [who, title] of [
    [rudo.id, "Pomona Offices"],
    [kuda.id, "Mrs Gumbo"],
  ] as const) {
    const lead = await prisma.crmLead.create({ data: { companyId: company.id, leadNo: `L-${title.slice(0, 3)}-${suffix}`, title, assignedToId: who } });
    await prisma.crmLeadDocument.create({ data: { companyId: company.id, type: "QUOTATION", amount: title === "Pomona Offices" ? 8930 : 1200, leadId: lead.id } });
  }
  Object.assign(made, { company: company.id, rudo: rudo.id, kuda: kuda.id });
});

afterAll(async () => {
  await prisma.crmLeadDocument.deleteMany({ where: { companyId: made.company } });
  await prisma.crmLead.deleteMany({ where: { companyId: made.company } });
  await prisma.user.deleteMany({ where: { companyId: made.company } });
  await prisma.company.deleteMany({ where: { id: made.company } });
});

describe("a sales rep's reading", () => {
  it("reads the rep's own leads and the quotes on them, not another rep's", async () => {
    const leads = await readWorkspace(made.company, `SELECT "title" FROM "CrmLead" ORDER BY "title"`, { rep: made.rudo });
    expect(leads.rows).toEqual([{ title: "Pomona Offices" }]);
    const quotes = await readWorkspace(made.company, `SELECT "amount" FROM "CrmLeadDocument"`, { rep: made.rudo });
    expect(quotes.rows).toEqual([{ amount: 8930 }]);
  });

  it("reads nothing outside the CRM tables a visit and its quote need", async () => {
    const tables = await tablesFor(made.company, { rep: made.rudo });
    expect(tables.has("crmlead")).toBe(true);
    expect(tables.has("salesinvoice")).toBe(false);
    expect(tables.has("employee")).toBe(false);
    expect(tables.has("vanereaderscope")).toBe(false);
    for (const question of [`SELECT "id" FROM "SalesInvoice"`, `SELECT "name" FROM "Employee"`, `SELECT "id" FROM "Company"`]) {
      await expect(readWorkspace(made.company, question, { rep: made.rudo }), question).rejects.toMatchObject({ code: "refused" });
    }
  });

  it("reads the whole workspace when no rep is reading", async () => {
    const leads = await readWorkspace(made.company, `SELECT "title" FROM "CrmLead" ORDER BY "title"`);
    expect(leads.rows).toEqual([{ title: "Mrs Gumbo" }, { title: "Pomona Offices" }]);
    expect(await prisma.vaneReaderScope.count({ where: { companyId: made.company } })).toBe(0);
  });
});
