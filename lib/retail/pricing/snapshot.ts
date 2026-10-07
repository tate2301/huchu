import { createHash } from "node:crypto";

import { toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { shopSiteId } from "@/lib/retail/devices";
import { wasPrices } from "@/lib/retail/prices/was";
import { ageCheckFor } from "@/lib/retail/products/age-check";

import { baseListOf, type PricingSnapshot, type SnapshotList } from "./engine";

/**
 * The price snapshot a till prices from (PRD-05, 20-products 4.4): the lists
 * that are on, their rules and their rows for the products stocked at the
 * site, built on the server for `GET pos/pricing` and for `pos/sales`, which
 * runs the same engine over it. `version` hashes the newest write of every
 * row read, plus the newest applied price change, so an unchanged shop
 * answers the till's `If-None-Match` with 304.
 */

const day = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

export async function loadPricingSnapshot(
  companyId: string,
  where: { siteId?: string | null; registerId?: string | null; productIds?: string[] } = {},
  now: Date = new Date(),
): Promise<PricingSnapshot> {
  const register = where.registerId
    ? await prisma.retailRegister.findFirst({
        where: { id: where.registerId, companyId },
        select: { id: true, siteId: true, priceListId: true },
      })
    : null;
  const siteId = where.siteId ?? register?.siteId ?? (await shopSiteId(companyId));
  const site = siteId
    ? await prisma.site.findFirst({ where: { id: siteId, companyId }, select: { id: true, priceListId: true } })
    : null;

  const [lists, products, lastApplied] = await Promise.all([
    prisma.priceList.findMany({
      where: { companyId, archivedAt: null, OR: [{ state: "ON" }, { isDefault: true }] },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        isDefault: true,
        state: true,
        currency: true,
        taxInclusive: true,
        audience: true,
        whenKind: true,
        daysOfWeek: true,
        fromTime: true,
        toTime: true,
        startsOn: true,
        endsOn: true,
        siteId: true,
        minQuantity: true,
        updatedAt: true,
        categories: { select: { categoryId: true } },
      },
    }),
    prisma.product.findMany({
      where: {
        companyId,
        // Asked for by id (a basket, a binned product's record): those products. Else what the site stocks and sells.
        ...(where.productIds
          ? { id: { in: where.productIds } }
          : { archivedAt: null, ...(site ? { inventoryItems: { some: { siteId: site.id } } } : {}) }),
      },
      select: {
        id: true,
        categoryId: true,
        barcode: true,
        ageRestricted: true,
        packOfId: true,
        packSize: true,
        breakAtTill: true,
        updatedAt: true,
        retailCategory: { select: { ageRestricted: true } },
      },
    }),
    prisma.productPriceChange.aggregate({ where: { companyId, appliedAt: { not: null } }, _max: { appliedAt: true } }),
  ]);

  const productIds = products.map((product) => product.id);
  const rows = await prisma.productPrice.findMany({
    where: { companyId, priceListId: { in: lists.map((list) => list.id) }, productId: { in: productIds } },
    select: { priceListId: true, productId: true, minQuantity: true, unitPrice: true, updatedAt: true },
  });

  const snapshotLists: SnapshotList[] = lists.map((list) => ({
    id: list.id,
    name: list.name,
    isDefault: list.isDefault,
    state: list.state,
    archived: false,
    currency: list.currency,
    taxInclusive: list.taxInclusive,
    audience: list.audience,
    whenKind: list.whenKind,
    daysOfWeek: list.daysOfWeek,
    fromTime: list.fromTime,
    toTime: list.toTime,
    startsOn: day(list.startsOn),
    endsOn: day(list.endsOn),
    siteId: list.siteId,
    minQuantity: list.minQuantity,
    categoryIds: list.categories.map((entry) => entry.categoryId).sort(),
  }));

  const defaultListId = lists.find((list) => list.isDefault)?.id ?? null;
  const ownListId = register?.priceListId ?? site?.priceListId ?? null;
  const prices = rows.map((row) => ({
    priceListId: row.priceListId,
    productId: row.productId,
    minQuantity: toNumberOrZero(row.minQuantity),
    unitPrice: toNumberOrZero(row.unitPrice),
  }));

  const partial: PricingSnapshot = {
    version: "",
    pricedAt: now.toISOString(),
    currency: "USD",
    siteId: site?.id ?? null,
    registerId: register?.id ?? null,
    defaultListId,
    ownListId,
    lists: snapshotLists,
    prices,
    products: [],
    bundles: [],
    promotions: [],
  };
  const base = baseListOf(partial);
  const baseRows = new Map(
    prices.filter((row) => row.priceListId === base?.id && row.minQuantity === 1).map((row) => [row.productId, row.unitPrice]),
  );
  const was = await wasPrices(companyId, baseRows, now);

  const newest = [
    ...lists.map((list) => list.updatedAt.getTime()),
    ...rows.map((row) => row.updatedAt.getTime()),
    ...products.map((product) => product.updatedAt.getTime()),
    lastApplied._max.appliedAt?.getTime() ?? 0,
  ].reduce((max, value) => Math.max(max, value), 0);
  const version = createHash("sha1")
    .update([companyId, site?.id ?? "", register?.id ?? "", ownListId ?? "", newest, lists.length, rows.length, products.length].join("|"))
    .digest("hex")
    .slice(0, 16);

  return {
    ...partial,
    version,
    currency: base?.currency ?? "USD",
    products: products.map((product) => ({
      id: product.id,
      categoryId: product.categoryId,
      barcode: product.barcode,
      ageCheck: ageCheckFor(product),
      packOfId: product.packOfId,
      packSize: product.packSize,
      breakAtTill: product.breakAtTill,
      wasPrice: was.get(product.id) ?? null,
    })),
  };
}
