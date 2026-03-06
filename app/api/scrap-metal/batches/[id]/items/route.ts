import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const addItemsToBatchSchema = z.object({
  purchaseIds: z.array(z.string().uuid()).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = addItemsToBatchSchema.parse(body);
    const { id: batchId } = await params;

    // Fetch batch and verify ownership
    const batch = await prisma.scrapMetalBatch.findUnique({
      where: { id: batchId },
      select: {
        id: true,
        companyId: true,
        category: true,
        status: true,
        totalWeight: true,
      },
    });

    if (!batch || batch.companyId !== session.user.companyId) {
      return errorResponse("Batch not found", 404);
    }

    if (batch.status !== "COLLECTING") {
      return errorResponse(
        "Can only add items to batches with COLLECTING status",
        400
      );
    }

    // Fetch purchases and verify they match category and aren't already in a batch
    const purchases = await prisma.scrapMetalPurchase.findMany({
      where: {
        id: { in: validated.purchaseIds },
        companyId: session.user.companyId,
        category: batch.category,
      },
      select: {
        id: true,
        weight: true,
        batchItems: {
          select: { batchId: true },
        },
      },
    });

    if (purchases.length !== validated.purchaseIds.length) {
      return errorResponse(
        "Some purchases not found or don't match batch category",
        400
      );
    }

    // Check for purchases already in batches
    const alreadyBatched = purchases.filter(
      (p) => p.batchItems && p.batchItems.length > 0
    );
    if (alreadyBatched.length > 0) {
      return errorResponse(
        `${alreadyBatched.length} purchase(s) already assigned to a batch`,
        400
      );
    }

    // Add items to batch
    const result = await prisma.$transaction(async (tx) => {
      // Create batch items
      const items = await Promise.all(
        purchases.map((purchase) =>
          tx.scrapMetalBatchItem.create({
            data: {
              batchId,
              purchaseId: purchase.id,
              weight: purchase.weight,
            },
          })
        )
      );

      // Update batch total weight
      const totalWeightToAdd = purchases.reduce(
        (sum, p) => sum + p.weight,
        0
      );

      const updatedBatch = await tx.scrapMetalBatch.update({
        where: { id: batchId },
        data: {
          totalWeight: {
            increment: totalWeightToAdd,
          },
        },
        include: {
          site: { select: { id: true, name: true, code: true } },
          createdBy: { select: { id: true, name: true } },
          items: {
            include: {
              purchase: {
                include: {
                  employee: {
                    select: { id: true, name: true, employeeId: true },
                  },
                },
              },
            },
          },
          _count: {
            select: { items: true },
          },
        },
      });

      return { items, batch: updatedBatch };
    });

    return successResponse({
      message: `Added ${result.items.length} purchases to batch`,
      batch: result.batch,
      itemsAdded: result.items.length,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/scrap-metal/batches/[id]/items error:", error);
    return errorResponse("Failed to add items to batch");
  }
}
