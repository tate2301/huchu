/**
 * Reports' list mode through the real handlers and a real database: report
 * faces and built-in templates, who is refused a template, report mode closed
 * for list and report sources, and an export of a rolled-up template that is
 * the table on screen. Only the session is mocked.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import type { UserRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

const { validateSessionMock } = vi.hoisted(() => ({ validateSessionMock: vi.fn() }));

vi.mock("@/lib/api-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-utils")>();
  return { ...actual, validateSession: validateSessionMock };
});

const { GET } = await import("./route");
const { POST } = await import("./export/route");

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
const people: Record<string, string> = {};

function signIn(role: string) {
  validateSessionMock.mockResolvedValue({
    session: {
      user: { id: people[role]!, companyId, role, name: role, email: `${role}@reports.test`, enabledFeatures: ["retail.core"] },
    },
  });
}

async function get(key: string, query: string) {
  const response = await GET(new NextRequest(`http://shop.test/api/v2/reports/${key}?${query}`), { params: Promise.resolve({ key }) });
  return { status: response.status, body: await response.json() };
}

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Reports ${stamp}`, slug: `reports-${stamp}` }, select: { id: true } })).id;
  for (const role of ["SUPERADMIN", "CASHIER", "STOCK_CLERK", "FINANCE_OFFICER"] as UserRole[]) {
    people[role] = (
      await prisma.user.create({ data: { email: `${role.toLowerCase()}-${stamp}@reports.test`, name: role, role, companyId }, select: { id: true } })
    ).id;
  }
  people.OTHER_CASHIER = (
    await prisma.user.create({ data: { email: `farai-${stamp}@reports.test`, name: "Farai Moyo", role: "CASHIER", companyId }, select: { id: true } })
  ).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  const registerId = (await prisma.retailRegister.create({ data: { companyId, code: `T1-${stamp}`, name: "Front till", siteId }, select: { id: true } })).id;
  const locationId = (await prisma.stockLocation.create({ data: { siteId, code: `F-${stamp}`, name: "Shop floor" }, select: { id: true } })).id;
  const productId = (await prisma.product.create({ data: { companyId, code: `CASTLE-${stamp}`, name: "Castle Lager 340ml" }, select: { id: true } })).id;
  const inventoryItemId = (
    await prisma.inventoryItem.create({
      data: { itemCode: `CASTLE-${stamp}`, name: "Castle", category: "OTHER", unit: "bottle", siteId, locationId, productId },
      select: { id: true },
    })
  ).id;
  const at = new Date(Date.now() - 86_400_000);
  for (const [index, [cashierId, cashierName, total]] of ([
    [people.CASHIER!, "Chipo Dube", 3],
    [people.OTHER_CASHIER!, "Farai Moyo", 7],
    [people.CASHIER!, "Chipo Dube", 5],
  ] as const).entries()) {
    await prisma.retailSale.create({
      data: {
        companyId,
        saleNo: `S-${index}-${stamp}`,
        siteId,
        registerId,
        cashierId,
        cashierName,
        postedAt: at,
        totalAmount: total,
        baseAmount: total,
        lines: { create: [{ companyId, inventoryItemId, productId, itemName: "Castle Lager 340ml", quantity: 1, unitPrice: total, lineTotal: total, costTotal: 1 }] },
        payments: { create: [{ companyId, tenderType: index === 1 ? "ECOCASH" : "CASH", amount: total, baseAmount: total }] },
      },
    });
  }
});

afterAll(async () => {
  await prisma.retailSale.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.retailRegister.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.delete({ where: { id: companyId } });
});

describe("report faces and templates", () => {
  it("closes report mode for list and report sources", async () => {
    signIn("SUPERADMIN");
    expect(await get("retail-stock-on-hand", "")).toMatchObject({ status: 404, body: { error: "Report not found" } });
    expect(await get("retail-payments", "")).toMatchObject({ status: 404, body: { error: "Report not found" } });
  });

  it("answers Report not found for a face the source has not got", async () => {
    signIn("SUPERADMIN");
    expect(await get("retail-tills", "page=1&face=report")).toMatchObject({ status: 404, body: { error: "Report not found" } });
    expect(await get("retail-items-sold", "page=1")).toMatchObject({ status: 404, body: { error: "Report not found" } });
  });

  it("answers Template not found for no such template, or one on another source", async () => {
    signIn("SUPERADMIN");
    expect(await get("retail-items-sold", "page=1&face=report&template=nope")).toMatchObject({ status: 404, body: { error: "Template not found" } });
    expect(await get("retail-payments", "page=1&face=report&template=items-sold")).toMatchObject({ status: 404, body: { error: "Template not found" } });
  });

  it("refuses a template to the cashier and the stock clerk, who have no Reports", async () => {
    signIn("CASHIER");
    expect(await get("retail-items-sold", "page=1&size=50&face=report&template=items-sold")).toMatchObject({
      status: 404,
      body: { error: "Template not found" },
    });
    signIn("STOCK_CLERK");
    expect(await get("retail-stock-on-hand", "page=1&face=report&template=stock-on-hand")).toMatchObject({
      status: 404,
      body: { error: "Template not found" },
    });
  });

  it("gives the cashier their own lines on the face itself", async () => {
    signIn("CASHIER");
    const { status, body } = await get("retail-items-sold", "page=1&size=50&face=report");
    expect(status).toBe(200);
    expect(body.rows.map((row: { cashierId: string }) => row.cashierId)).toEqual([people.CASHIER, people.CASHIER]);
    expect(body.totals.revenue).toBe(8);
    expect(body.report.list.columns.some((column: { key: string }) => column.key === "cost")).toBe(false);
  });

  it("opens Items sold for the owner with the template's columns, in order", async () => {
    signIn("SUPERADMIN");
    const { status, body } = await get("retail-items-sold", "page=1&size=50&face=report&template=items-sold");
    expect(status).toBe(200);
    const shown = body.report.list.columns.filter((column: { key: string }) => !body.query.hidden.includes(column.key));
    expect(shown.map((column: { label: string }) => column.label)).toEqual(["Item", "Date", "Quantity", "Price", "Revenue", "Cost", "Margin"]);
    expect(body.query).toMatchObject({ face: "report", template: "items-sold", filters: { when: "30d" } });
    expect(body.totals.revenue).toBe(15);
  });

  it("opens Takings by payment rolled up by day and till for the bookkeeper", async () => {
    signIn("FINANCE_OFFICER");
    const { status, body } = await get("retail-payments", "page=1&size=50&face=report&template=takings-by-payment");
    expect(status).toBe(200);
    expect(body.query.rows).toEqual(["day", "till"]);
    expect(body.total).toBe(1);
    expect(body.rows[0]).toMatchObject({ till: "Front till", cash: 8, ecocash: 7, taken: 15, payments: 3 });
    expect(body.groups).toHaveLength(1);
    const shown = body.report.list.columns.filter((column: { key: string }) => !body.query.hidden.includes(column.key));
    expect(shown.map((column: { label: string }) => column.label)).toEqual(["Day", "Till", "Cash", "EcoCash", "Card", "ZiG", "On account", "Other", "Taken"]);
  });

  it("exports a rolled-up template as the table on screen", async () => {
    signIn("SUPERADMIN");
    const response = await POST(
      new NextRequest("http://shop.test/api/v2/reports/retail-payments/export", {
        method: "POST",
        body: JSON.stringify({ format: "csv", query: { face: "report", template: "takings-by-payment", page: 1, size: 50, filters: {} } }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ key: "retail-payments" }) },
    );
    expect(response.status).toBe(200);
    const csv = (await response.text()).trim().split("\n");
    expect(csv[0]).toBe("Day,Till,Cash,EcoCash,Card,ZiG,On account,Other,Taken");
    expect(csv[1]).toMatch(/,Front till,8,7,0,0,0,0,15$/);
  });
});
