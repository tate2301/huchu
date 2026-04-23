import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId")?.trim();

  const catalogItems = await prisma.retailCatalogItem.findMany({
    where: {
      companyId: session.user.companyId,
      status: "ACTIVE",
      ...(siteId ? { siteId } : {}),
    },
    select: { inventoryItemId: true },
  });
  const inventoryItems = await prisma.inventoryItem.findMany({
    where: { id: { in: catalogItems.map((item) => item.inventoryItemId) } },
    select: { category: true },
  });

  return successResponse({
    data: [...new Set(
      inventoryItems
        .map((item) => item.category?.trim())
        .filter((category): category is string => Boolean(category)),
    )].sort((left, right) => left.localeCompare(right)),
  });
}
