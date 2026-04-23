import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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

  return successResponse({
    data: items
      .map((item) => ({
        ...item,
        category: inventoryMap.get(item.inventoryItemId)?.category ?? null,
        siteId: inventoryMap.get(item.inventoryItemId)?.siteId ?? item.siteId,
        inventoryItem: inventoryMap.get(item.inventoryItemId) ?? null,
      }))
      .filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0),
  });
}
