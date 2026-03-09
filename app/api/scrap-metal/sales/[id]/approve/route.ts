import { NextRequest, NextResponse } from "next/server";

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { captureAccountingEvent } from "@/lib/accounting/integration";
import { hasRole } from "@/lib/roles";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Only managers and superusers can approve sales
    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse(
        "Only managers and superusers can approve sales",
        403
      );
    }

    const { id: saleId } = await params;

    const sale = await prisma.scrapMetalSale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        companyId: true,
        status: true,
        saleNumber: true,
        saleDate: true,
        totalAmount: true,
        currency: true,
        batchId: true,
        batch: {
          select: {
            id: true,
            category: true,
          },
        },
      },
    });

    if (!sale || sale.companyId !== session.user.companyId) {
      return errorResponse("Sale not found", 404);
    }

    if (sale.status !== "PENDING_APPROVAL") {
      return errorResponse("Sale is not pending approval", 400);
    }

    const updatedSale = await prisma.$transaction(async (tx) => {
      const approvedSale = await tx.scrapMetalSale.update({
        where: { id: saleId },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
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

      await tx.scrapMetalBatch.update({
        where: { id: sale.batchId },
        data: {
          status: "SOLD",
          collectionEndDate: sale.saleDate,
        },
      });

      return approvedSale;
    });

    // Capture accounting event
    try {
      await captureAccountingEvent({
        companyId: session.user.companyId,
        sourceDomain: "scrap-metal",
        sourceAction: "sale",
        sourceType: "SCRAP_METAL_SALE",
        sourceId: sale.id,
        entryDate: sale.saleDate,
        description: `Scrap metal sale ${sale.saleNumber} - ${sale.batch.category}`,
        amount: sale.totalAmount,
        netAmount: sale.totalAmount,
        taxAmount: 0,
        grossAmount: sale.totalAmount,
        currency: sale.currency,
        createdById: session.user.id,
        payload: {
          batchId: sale.batchId,
          category: sale.batch.category,
        },
      });
    } catch (error) {
      console.error("[Accounting] Scrap metal sale event failed:", error);
    }

    return successResponse({
      message: "Sale approved successfully",
      sale: updatedSale,
    });
  } catch (error) {
    console.error("[API] POST /api/scrap-metal/sales/[id]/approve error:", error);
    return errorResponse("Failed to approve sale");
  }
}
