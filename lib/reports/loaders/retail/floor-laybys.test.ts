/**
 * Lay-bys (FLR-06) against a real Postgres, through the list engine: the tabs
 * part the lay-bys by status, the Σ band adds Total, Paid and Left over the
 * tab, and State narrows inside a tab by how the due day stands.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { prisma } from "@/lib/prisma";
import { fetchListPage } from "@/lib/reports/request";
import { addDays, todayIn } from "@/lib/workspace/format";

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let managerId: string;

const session = (id: string, role: string) =>
  ({ user: { id, companyId, role, enabledFeatures: ["retail.core", "retail.pos"] }, expires: "" }) as AuthenticatedSession;

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Laybys ${stamp}`, slug: `laybys-${stamp}` }, select: { id: true } })).id;
  managerId = (await prisma.user.create({ data: { email: `tafara-${stamp}@shop.test`, name: "Tafara Nyathi", role: "MANAGER", companyId }, select: { id: true } })).id;
  const siteId = (await prisma.site.create({ data: { companyId, code: `H-${stamp}`, name: "Harare Main Branch" }, select: { id: true } })).id;
  const locationId = (await prisma.stockLocation.create({ data: { siteId, code: `S-${stamp}`, name: "Shop floor" }, select: { id: true } })).id;
  const product = await prisma.product.create({ data: { companyId, code: `HEN-${stamp}`, name: "Hennessy VS 700ml, gift box" }, select: { id: true } });
  const item = await prisma.inventoryItem.create({
    data: { itemCode: `HEN-${stamp}`, name: "Hennessy", category: "OTHER", unit: "bottle", siteId, locationId, productId: product.id, currentStock: 10 },
    select: { id: true },
  });
  const customer = (name: string) => prisma.customer.create({ data: { companyId, name }, select: { id: true } });
  const today = todayIn();
  // [number, status, total, paid, due in days]: three paying (one due in 3 days, one overdue), one ready, two done.
  const rows: Array<[string, "PAYING" | "READY" | "COLLECTED" | "CANCELLED", string, string, number]> = [
    ["LAY-0031", "PAYING", "46.00", "20.00", 17],
    ["LAY-0030", "PAYING", "162.40", "100.00", 3],
    ["LAY-0027", "PAYING", "36.50", "10.00", -2],
    ["LAY-0028", "READY", "42.00", "42.00", 9],
    ["LAY-0026", "COLLECTED", "16.40", "16.40", -20],
    ["LAY-0019", "CANCELLED", "18.25", "5.00", -30],
  ];
  for (const [laybyNo, status, total, paid, due] of rows) {
    await prisma.retailLayby.create({
      data: {
        companyId,
        laybyNo,
        siteId,
        customerId: (await customer(`Customer ${laybyNo}`)).id,
        status,
        total,
        paid,
        dueOn: new Date(`${addDays(today, due)}T00:00:00.000Z`),
        createdById: managerId,
        lines: {
          create: {
            companyId,
            productId: product.id,
            inventoryItemId: item.id,
            itemName: "Hennessy VS 700ml, gift box",
            quantity: 1,
            unitPrice: total,
            lineTotal: total,
            taxAmount: 0,
            costUnit: 0,
          },
        },
      },
    });
  }
});

afterAll(async () => {
  await prisma.retailLayby.deleteMany({ where: { companyId } });
  await prisma.customer.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.product.deleteMany({ where: { companyId } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId } } });
  await prisma.site.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("the Lay-bys list", () => {
  it("parts the lay-bys by status: a ready one is only under Ready to collect", async () => {
    const page = await fetchListPage(session(managerId, "MANAGER"), "retail-laybys", { page: 1, size: 50, filters: {} });
    if ("error" in page) throw new Error(page.error);
    expect(page.tabs).toEqual({ paying: 3, ready: 1, done: 2, all: 6 });
    // Due soonest: the overdue one first.
    expect(page.rows.map((row) => [row.laybyNo, row.state])).toEqual([
      ["LAY-0027", "Overdue"],
      ["LAY-0030", "Due in 3 days"],
      ["LAY-0031", "Paying"],
    ]);
    const ready = await fetchListPage(session(managerId, "MANAGER"), "retail-laybys", { page: 1, size: 50, tab: "ready", filters: {} });
    if ("error" in ready) throw new Error(ready.error);
    expect(ready.rows.map((row) => [row.laybyNo, row.state, row.dueText])).toEqual([["LAY-0028", "Ready to collect", "Any time"]]);
  });

  it("adds up Total, Paid and Left over the tab", async () => {
    const page = await fetchListPage(session(managerId, "MANAGER"), "retail-laybys", { page: 1, size: 50, filters: {} });
    if ("error" in page) throw new Error(page.error);
    expect(page.totals).toMatchObject({ total: 244.9, paid: 130, left: 114.9 });
  });

  it("narrows by State inside the tab", async () => {
    const soon = await fetchListPage(session(managerId, "MANAGER"), "retail-laybys", { page: 1, size: 50, filters: { state: "soon" } });
    if ("error" in soon) throw new Error(soon.error);
    expect(soon.rows.map((row) => row.laybyNo)).toEqual(["LAY-0030"]);
    const overdue = await fetchListPage(session(managerId, "MANAGER"), "retail-laybys", { page: 1, size: 50, tab: "done", filters: { state: "overdue" } });
    if ("error" in overdue) throw new Error(overdue.error);
    expect(overdue.rows).toEqual([]);
  });

  it("is refused to a stock clerk", async () => {
    const page = await fetchListPage(session(managerId, "STOCK_CLERK"), "retail-laybys", { page: 1, size: 50, filters: {} });
    expect(page).toMatchObject({ error: "Your role cannot view lay-bys" });
  });
});
