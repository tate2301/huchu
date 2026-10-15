/**
 * A work order Vane drafts from breakdowns (the PageVaneMine board), against
 * the test database, through the `draft` tool: it is Vane's, nobody is its
 * maker, the workshop does not see it as open; its page reads the
 * equipment's history and the parts against stores; a person raises it, after
 * which it is not Vane's to delete; another draft is deleted.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";
import { callTool } from "@/lib/vane/tools";

import { readWorkOrderRecord } from "./work-order-record";
import { deleteVaneDraftWorkOrder, raiseWorkOrder, WorkOrderRefused } from "./work-orders";

let shop: TestShop;
const ids = { pump: "", seal: "", impeller: "", chari: "" };

beforeAll(async () => {
  shop = await makeTestShop("Vane work orders");
  const location = await prisma.stockLocation.findFirstOrThrow({ where: { siteId: shop.mainId }, select: { id: true } });
  const pump = await prisma.equipment.create({
    data: { equipmentCode: "P-104", name: "Mill 1 feed pump", category: "PUMP", siteId: shop.mainId, locationId: location.id },
  });
  const item = (name: string, code: string, onHand: number) =>
    prisma.inventoryItem.create({
      data: { itemCode: code, name, category: "SPARES", unit: "pieces", siteId: shop.mainId, locationId: location.id, currentStock: onHand },
      select: { id: true },
    });
  const seal = await item("Pump seal kit, 80 mm", "SK-80", 4);
  const impeller = await item("Impeller, 80 mm", "IM-80", 0);
  const chari = await prisma.employee.create({
    data: { companyId: shop.companyId, employeeId: `E-${pump.id.slice(0, 6)}`, name: "Mr Chari", phone: "", nextOfKinName: "", nextOfKinPhone: "", passportPhotoUrl: "", villageOfOrigin: "" },
  });
  // Two seals replaced already.
  for (const [start, end] of [
    ["2026-09-29T06:00:00Z", "2026-09-29T11:00:00Z"],
    ["2026-10-08T06:00:00Z", "2026-10-08T12:00:00Z"],
  ] as const) {
    await prisma.workOrder.create({
      data: { companyId: shop.companyId, equipmentId: pump.id, issue: "Feed pump seal", downtimeStart: new Date(start), downtimeEnd: new Date(end), workDone: "Seal replaced from stores", status: "COMPLETED" },
    });
  }
  Object.assign(ids, { pump: pump.id, seal: seal.id, impeller: impeller.id, chari: chari.id });
});

afterAll(async () => {
  if (!shop) return;
  const companyId = shop.companyId;
  await prisma.notification.deleteMany({ where: { companyId } });
  await prisma.workOrder.deleteMany({ where: { companyId } });
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId } } });
  await prisma.equipment.deleteMany({ where: { site: { companyId } } });
  await prisma.employee.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

const draft = async () => {
  const drafted = await callTool({ companyId: shop.companyId, jobId: null }, "draft", {
    kind: "work_order",
    equipmentId: ids.pump,
    issue: "Rebuild the Mill 1 feed pump, not the seal again",
    note: "The seal failed 3 times in 30 days; 11 hours lost since 14 September.",
    priority: "HIGH",
    technicianId: ids.chari,
    parts: [
      { name: "Pump seal kit, 80 mm", itemId: ids.seal, quantity: 1 },
      { name: "Impeller, 80 mm", itemId: ids.impeller, quantity: 1 },
    ],
  });
  expect(drafted.ok).toBe(true);
  return JSON.parse(drafted.content).workOrderId as string;
};

describe("a work order Vane drafts", () => {
  it("is Vane's draft, with nobody as its maker, and reads the history and the parts against stores", async () => {
    const id = await draft();
    expect(await prisma.workOrder.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DRAFT", madeByVane: true, createdById: null, priority: "HIGH", companyId: shop.companyId });

    const record = await readWorkOrderRecord(prisma, shop.companyId, id);
    expect(record).toMatchObject({
      status: "DRAFT",
      madeByVane: true,
      issue: "Rebuild the Mill 1 feed pump, not the seal again",
      note: "The seal failed 3 times in 30 days; 11 hours lost since 14 September.",
      equipment: { label: "Mill 1 feed pump, P-104", site: "Harare Main Branch" },
      technician: { id: ids.chari, name: "Mr Chari" },
    });
    expect(record!.history.map((row) => [row.date, row.hours])).toEqual([
      ["8 Oct", 6],
      ["29 Sept", 5],
    ]);
    expect(record!.parts).toEqual([
      { name: "Pump seal kit, 80 mm", needed: 1, onHand: 4, unit: "pieces" },
      { name: "Impeller, 80 mm", needed: 1, onHand: 0, unit: "pieces" },
    ]);
  });

  it("is raised by a person, once, and then is not Vane's to delete", async () => {
    const id = await draft();
    const raised = await raiseWorkOrder({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" }, id);
    expect(raised.status).toBe("OPEN");
    await expect(raiseWorkOrder({ companyId: shop.companyId, userId: shop.managerId, role: "MANAGER" }, id)).rejects.toThrow("raised already");
    await expect(deleteVaneDraftWorkOrder(shop.companyId, id)).rejects.toBeInstanceOf(WorkOrderRefused);
  });

  it("is deleted while it is a draft", async () => {
    const id = await draft();
    await deleteVaneDraftWorkOrder(shop.companyId, id);
    expect(await prisma.workOrder.findUnique({ where: { id } })).toBeNull();
  });

  it("is refused for equipment or parts not in the workspace, and in a sales rep's chat", async () => {
    const elsewhere = await callTool({ companyId: shop.companyId, jobId: null }, "draft", { kind: "work_order", equipmentId: "nope", issue: "x", note: "x" });
    expect(elsewhere).toMatchObject({ ok: false, content: expect.stringContaining("no such equipment") });
    const rep = await callTool({ companyId: shop.companyId, jobId: null, rep: shop.managerId }, "draft", { kind: "work_order", equipmentId: ids.pump, issue: "x", note: "x" });
    expect(rep).toMatchObject({ ok: false, content: expect.stringContaining("sales rep") });
  });
});
