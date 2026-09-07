import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

/**
 * Stock rows a catalogue item can be linked to.
 *
 * `InventoryItem` carries no `companyId` — it is scoped through its `Site`, so
 * every read here joins through that. Without it this would list any company's
 * stock.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const query = new URL(request.url).searchParams.get("q")?.trim();

    const items = await prisma.inventoryItem.findMany({
      where: {
        site: { companyId: session.user.companyId },
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" as const } },
                { itemCode: { contains: query, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        itemCode: true,
        unit: true,
        currentStock: true,
        productId: true,
        site: { select: { id: true, name: true } },
      },
      orderBy: [{ name: "asc" }],
      take: 100,
    });

    return successResponse({
      data: items.map((item) => ({
        id: item.id,
        name: item.name,
        itemCode: item.itemCode,
        unit: item.unit,
        currentStock: item.currentStock,
        productId: item.productId,
        siteName: item.site.name,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/inventory/stock-items error:", error);
    return errorResponse("Failed to fetch stock items");
  }
}
