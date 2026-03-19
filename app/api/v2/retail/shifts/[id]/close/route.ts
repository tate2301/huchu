import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { canManageRetailTransactions, requireRetailSession } from "../../../_helpers";

const closeShiftSchema = z.object({
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

  try {
    const { id } = await params;
    const existing = await prisma.retailShift.findFirst({
      where: { id, companyId: session.user.companyId },
    });
    if (!existing) {
      return errorResponse("Shift not found", 404);
    }
    if (existing.status !== "OPEN") {
      return errorResponse("Only open shifts can be closed", 409);
    }
    const canManage = canManageRetailTransactions(session.user.role);
    if (existing.cashierId !== session.user.id && !canManage) {
      return errorResponse("Only the shift owner or a manager can close this shift", 403);
    }

    const body = await request.json();
    const input = closeShiftSchema.parse(body);
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
        console.error("[Accounting] Retail shift variance posting failed:", error);
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/retail/shifts/[id]/close error:", error);
    return errorResponse("Failed to close shift");
  }
}
