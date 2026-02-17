import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "VOIDED"]).optional(),
  notes: z.string().max(1000).optional(),
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

    const existing = await prisma.purchaseBill.findUnique({
      where: { id },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Purchase bill not found", 404);
    }

    const updated = await prisma.purchaseBill.update({
      where: { id },
      data: {
        status: validated.status,
        notes: validated.notes,
        issuedById: validated.status === "RECEIVED" ? session.user.id : existing.issuedById,
        issuedAt: validated.status === "RECEIVED" ? new Date() : existing.issuedAt,
      },
    });

    if (validated.status === "RECEIVED" && existing.status !== "RECEIVED") {
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType: "PURCHASE_BILL",
          sourceId: updated.id,
          entryDate: updated.billDate,
          description: `Purchase bill ${updated.billNumber}`,
          createdById: session.user.id,
          amount: updated.total,
          netAmount: updated.subTotal,
          taxAmount: updated.taxTotal,
          grossAmount: updated.total,
        });
      } catch (error) {
        console.error("[Accounting] Purchase bill auto-post failed:", error);
      }
    }

    if (
      validated.status === "VOIDED" &&
      existing.status !== "VOIDED" &&
      (existing.status === "RECEIVED" || existing.status === "PAID")
    ) {
      try {
        const postedEntry = await prisma.journalEntry.findFirst({
          where: {
            companyId: session.user.companyId,
            sourceType: "PURCHASE_BILL",
            sourceId: updated.id,
            status: "POSTED",
          },
          select: { id: true },
        });
        if (postedEntry) {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "PURCHASE_BILL",
            sourceId: `void:${updated.id}`,
            entryDate: new Date(),
            description: `Void purchase bill ${updated.billNumber}`,
            createdById: session.user.id,
            amount: updated.total,
            netAmount: updated.subTotal,
            taxAmount: updated.taxTotal,
            grossAmount: updated.total,
            invertDirection: true,
          });
        }
      } catch (error) {
        console.error("[Accounting] Purchase bill void reversal failed:", error);
      }
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/purchases/bills/[id] error:", error);
    return errorResponse("Failed to update purchase bill");
  }
}
