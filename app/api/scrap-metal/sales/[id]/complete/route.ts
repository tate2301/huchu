import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Only managers and superusers can complete sales", 403);
    }

    const { id: saleId } = await params;

    const sale = await prisma.scrapMetalSale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        companyId: true,
        status: true,
      },
    });

    if (!sale || sale.companyId !== session.user.companyId) {
      return errorResponse("Sale not found", 404);
    }

    if (sale.status !== "APPROVED") {
      return errorResponse("Only approved sales can be marked as completed", 400);
    }

    const updatedSale = await prisma.scrapMetalSale.update({
      where: { id: saleId },
      data: { status: "COMPLETED" },
      include: {
        site: { select: { id: true, name: true, code: true } },
        batch: {
          select: {
            id: true,
            batchNumber: true,
            category: true,
            totalWeight: true,
          },
        },
        approvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    return successResponse({
      message: "Sale marked as completed",
      sale: updatedSale,
    });
  } catch (error) {
    console.error("[API] POST /api/scrap-metal/sales/[id]/complete error:", error);
    return errorResponse("Failed to complete sale");
  }
}
