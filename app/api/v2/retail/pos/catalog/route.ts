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

  const where: Prisma.RetailCatalogItemWhereInput = {
    companyId: session.user.companyId,
    status: "ACTIVE",
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

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { id: { in: items.map((item) => item.inventoryItemId) } },
    select: { id: true, itemCode: true, currentStock: true, unit: true, locationId: true },
  });
  const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));

  return successResponse({
    data: items
      .map((item) => ({
        ...item,
        inventoryItem: inventoryMap.get(item.inventoryItemId) ?? null,
      }))
      .filter((item) => (item.inventoryItem?.currentStock ?? 0) > 0),
  });
}
