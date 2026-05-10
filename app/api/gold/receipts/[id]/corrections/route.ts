import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  hasRole,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  createBuyerReceiptCorrection,
  captureGoldCorrectionAccountingEvent,
} from "@/lib/gold/corrections";
import { writeGoldAuditEvent } from "@/lib/audit/gold";

const receiptCorrectionSchema = z.object({
  type: z.enum(["ADJUST_AMOUNT", "ADJUST_ASSAY", "ADJUST_GRAMS", "VOID", "RECLASSIFY", "OTHER"]),
  reason: z.string().min(3).max(1000),
  beforeJson: z.unknown().optional(),
  afterJson: z.unknown().optional(),
  deltaAmountUsd: z.number().optional().nullable(),
  deltaAssay: z.number().optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create receipt corrections", 403);
    }

    const { id: receiptId } = await params;
    const body = await request.json();
    const validated = receiptCorrectionSchema.parse(body);

    const receipt = await prisma.buyerReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, companyId: true, receiptNumber: true },
    });
    if (!receipt || receipt.companyId !== session.user.companyId) {
      return errorResponse("Receipt not found", 404);
    }

    const correction = await prisma.$transaction(async (tx) => {
      const created = await createBuyerReceiptCorrection(
        {
          buyerReceiptId: receiptId,
          companyId: session.user.companyId,
          type: validated.type,
          reason: validated.reason,
          beforeJson: validated.beforeJson,
          afterJson: validated.afterJson,
          deltaAmountUsd: validated.deltaAmountUsd,
          deltaAssay: validated.deltaAssay,
          createdById: session.user.id,
        },
        tx,
      );

      if (validated.deltaAmountUsd != null) {
        await captureGoldCorrectionAccountingEvent(
          {
            companyId: session.user.companyId,
            correctionId: created.id,
            entityType: "BuyerReceipt",
            entityId: receiptId,
            deltaUsd: validated.deltaAmountUsd,
            createdById: session.user.id,
            label: validated.reason,
          },
          tx,
        );
      }

      return created;
    });

    await writeGoldAuditEvent({
      companyId: session.user.companyId,
      actorId: session.user.id,
      eventType: "gold.receipt-correction.created",
      entityType: "BuyerReceipt",
      entityId: receiptId,
      payload: { correctionId: correction.id, type: validated.type, reason: validated.reason },
    });

    return successResponse(correction, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/gold/receipts/[id]/corrections error:", error);
    return errorResponse("Failed to save receipt correction");
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id: receiptId } = await params;

    const receipt = await prisma.buyerReceipt.findUnique({
      where: { id: receiptId },
      select: { id: true, companyId: true },
    });
    if (!receipt || receipt.companyId !== session.user.companyId) {
      return errorResponse("Receipt not found", 404);
    }

    const corrections = await prisma.buyerReceiptCorrection.findMany({
      where: { buyerReceiptId: receiptId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        buyerReceiptId: true,
        type: true,
        reason: true,
        beforeJson: true,
        afterJson: true,
        deltaAmountUsd: true,
        deltaAssay: true,
        adjustmentEntryId: true,
        createdAt: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return successResponse({ data: corrections });
  } catch (error) {
    console.error("[API] GET /api/gold/receipts/[id]/corrections error:", error);
    return errorResponse("Failed to fetch receipt corrections");
  }
}
