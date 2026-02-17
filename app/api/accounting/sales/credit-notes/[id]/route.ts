import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { recalcSalesInvoiceBalance } from "@/lib/accounting/balances";

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

    const existing = await prisma.creditNote.findUnique({
      where: { id },
      include: { invoice: { select: { companyId: true, status: true } } },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Credit note not found", 404);
    }

    if (validated.status === "ISSUED" && existing.invoice?.status === "DRAFT") {
      return errorResponse("Invoice must be issued before issuing a credit note", 400);
    }

    const updated = await prisma.creditNote.update({
      where: { id },
      data: {
        status: validated.status,
        reason: validated.reason,
        issuedById: validated.status === "ISSUED" ? session.user.id : existing.issuedById,
        issuedAt: validated.status === "ISSUED" ? new Date() : existing.issuedAt,
      },
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
        lines: true,
      },
    });

    if (validated.status && validated.status !== existing.status) {
      if (validated.status === "ISSUED") {
        try {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "SALES_CREDIT_NOTE",
            sourceId: updated.id,
            entryDate: updated.noteDate,
            description: `Credit note ${updated.noteNumber}`,
            createdById: session.user.id,
            amount: updated.total,
            netAmount: updated.subTotal,
            taxAmount: updated.taxTotal,
            grossAmount: updated.total,
          });
        } catch (error) {
          console.error("[Accounting] Sales credit note auto-post failed:", error);
        }
      }
      await recalcSalesInvoiceBalance(updated.invoiceId);
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/sales/credit-notes/[id] error:", error);
    return errorResponse("Failed to update credit note");
  }
}
