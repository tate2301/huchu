/**
 * The stores and maintenance arm, against a real Postgres.
 *
 * This is the arm that needed a database test most. `InventoryItem`,
 * `Equipment` and `WorkOrder` carry **no `companyId`** — they are scoped through
 * `Site`, and a work order through `Equipment` to `Site`, two hops. A `where`
 * that dropped the site relation would compile, would return rows, and would
 * look completely normal on the screen: a stock list with somebody else's spares
 * in it reads exactly like a stock list. So each arm gets a same-named record on
 * a second tenant, and every case here would fail if the scoping came off.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@corelithzw/db/client";

import { searchOperations } from "./search";

type Tenant = { companyId: string; siteId: string; locationId: string };

let mine: Tenant;
let rival: Tenant;
let pumpId: string;
let workOrderId: string;

async function makeTenant(stamp: string, label: string): Promise<Tenant> {
  const company = await prisma.company.create({
    data: { name: `${label} ${stamp}`, slug: `${label}-${stamp}` },
    select: { id: true },
  });
  const site = await prisma.site.create({
    data: { companyId: company.id, name: `${label} yard`, code: `Y-${stamp}` },
    select: { id: true },
  });
  const location = await prisma.stockLocation.create({
    data: { siteId: site.id, code: `BAY-${stamp}`, name: "Bay 3" },
    select: { id: true },
  });
  return { companyId: company.id, siteId: site.id, locationId: location.id };
}

/** The same three records on both tenants, so nothing here passes by accident. */
async function makePlant(tenant: Tenant, stamp: string) {
  await prisma.inventoryItem.create({
    data: {
      siteId: tenant.siteId,
      locationId: tenant.locationId,
      itemCode: `OIL-${stamp}`,
      name: "Engine oil 15W40",
      category: "CONSUMABLES",
      unit: "litres",
      currentStock: 12,
      minStock: 40,
    },
  });
  const pump = await prisma.equipment.create({
    data: {
      siteId: tenant.siteId,
      locationId: tenant.locationId,
      equipmentCode: `PMP-${stamp}`,
      name: "Slurry pump 40kW",
      category: "PUMP",
      qrCode: `QR-${stamp}-${tenant.companyId.slice(0, 8)}`,
      nextServiceDue: new Date("2026-09-01T00:00:00Z"),
    },
    select: { id: true },
  });
  const workOrder = await prisma.workOrder.create({
    data: {
      equipmentId: pump.id,
      issue: "Impeller seal weeping under load",
      downtimeStart: new Date("2026-08-01T06:00:00Z"),
    },
    select: { id: true },
  });
  return { pumpId: pump.id, workOrderId: workOrder.id };
}

beforeAll(async () => {
  const stamp = String(Date.now());
  mine = await makeTenant(stamp, "ops-search");
  rival = await makeTenant(`${stamp}b`, "ops-rival");

  const own = await makePlant(mine, stamp);
  pumpId = own.pumpId;
  workOrderId = own.workOrderId;
  // Identical plant next door. Same item name, same category, same fault text.
  await makePlant(rival, `${stamp}b`);
});

afterAll(async () => {
  const sites = { in: [mine.siteId, rival.siteId] };
  await prisma.workOrder.deleteMany({ where: { equipment: { siteId: sites } } });
  await prisma.equipment.deleteMany({ where: { siteId: sites } });
  await prisma.inventoryItem.deleteMany({ where: { siteId: sites } });
  await prisma.stockLocation.deleteMany({ where: { siteId: sites } });
  await prisma.site.deleteMany({ where: { id: sites } });
  await prisma.company.deleteMany({
    where: { id: { in: [mine.companyId, rival.companyId] } },
  });
});

describe("searchOperations", () => {
  it("finds a stock item by name and says it is short", async () => {
    const results = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "15W40",
      types: ["INVENTORY_ITEM"],
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Engine oil 15W40");
    // 12 litres against a minimum of 40. Somebody searching a part is deciding
    // whether to raise a requisition, so the row has to say so.
    expect(results[0].subtitle).toContain("below minimum");
  });

  it("finds equipment by the code on its plate and by the QR sticker", async () => {
    const byCode = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "slurry pump",
      types: ["EQUIPMENT"],
    });
    const byQr = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: `QR-`,
      types: ["EQUIPMENT"],
    });

    expect(byCode.map((row) => row.id)).toEqual([pumpId]);
    expect(byQr.map((row) => row.id)).toEqual([pumpId]);
  });

  it("finds a work order by the fault somebody typed", async () => {
    // A work order has no reference number. The fault text is the handle.
    const results = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "seal weeping",
      types: ["WORK_ORDER"],
    });

    expect(results.map((row) => row.id)).toEqual([workOrderId]);
    expect(results[0].reference).toBeNull();
    expect(results[0].facts).toEqual(
      expect.arrayContaining([{ label: "Status", value: "OPEN" }]),
    );
  });

  it("finds a work order by the machine it is on", async () => {
    const results = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "slurry pump",
      types: ["WORK_ORDER"],
    });

    expect(results.map((row) => row.id)).toEqual([workOrderId]);
  });

  it("leaves the machine's return to service blank while it is still down", async () => {
    const results = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "seal weeping",
      types: ["WORK_ORDER"],
    });

    expect(results[0].facts.map((fact) => fact.label)).not.toContain("Back up");
  });

  it("never crosses tenants, on any of the three site-scoped tables", async () => {
    // The rival has an item, a pump and a fault with the same text. Each of
    // these would return two rows if its `where` lost the site relation — and
    // the work-order case would fail on one hop as well as two.
    const items = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "15W40",
      types: ["INVENTORY_ITEM"],
    });
    const equipment = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "slurry pump",
      types: ["EQUIPMENT"],
    });
    const orders = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "seal weeping",
      types: ["WORK_ORDER"],
    });

    expect(items).toHaveLength(1);
    expect(equipment).toHaveLength(1);
    expect(orders).toHaveLength(1);
  });

  it("runs only the arms it was given", async () => {
    // A tenant with stores but not maintenance must not have plant surface.
    const storesOnly = await searchOperations(prisma, {
      companyId: mine.companyId,
      query: "slurry pump",
      types: ["INVENTORY_ITEM"],
    });

    expect(storesOnly).toEqual([]);
  });
});
