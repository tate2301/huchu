import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  hasRole,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  createGoldLedgerCorrection,
  captureGoldCorrectionAccountingEvent,
  verifyEntityOwnership,
  type SupportedEntityType,
} from "@/lib/gold/corrections";

// Legacy JSON-blob correction GET kept for read-only backward compat.
// New structured rows are the source of truth from this commit forward.
// TODO: drop GoldPour.corrections JSON column in a future cleanup sprint.

const SUPPORTED_ENTITY_TYPES = [
  "GoldPour",
  "GoldPurchase",
  "GoldDispatch",
  "GoldShiftAllocation",
] as const;

const correctionSchema = z.object({
  entityType: z.enum(SUPPORTED_ENTITY_TYPES),
  entityId: z.string().uuid(),
  type: z.enum(["ADJUST_AMOUNT", "ADJUST_ASSAY", "ADJUST_GRAMS", "VOID", "RECLASSIFY", "OTHER"]),
  reason: z.string().min(3).max(1000),
  beforeJson: z.unknown().optional(),
  afterJson: z.unknown().optional(),
  deltaUsd: z.number().optional().nullable(),
  deltaGrams: z.number().optional().nullable(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const { page, limit, skip } = getPaginationParams(request);

    const where: {
      companyId: string;
      entityType?: string;
      entityId?: string;
    } = {
      companyId: session.user.companyId,
    };
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [corrections, total] = await prisma.$transaction([
      prisma.goldLedgerCorrection.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          entityType: true,
          entityId: true,
          type: true,
          reason: true,
          beforeJson: true,
          afterJson: true,
          deltaUsd: true,
          deltaGrams: true,
          adjustmentEntryId: true,
          createdAt: true,
          createdBy: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.goldLedgerCorrection.count({ where }),
    ]);

    // For BuyerReceipt entityType, also return BuyerReceiptCorrections
    let receiptCorrections: unknown[] = [];
    if (entityType === "BuyerReceipt" && entityId) {
      receiptCorrections = await prisma.buyerReceiptCorrection.findMany({
        where: { buyerReceiptId: entityId, companyId: session.user.companyId },
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
    }

    const allCorrections =
      receiptCorrections.length > 0 ? [...corrections, ...receiptCorrections] : corrections;

    return successResponse(paginationResponse(allCorrections, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/gold/corrections error:", error);
    return errorResponse("Failed to fetch gold corrections");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["MANAGER", "SUPERADMIN"])) {
      return errorResponse("Insufficient permissions to create corrections", 403);
    }

    const body = await request.json();
    const validated = correctionSchema.parse(body);

    const owned = await verifyEntityOwnership(
      session.user.companyId,
      validated.entityType as SupportedEntityType,
      validated.entityId,
    );
    if (!owned) {
      return errorResponse("Entity not found", 404);
    }

    const correction = await prisma.$transaction(async (tx) => {
      const created = await createGoldLedgerCorrection(
        {
          companyId: session.user.companyId,
          entityType: validated.entityType as SupportedEntityType,
          entityId: validated.entityId,
          type: validated.type,
          reason: validated.reason,
          beforeJson: validated.beforeJson,
          afterJson: validated.afterJson,
          deltaUsd: validated.deltaUsd,
          deltaGrams: validated.deltaGrams,
          createdById: session.user.id,
        },
        tx,
      );

      if (validated.deltaUsd != null) {
        await captureGoldCorrectionAccountingEvent(
          {
            companyId: session.user.companyId,
            correctionId: created.id,
            entityType: validated.entityType,
            entityId: validated.entityId,
            deltaUsd: validated.deltaUsd,
            createdById: session.user.id,
            label: validated.reason,
          },
          tx,
        );
      }

      return created;
    });

    return successResponse(correction, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/gold/corrections error:", error);
    return errorResponse("Failed to save correction");
  }
}
