import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../../../_helpers";
import { canAccessPosPortal } from "@/lib/retail/pos-host";

const closePosShiftSchema = z.object({
  countedCash: z.number().min(0),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }
  if (!canAccessPosPortal(session.user.role)) {
    return errorResponse("POS access denied", 403);
  }

  try {
    const { id } = await params;
    const existing = await prisma.retailShift.findFirst({
      where: {
        id,
        companyId: session.user.companyId,
        cashierId: session.user.id,
      },
    });
    if (!existing) {
      return errorResponse("Open shift not found for this cashier", 404);
    }
    if (existing.status !== "OPEN") {
      return errorResponse("Only open shifts can be closed", 409);
    }

    const body = await request.json();
    const input = closePosShiftSchema.parse(body);
    const variance = Number((input.countedCash - existing.expectedCash).toFixed(2));

    const updated = await prisma.retailShift.update({
      where: { id: existing.id },
      data: {
        status: "CLOSED",
        countedCash: input.countedCash,
        variance,
        notes: input.notes?.trim() || existing.notes,
        closedAt: new Date(),
      },
    });

    if (variance !== 0) {
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "RETAIL_SHIFT_VARIANCE",
          sourceId: updated.id,
          sourceSubtype: variance < 0 ? "SHORT" : "OVER",
          siteId: updated.siteId,
          registerCode: updated.registerCode,
          entryDate: updated.closedAt ?? new Date(),
          description: `Retail shift variance ${updated.shiftNo}`,
          createdById: session.user.id,
          amount: Math.abs(variance),
          netAmount: Math.abs(variance),
          taxAmount: 0,
          grossAmount: Math.abs(variance),
          invertDirection: variance < 0,
        });
      } catch (error) {
        console.error("[Accounting] POS shift variance posting failed:", error);
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/pos/shifts/[id]/close error:", error);
    return errorResponse("Failed to close shift");
  }
}
