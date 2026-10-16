import { randomUUID } from "node:crypto";

import type { WorkspaceProfile } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  SiteFieldRefusal,
  closeWorkspaceSite,
  createWorkspaceSite,
  findSite,
  reopenWorkspaceSite,
  updateWorkspaceSite,
  workspaceSites,
  type SiteRecord,
  type SiteWorkspace,
} from "@/lib/admin/sites";
import type { SignedInOperator } from "@/lib/operators/guards";
import { quantity } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/** A workspace's sites from the admin portal, on the rules its own Setup keeps them by. */

const run = randomUUID().slice(0, 8);
let owner: SignedInOperator;
let shop: SiteWorkspace;
let mine: SiteWorkspace;
let userId: string;
let mainId: string;

const site = async (id: string): Promise<SiteRecord> => (await findSite(id))!;

beforeAll(async () => {
  const op = await prisma.operator.create({ data: { email: `sites-${run}@corelith.test`, name: "Tafadzwa", role: "OWNER" } });
  owner = { sessionId: "o", id: op.id, email: op.email, name: op.name, role: op.role };
  const [a, b] = await Promise.all([
    prisma.company.create({
      data: {
        name: `Avondale Bottle Store ${run}`,
        slug: `avondale-${run}`,
        // Written by its key: Prisma takes "RETAIL" and stores "THRIFT", though its types say otherwise.
        workspaceProfile: "RETAIL" as unknown as WorkspaceProfile,
      },
      select: { id: true, name: true, slug: true, workspaceProfile: true },
    }),
    prisma.company.create({
      data: { name: `Kadoma Gold ${run}`, slug: `kadoma-${run}`, workspaceProfile: "GOLD_MINE" },
      select: { id: true, name: true, slug: true, workspaceProfile: true },
    }),
  ]);
  shop = a;
  mine = b;
  userId = (
    await prisma.user.create({ data: { companyId: shop.id, name: "Tendai", role: "SUPERADMIN", email: `tendai-${run}@x.test` }, select: { id: true } })
  ).id;
  const list = await prisma.priceList.create({ data: { companyId: shop.id, name: "Retail", kind: "RETAIL", isDefault: true }, select: { id: true } });
  mainId = (
    await prisma.site.create({ data: { companyId: shop.id, name: "Harare Main", code: "HRE", priceListId: list.id }, select: { id: true } })
  ).id;
  await prisma.retailShopProfile.create({ data: { companyId: shop.id, defaultSiteId: mainId } });
});

afterAll(async () => {
  const ids = [shop.id, mine.id];
  await prisma.inventoryItem.deleteMany({ where: { site: { companyId: { in: ids } } } });
  await prisma.retailShift.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailDevice.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.retailRegister.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.stockLocation.deleteMany({ where: { site: { companyId: { in: ids } } } });
  await prisma.retailShopProfile.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.platformAuditEvent.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.site.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.idSequence.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.priceList.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
  await prisma.company.deleteMany({ where: { id: { in: ids } } });
  await prisma.operator.deleteMany({ where: { id: owner.id } });
});

describe("a shop's sites", () => {
  it("adds a site with a short code, a first place and the default price list, on the operator's line", async () => {
    await expect(createWorkspaceSite(owner, shop, { name: "Avondale", code: "a" })).rejects.toThrow(/2 to 6 letters/);
    await expect(createWorkspaceSite(owner, shop, { name: "harare main", code: "HR2" })).rejects.toThrow(/already an open site called Harare Main/);
    await expect(createWorkspaceSite(owner, shop, { name: "Avondale", code: "hre" })).rejects.toThrow(/Harare Main already has the code HRE/);

    const added = await createWorkspaceSite(owner, shop, { name: "  Avondale  ", code: "avo", location: "Shop 7, Avondale" });
    const row = await prisma.site.findUniqueOrThrow({ where: { id: added.id }, include: { stockLocations: true } });
    expect(row).toMatchObject({ name: "Avondale", code: "AVO", location: "Shop 7, Avondale", isActive: true });
    expect(row.priceListId).not.toBeNull();
    expect(row.stockLocations.map((place) => place.name)).toEqual(["Shop floor"]);
    const line = await prisma.platformAuditEvent.findFirstOrThrow({ where: { companyId: shop.id, entityId: added.id } });
    expect(line).toMatchObject({ eventType: "operator.site.created", actor: `operator:${owner.id}` });
  });

  it("adds as many open sites as the shop needs", async () => {
    await createWorkspaceSite(owner, shop, { name: "Borrowdale", code: "BDL" });
    expect(await prisma.site.count({ where: { companyId: shop.id, isActive: true } })).toBe(3);
  });

  it("names a field's refusal so the sheet can put it under that field", async () => {
    const refused = await createWorkspaceSite(owner, shop, { name: "", code: "XYZ" }).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(SiteFieldRefusal);
    expect((refused as SiteFieldRefusal).field).toBe("name");
  });

  it("changes a site's name and code, and keeps a closed one as it was", async () => {
    const avondale = await prisma.site.findFirstOrThrow({ where: { companyId: shop.id, code: "AVO" } });
    expect(await updateWorkspaceSite(owner, await site(avondale.id), { name: "Avondale Shops", code: "avd", location: "Shop 7" })).toEqual({ changed: true });
    expect(await prisma.site.findUniqueOrThrow({ where: { id: avondale.id } })).toMatchObject({ name: "Avondale Shops", code: "AVD" });
    expect(await updateWorkspaceSite(owner, await site(avondale.id), { name: "Avondale Shops", code: "AVD", location: "Shop 7" })).toEqual({ changed: false });
  });

  it("refuses to close the default site, one with a shift open, or one with stock left", async () => {
    await expect(closeWorkspaceSite(owner, await site(mainId), "Moving")).rejects.toThrow(/default site/);
    const avondale = await prisma.site.findFirstOrThrow({ where: { companyId: shop.id, code: "AVD" }, include: { stockLocations: true } });
    await expect(closeWorkspaceSite(owner, await site(avondale.id), "")).rejects.toThrow(/Say why/);

    const till = await prisma.retailRegister.create({ data: { companyId: shop.id, siteId: avondale.id, code: `T-${run}`, name: "Front till" } });
    const shift = await prisma.retailShift.create({
      data: { companyId: shop.id, siteId: avondale.id, shiftNo: `SH-${run}`, registerCode: till.code, registerName: till.name, registerId: till.id, cashierId: userId, cashierName: "Tendai" },
    });
    await expect(closeWorkspaceSite(owner, await site(avondale.id), "Lease ended")).rejects.toThrow(/open shifts/);
    await prisma.retailShift.delete({ where: { id: shift.id } });

    const line = await prisma.inventoryItem.create({
      data: { itemCode: `CAS-${run}`, name: "Castle", category: "OTHER", unit: "bottle", siteId: avondale.id, locationId: avondale.stockLocations[0]!.id, currentStock: quantity(4) },
    });
    await expect(closeWorkspaceSite(owner, await site(avondale.id), "Lease ended")).rejects.toThrow(/1 product still has stock here/);
    await prisma.inventoryItem.delete({ where: { id: line.id } });

    const device = await prisma.retailDevice.create({ data: { companyId: shop.id, registerId: till.id, kind: "COUNTER_MINI", keyHash: `key-${run}`, pairedById: userId } });
    await closeWorkspaceSite(owner, await site(avondale.id), "Lease ended");
    expect(await prisma.site.findUniqueOrThrow({ where: { id: avondale.id } })).toMatchObject({ isActive: false });
    expect(await prisma.retailRegister.findUniqueOrThrow({ where: { id: till.id } })).toMatchObject({ isActive: false });
    expect(await prisma.retailDevice.findUniqueOrThrow({ where: { id: device.id } })).toMatchObject({ unpairReason: "SITE_CLOSED" });
    await expect(closeWorkspaceSite(owner, await site(avondale.id), "again")).rejects.toThrow(/already closed/);
    await expect(updateWorkspaceSite(owner, await site(avondale.id), { name: "Avondale" })).rejects.toThrow(/keeps its details/);
    const closed = await prisma.platformAuditEvent.findFirstOrThrow({ where: { entityId: avondale.id, eventType: "operator.site.closed" } });
    expect(closed.reason).toBe("Lease ended");
  });

  it("reopens a closed site while no open site has taken its name", async () => {
    const avondale = await prisma.site.findFirstOrThrow({ where: { companyId: shop.id, code: "AVD" } });
    const other = await createWorkspaceSite(owner, shop, { name: "Avondale Shops", code: "AV2" });
    await expect(reopenWorkspaceSite(owner, await site(avondale.id))).rejects.toThrow(/An open site is called Avondale Shops/);
    await prisma.site.update({ where: { id: other.id }, data: { isActive: false } });
    await reopenWorkspaceSite(owner, await site(avondale.id), "Lease renewed");
    expect(await prisma.site.findUniqueOrThrow({ where: { id: avondale.id } })).toMatchObject({ isActive: true, closedAt: null });
    await expect(reopenWorkspaceSite(owner, await site(avondale.id))).rejects.toThrow(/is open/);
  });

  it("lists every site with the default marked", async () => {
    const rows = await workspaceSites(shop);
    expect(rows.find((row) => row.id === mainId)).toMatchObject({ isDefault: true, unit: null });
  });
});

describe("a mine's sites", () => {
  it("numbers a site SITE-0001 when no code is given, with its measurement unit", async () => {
    const added = await createWorkspaceSite(owner, mine, { name: "Main Shaft", unit: "trips" });
    expect(await prisma.site.findUniqueOrThrow({ where: { id: added.id } })).toMatchObject({ code: "SITE-0001", measurementUnit: "trips" });
    await expect(createWorkspaceSite(owner, mine, { name: "North", code: "NTH" })).rejects.toThrow(/SITE-0001/);
    await expect(createWorkspaceSite(owner, mine, { name: "North", unit: "buckets" })).rejects.toThrow(/tonnes, trips or wheelbarrows/);
  });

  it("keeps a site's code as it was set, and closes with no shop rules", async () => {
    const shaft = await prisma.site.findFirstOrThrow({ where: { companyId: mine.id } });
    await expect(updateWorkspaceSite(owner, await site(shaft.id), { name: "Main Shaft", code: "SITE-0009" })).rejects.toThrow(/code stays/);
    await updateWorkspaceSite(owner, await site(shaft.id), { name: "Main Shaft", code: "SITE-0001", unit: "tonnes" });
    expect((await prisma.site.findUniqueOrThrow({ where: { id: shaft.id } })).measurementUnit).toBe("tonnes");
    await closeWorkspaceSite(owner, await site(shaft.id), "Shaft flooded");
    await reopenWorkspaceSite(owner, await site(shaft.id));
    expect((await workspaceSites(mine))[0]).toMatchObject({ unit: "tonnes", isActive: true });
  });
});
