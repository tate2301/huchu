import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { recalcPurchaseBillBalance } from "@/lib/accounting/balances";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "ISSUED", "VOIDED"]).optional(),
  reason: z.string().max(500).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = updateSchema.parse(body);

    const existing = await prisma.debitNote.findUnique({
      where: { id },
      include: { bill: { select: { companyId: true, status: true } } },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Debit note not found", 404);
    }

    if (validated.status === "ISSUED" && existing.bill?.status === "DRAFT") {
      return errorResponse("Bill must be received before issuing a debit note", 400);
    }

    const updated = await prisma.debitNote.update({
      where: { id },
      data: {
        status: validated.status,
        reason: validated.reason,
        issuedById: validated.status === "ISSUED" ? session.user.id : existing.issuedById,
        issuedAt: validated.status === "ISSUED" ? new Date() : existing.issuedAt,
      },
      include: {
        bill: { select: { billNumber: true, vendor: { select: { name: true } } } },
        lines: true,
      },
    });

    if (validated.status && validated.status !== existing.status) {
      if (validated.status === "ISSUED") {
        try {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "PURCHASE_DEBIT_NOTE",
            sourceId: updated.id,
            entryDate: updated.noteDate,
            description: `Debit note ${updated.noteNumber}`,
            createdById: session.user.id,
            amount: updated.total,
            netAmount: updated.subTotal,
            taxAmount: updated.taxTotal,
            grossAmount: updated.total,
          });
        } catch (error) {
          console.error("[Accounting] Purchase debit note auto-post failed:", error);
        }
      }
      await recalcPurchaseBillBalance(updated.billId);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/purchases/debit-notes/[id] error:", error);
    return errorResponse("Failed to update debit note");
  }
}
