import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!id) {
      return errorResponse("Stock movement id is required", 400);
    }

    const movement = await prisma.stockMovement.findUnique({
      where: { id },
      include: {
        item: {
          select: {
            id: true,
            name: true,
            itemCode: true,
            unit: true,
            currentStock: true,
            site: { select: { id: true, name: true, code: true, companyId: true } },
            location: { select: { name: true } },
          },
        },
        issuedBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!movement || movement.item.site.companyId !== session.user.companyId) {
      return errorResponse("Stock movement not found", 404);
    }

    const { item, ...movementData } = movement;
    const { site, ...itemData } = item;

    return successResponse({
      ...movementData,
      item: {
        ...itemData,
        site: {
          id: site.id,
          name: site.name,
          code: site.code,
        },
      },
    });
  } catch (error) {
    console.error("[API] GET /api/inventory/movements/[id] error:", error);
    return errorResponse("Failed to fetch stock movement");
  }
}
