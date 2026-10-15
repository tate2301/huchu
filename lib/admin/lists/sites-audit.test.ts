import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SignedInOperator } from "@/lib/operators/guards";
import { prisma } from "@/lib/prisma";
import type { ListPageResponse, ListQuery } from "@/lib/reports/types";

import { adminListPage } from "./engine";

/** A workspace's Sites and Audit log as lists, through the engine the page reads them by. */

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let billing: SignedInOperator;
let companyId: string;
const slug = `bindura-${run}`;

const query = (filters: Record<string, string>, tab?: string): ListQuery => ({ page: 1, size: 50, filters, ...(tab ? { tab } : {}) });

async function page(operator: SignedInOperator, key: string, q: ListQuery) {
  const answer = await adminListPage(operator, key, q);
  if ("error" in answer) throw new Error(answer.error);
  return answer as ListPageResponse;
}

beforeAll(async () => {
  const [a, b] = await Promise.all([
    prisma.operator.create({ data: { email: `lists-o-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } }),
    prisma.operator.create({ data: { email: `lists-b-${run}@corelith.test`, name: "Rumbi", role: "BILLING" } }),
  ]);
  owner = { sessionId: "o", id: a.id, email: a.email, name: a.name, role: a.role };
  billing = { sessionId: "b", id: b.id, email: b.email, name: b.name, role: b.role };
  companyId = (await prisma.company.create({ data: { name: `Bindura Gold ${run}`, slug, workspaceProfile: "GOLD_MINE" } })).id;
  await prisma.site.createMany({
    data: [
      { companyId, name: "Main Shaft", code: "SITE-0001", measurementUnit: "trips" },
      { companyId, name: "Old Pit", code: "SITE-0002", isActive: false },
    ],
  });
  await prisma.platformAuditEvent.createMany({
    data: [
      { companyId, eventType: "operator.workspace.suspended", actor: `operator:${a.id}`, reason: "Owner asked", eventHash: `l-${run}-1` },
      { companyId, eventType: "billing.payment.paid", actor: `operator:${b.id}`, payloadJson: JSON.stringify({ amount: "39.00" }), eventHash: `l-${run}-2` },
      { companyId, eventType: "auth.login.success", actor: `someone-${run}@x.test`, eventHash: `l-${run}-3` },
    ],
  });
});

afterAll(async () => {
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
  await prisma.operator.deleteMany({ where: { id: { in: [owner.id, billing.id] } } });
});

describe("a workspace's Sites", () => {
  it("lists only that workspace's sites, open on Open and closed on Closed, with a mine's unit", async () => {
    const open = await page(owner, "admin-sites", query({ w: slug }));
    expect(open.rows.map((row) => [row.name, row.code, row.state, row.unit])).toEqual([["Main Shaft", "SITE-0001", "Open", "trips"]]);
    expect(open.tabs).toMatchObject({ open: 1, closed: 1, all: 2 });
    const closed = await page(owner, "admin-sites", query({ w: slug }, "closed"));
    expect(closed.rows.map((row) => row.name)).toEqual(["Old Pit"]);
    expect((await page(owner, "admin-sites", query({}))).rows).toEqual([]);
  });

  it("offers Add site, Edit, Close and Reopen to a role that edits workspaces, and none to billing", async () => {
    const forOwner = await page(owner, "admin-sites", query({ w: slug }));
    expect(forOwner.report.list.primary?.label).toBe("Add site");
    expect(forOwner.report.list.rowMenu?.map((action) => action.key)).toEqual(["edit", "close", "reopen"]);
    const forBilling = await page(billing, "admin-sites", query({ w: slug }));
    expect(forBilling.report.list.primary).toBeNull();
    expect(forBilling.report.list.rowMenu ?? []).toEqual([]);
  });
});

describe("a workspace's Audit log", () => {
  it("keeps its tabs, and narrows by event and by operator", async () => {
    const everything = await page(owner, "admin-workspace-audit", query({ w: slug }));
    expect(everything.total).toBe(3);
    expect(everything.tabs).toMatchObject({ everything: 3, staff: 2, money: 1, "sign-ins": 1, "sign-in-as": 0 });
    const staff = await page(owner, "admin-workspace-audit", query({ w: slug }, "staff"));
    expect(staff.rows.map((row) => row.did).sort()).toEqual(["recorded $39.00 as paid", "suspended the workspace"]);
    const byEvent = await page(owner, "admin-workspace-audit", query({ w: slug, event: "operator.workspace.suspended" }));
    expect(byEvent.rows.map((row) => [row.who, row.reason])).toEqual([["Tafadzwa", "Owner asked"]]);
    const byOperator = await page(owner, "admin-workspace-audit", query({ w: slug, operator: billing.id }));
    expect(byOperator.rows.map((row) => row.who)).toEqual(["Rumbi"]);
  });

  it("finds a workspace's lines in everyone's log by the workspace filter", async () => {
    const all = await page(owner, "admin-audit", query({ workspace: slug }));
    expect(all.total).toBe(3);
    expect(all.rows.every((row) => row.workspaceSlug === slug)).toBe(true);
  });
});

describe("Payments and Operators", () => {
  it("read through the engine, with settling offered to billing and operators to owners only", async () => {
    const payments = await page(billing, "admin-payments", query({}));
    expect(payments.report.list.rowMenu?.map((action) => action.key)).toEqual(["billing", "paid", "failed"]);
    const operators = await page(owner, "admin-operators", query({}));
    expect(operators.rows.some((row) => row.id === billing.id && row.role === "Billing")).toBe(true);
    expect(await adminListPage(billing, "admin-operators", query({}))).toMatchObject({ status: 403 });
  });
});
