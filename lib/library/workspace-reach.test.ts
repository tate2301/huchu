import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import { getReportDefinition } from "@/lib/reports/registry";

import { libraryExploreTemplates } from "./explore";
import { previewSession } from "./preview";
import { libraryReportTemplates, offeredTemplate, offeredTemplates } from "./reports";
import { createLibraryItem, publishLibraryItem, retireLibraryItem } from "./store";

const run = randomUUID().slice(0, 8);
let operator: SignedInOperator;
let shop: { id: string };
let empty: { id: string };

const report = (sql: string) => ({
  period: { from: "monthStart", to: "today" },
  blocks: [{ id: "q1", type: "query", name: "waiting", query: sql, display: { type: "table" } }],
});

const session = (companyId: string): AuthenticatedSession =>
  ({ expires: "", user: { id: `user-${run}`, role: "SUPERADMIN", companyId, workspaceProfile: "CRM" } }) as AuthenticatedSession;

const crm = [getReportDefinition("crm-quotes")!, getReportDefinition("crm-deals")!];

beforeAll(async () => {
  const made = await prisma.operator.create({ data: { email: `libreach-${run}@corelith.test`, name: "Rudo", role: "OWNER" } });
  operator = { sessionId: "s", id: made.id, email: made.email, name: made.name, role: made.role };
  shop = await prisma.company.create({ data: { name: `Floors ${run}`, slug: `floors-${run}` } });
  empty = await prisma.company.create({ data: { name: `Empty ${run}`, slug: `empty-${run}` } });
  await prisma.user.create({ data: { name: "Tendai", email: `tendai-${run}@x.test`, role: "SUPERADMIN", companyId: shop.id } });
});

afterAll(async () => {
  const items = await prisma.libraryItem.findMany({ where: { createdById: operator.id }, select: { id: true } });
  await prisma.libraryItem.deleteMany({ where: { createdById: operator.id } });
  await prisma.platformAuditEvent.deleteMany({ where: { entityType: "library_item", entityId: { in: items.map((item) => item.id) } } });
  await prisma.user.deleteMany({ where: { companyId: { in: [shop.id, empty.id] } } });
  await prisma.company.deleteMany({ where: { id: { in: [shop.id, empty.id] } } });
  await prisma.operator.deleteMany({ where: { id: operator.id } });
});

describe("a library report, in a workspace", () => {
  it("is offered after the ones in code, only to someone who reads every source it reads, and opens by its address", async () => {
    const item = await createLibraryItem(operator, { kind: "REPORT", title: `Waiting quotes ${run}`, summary: "Quotes with no answer", payload: report("select * from crm_quotes") });
    const onPay = await createLibraryItem(operator, { kind: "REPORT", title: `Pay ${run}`, payload: report("select * from payroll_pay") });
    expect(await libraryReportTemplates(shop.id)).not.toContainEqual(expect.objectContaining({ key: item.key }));

    await publishLibraryItem(operator, item.id, { audience: "WORKSPACES", companyIds: [shop.id] });
    await publishLibraryItem(operator, onPay.id, { audience: "WORKSPACES", companyIds: [shop.id] });
    const offered = await offeredTemplates(session(shop.id), crm);
    const mine = offered.find((template) => template.key === item.key);
    expect(mine).toMatchObject({ title: `Waiting quotes ${run}`, description: "Quotes with no answer", reads: ["crm-quotes"], fromLibrary: true });
    expect(offered.indexOf(mine!)).toBe(offered.length - 1);
    // Payroll is not among what this person reads.
    expect(offered.some((template) => template.key === onPay.key)).toBe(false);

    expect((await offeredTemplate(session(shop.id), crm, item.key))?.document.blocks).toHaveLength(1);
    expect((await offeredTemplate(session(shop.id), crm, `library:${item.key}`))?.key).toBe(item.key);
    // Not published to it, not offered to it.
    expect(await offeredTemplate(session(empty.id), crm, item.key)).toBeNull();

    await retireLibraryItem(operator, { id: item.id, status: "PUBLISHED" });
    expect(await offeredTemplate(session(shop.id), crm, item.key)).toBeNull();
  });

  it("does not take the address of one in code", async () => {
    const twin = await createLibraryItem(operator, { kind: "REPORT", title: "Twin", key: "mine-production-week", payload: report("select * from crm_quotes") });
    await publishLibraryItem(operator, twin.id, { audience: "WORKSPACES", companyIds: [shop.id] });
    expect((await libraryReportTemplates(shop.id)).some((template) => template.key === "mine-production-week")).toBe(false);
  });
});

describe("a library Explore question, in a workspace", () => {
  it("joins the templates by Corelith, over the tables the person reads", async () => {
    const item = await createLibraryItem(operator, {
      kind: "EXPLORE",
      title: `Big quotes ${run}`,
      payload: { answers: "Which quotes are biggest", product: "crm", noun: "quotes", sql: "select number, total from crm_quotes order by total desc" },
    });
    await publishLibraryItem(operator, item.id, { audience: "EVERYONE" });
    const found = (await libraryExploreTemplates(shop.id, new Set(["crm_quotes"]))).find((template) => template.slug === item.key);
    expect(found).toMatchObject({ title: `Big quotes ${run}`, madeBy: "Corelith", product: "crm", noun: "quotes", reads: ["crm_quotes"] });
    expect((await libraryExploreTemplates(shop.id, new Set(["crm_deals"]))).some((template) => template.slug === item.key)).toBe(false);
  });
});

describe("previewing on a workspace", () => {
  it("reads it as its owner, and refuses one with no owner", async () => {
    const as = await previewSession(shop.id);
    expect(as.user).toMatchObject({ companyId: shop.id, role: "SUPERADMIN", name: "Tendai" });
    await expect(previewSession(empty.id)).rejects.toThrow(/no owner/);
  });
});
