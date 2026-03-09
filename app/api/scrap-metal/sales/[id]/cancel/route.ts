import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { hasRole } from "@/lib/roles";

const cancelSaleSchema = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session.user.role, ["SUPERADMIN", "MANAGER"])) {
      return errorResponse("Only managers and superusers can cancel sales", 403);
    }

    const { id: saleId } = await params;
    const body = await request.json().catch(() => ({}));
    const validated = cancelSaleSchema.parse(body);

    const sale = await prisma.scrapMetalSale.findUnique({
      where: { id: saleId },
      select: {
        id: true,
        companyId: true,
        status: true,
        batchId: true,
        notes: true,
      },
    });

    if (!sale || sale.companyId !== session.user.companyId) {
      return errorResponse("Sale not found", 404);
    }

    if (sale.status === "COMPLETED") {
      return errorResponse("Completed sales cannot be cancelled", 400);
    }

    if (sale.status === "CANCELLED") {
      return errorResponse("Sale is already cancelled", 400);
    }

    const cancellationReason = validated.reason?.trim();
    const noteFragment = cancellationReason
      ? `Cancelled: ${cancellationReason}`
      : "Cancelled";

    const updatedSale = await prisma.$transaction(async (tx) => {
      const cancelledSale = await tx.scrapMetalSale.update({
        where: { id: saleId },
        data: {
          status: "CANCELLED",
          notes: sale.notes ? `${sale.notes}\n${noteFragment}` : noteFragment,
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

      if (sale.status === "APPROVED") {
        const hasOtherActiveSale = await tx.scrapMetalSale.findFirst({
          where: {
            batchId: sale.batchId,
            id: { not: sale.id },
            status: { in: ["APPROVED", "COMPLETED"] },
          },
          select: { id: true },
        });

        if (!hasOtherActiveSale) {
          await tx.scrapMetalBatch.update({
            where: { id: sale.batchId },
            data: {
              status: "READY",
              collectionEndDate: null,
            },
          });
        }
      }

      return cancelledSale;
    });

    return successResponse({
      message: "Sale cancelled",
      sale: updatedSale,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }

    console.error("[API] POST /api/scrap-metal/sales/[id]/cancel error:", error);
    return errorResponse("Failed to cancel sale");
  }
}
