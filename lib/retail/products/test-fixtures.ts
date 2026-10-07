import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { createProduct, type ProductActor, type ProductCreated } from "./create";
import { productInput } from "./input";

/**
 * Test setup only: a shop's default price list, and a product made the way
 * New product makes one, with stock put on its line directly (no movement).
 */

export async function defaultListFor(companyId: string): Promise<string> {
  const list = await prisma.priceList.upsert({
    where: { companyId_name: { companyId, name: "Retail" } },
    create: { companyId, name: "Retail", kind: "RETAIL", taxInclusive: true, isDefault: true },
    update: { isDefault: true },
    select: { id: true },
  });
  return list.id;
}

export async function addTestProduct(
  companyId: string,
  fields: Record<string, unknown> & { name: string; price: string | number },
  options: { siteId?: string; actor?: ProductActor; onHand?: number; reorderAt?: number; unit?: string } = {},
): Promise<ProductCreated> {
  await defaultListFor(companyId);
  const created = await prisma.$transaction((tx) =>
    createProduct(tx, {
      actor: options.actor ?? { companyId, userId: null },
      input: productInput.parse(fields),
      source: "ADDED",
      siteId: options.siteId ?? null,
    }),
  );
  if (options.onHand !== undefined || options.reorderAt !== undefined || options.unit !== undefined) {
    await prisma.inventoryItem.update({
      where: { id: created.itemId },
      data: {
        ...(options.onHand !== undefined ? { currentStock: new Prisma.Decimal(options.onHand) } : {}),
        ...(options.reorderAt !== undefined ? { minStock: new Prisma.Decimal(options.reorderAt) } : {}),
        ...(options.unit !== undefined ? { unit: options.unit } : {}),
      },
    });
  }
  return created;
}

export type TestShop = {
  companyId: string;
  ownerId: string;
  managerId: string;
  mainId: string;
  secondId: string | null;
  ciderId: string;
  owner: () => { companyId: string; userId: string; userName: string; userRole: string };
  manager: () => { companyId: string; userId: string; userName: string; userRole: string };
};

/** A liquor store: an owner and a manager, Harare Main Branch (default) and, when asked, Borrowdale; Ciders at 15.5%. */
export async function makeTestShop(label: string, options: { twoSites?: boolean } = {}): Promise<TestShop> {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const companyId = (await prisma.company.create({ data: { name: `${label} ${stamp}`, slug: `${label.toLowerCase()}-${stamp}` }, select: { id: true } })).id;
  const user = (name: string, role: string) =>
    prisma.user.create({ data: { email: `${role.toLowerCase()}-${stamp}@shop.test`, name, role: role as never, companyId }, select: { id: true } });
  const ownerId = (await user("Tendai Mhlanga", "SUPERADMIN")).id;
  const managerId = (await user("Tafara Nyathi", "MANAGER")).id;
  const site = async (name: string, code: string) => {
    const id = (await prisma.site.create({ data: { companyId, name, code: `${code}-${stamp}` }, select: { id: true } })).id;
    await prisma.stockLocation.create({ data: { siteId: id, code: `SHOP-${stamp}`, name: "Shop floor" } });
    return id;
  };
  const mainId = await site("Harare Main Branch", "MAIN");
  const secondId = options.twoSites ? await site("Borrowdale", "BORR") : null;
  await prisma.retailShopProfile.create({ data: { companyId, businessType: "LIQUOR", defaultSiteId: mainId } });
  await defaultListFor(companyId);
  const ciderId = (
    await prisma.retailCategory.create({
      data: { companyId, name: "Ciders and coolers", vatRate: new Prisma.Decimal("15.5"), ageRestricted: true },
      select: { id: true },
    })
  ).id;
  return {
    companyId,
    ownerId,
    managerId,
    mainId,
    secondId,
    ciderId,
    owner: () => ({ companyId, userId: ownerId, userName: "Tendai Mhlanga", userRole: "SUPERADMIN" }),
    manager: () => ({ companyId, userId: managerId, userName: "Tafara Nyathi", userRole: "MANAGER" }),
  };
}
