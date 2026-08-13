import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { resolveShelfPrices } from "@/lib/retail/shelf-pricing";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search")?.trim();
  const siteId = searchParams.get("siteId")?.trim();
  const category = searchParams.get("category")?.trim();

  const inventoryWhere: Prisma.InventoryItemWhereInput = {
    site: { companyId: session.user.companyId },
  };
  if (siteId) inventoryWhere.siteId = siteId;
  if (category) inventoryWhere.category = category;

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: inventoryWhere,
    select: {
      id: true,
      itemCode: true,
      currentStock: true,
      unit: true,
      locationId: true,
      category: true,
      siteId: true,
    },
  });
  const inventoryIds = inventoryItems.map((item) => item.id);
  if (inventoryIds.length === 0) {
    return successResponse({ data: [] });
  }

  const where: Prisma.RetailCatalogItemWhereInput = {
    companyId: session.user.companyId,
    status: "ACTIVE",
    inventoryItemId: { in: inventoryIds },
  };
  if (siteId) where.siteId = siteId;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
      { catalogCode: { contains: search, mode: "insensitive" } },
    ];
  }

  const items = await prisma.retailCatalogItem.findMany({
    where,
    orderBy: [{ name: "asc" }],
    take: 120,
  });
  const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));

  // S-3. The sellable list is the till's offline snapshot: `offline-bootstrap`
  // caches whatever comes back here and the till then reads it literally, with
  // no price list in sight. So the resolving happens once, on the server, and
  // what ships is still two plain numbers — plus a stamp saying which list they
  // came off and when, which is what lets sync tell a stale device from a
  // tampered one.
  const shelfPrices = await resolveShelfPrices(
    session.user.companyId,
    items.map((item) => ({
      id: item.id,
      productId: item.productId,
      unitPrice: item.unitPrice,
      taxPercent: item.taxPercent,
    })),
  );

  return successResponse({
    data: items
      .map((item) => {
        const shelf = shelfPrices.get(item.id);
        return {
          ...item,
          // Same wire contract as before — numbers, never a `Decimal` rendered
          // as a JSON string. Only where they come from has changed.
          unitPrice: shelf?.unitPrice ?? Number(item.unitPrice),
          taxPercent: shelf?.taxPercent ?? Number(item.taxPercent),
          taxInclusive: shelf?.taxInclusive ?? false,
          currency: shelf?.currency ?? "USD",
          priceListId: shelf?.priceListId ?? null,
          priceSource: shelf?.priceSource ?? "LISTING",
          pricedAt: shelf?.pricedAt ?? new Date().toISOString(),
          category: inventoryMap.get(item.inventoryItemId)?.category ?? null,
          siteId: inventoryMap.get(item.inventoryItemId)?.siteId ?? item.siteId,
          inventoryItem: inventoryMap.get(item.inventoryItemId) ?? null,
        };
      })
      .filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0),
  });
}
