import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { guardBooks, postMoney, voidMoney, VoidRefused } from "@/lib/books/core";

const updateSchema = z.object({
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "VOIDED"]).optional(),
  notes: z.string().max(1000).optional(),
  /** Why it is voided: kept on the audit event. */
  reason: z.string().trim().min(3).max(300).optional(),
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

    // No arbitrary status jumps (books-final §4.1): a draft is received, a received one is voided.
    // Paid is worked out from the payments, and nothing goes back to draft.
    if (validated.status === "PAID") {
      return errorResponse("Paid is worked out from the payments on it. Record a payment instead.", 409);
    }
    if (validated.status === "DRAFT" && existing.status !== "DRAFT") {
      return errorResponse(`${existing.billNumber} was received, so it cannot go back to draft. Void it instead.`, 409);
    }
    if (validated.status === "RECEIVED" && existing.status !== "DRAFT") {
      return errorResponse(`${existing.billNumber} is not a draft: it was received already.`, 409);
    }
    if (validated.status === "VOIDED" && existing.status === "VOIDED") {
      return errorResponse(`${existing.billNumber} is void already.`, 409);
    }
    const action = validated.status === "RECEIVED" ? "issue" : validated.status === "VOIDED" && existing.status !== "DRAFT" ? "void" : "draft.edit";
    const { actor, refused } = await guardBooks(session, action, { kind: "bill", ownerId: existing.issuedById });
    if (refused) return refused;

    // A posted bill is voided by its mirror, through the core: the original stays, marked void,
    // and its payables line stops counting. A locked month refuses the void with nothing changed.
    if (validated.status === "VOIDED" && existing.status !== "DRAFT") {
      const posted = await prisma.journalEntry.findFirst({
        where: { companyId: session.user.companyId, sourceType: "PURCHASE_BILL", sourceId: existing.id, status: "POSTED" },
        select: { id: true },
      });
      if (posted) {
        try {
          await voidMoney({
            companyId: session.user.companyId,
            sourceType: "PURCHASE_BILL",
            sourceId: existing.id,
            reason: validated.reason ?? "Voided in Accounting, Purchases",
            actor,
            eventType: "books.bill.voided",
          });
        } catch (error) {
          if (error instanceof VoidRefused) return errorResponse(`${existing.billNumber} was not voided: ${error.message}`, error.status);
          throw error;
        }
      }
    }

    const updated = await prisma.purchaseBill.update({
      where: { id },
      data: {
        status: validated.status === "RECEIVED" || validated.status === "VOIDED" ? validated.status : undefined,
        notes: validated.notes,
        issuedById: validated.status === "RECEIVED" ? session.user.id : existing.issuedById,
        issuedAt: validated.status === "RECEIVED" ? new Date() : existing.issuedAt,
      },
    });

    if (validated.status === "RECEIVED") {
      try {
        await postMoney(prisma, {
          companyId: session.user.companyId,
          sourceType: "PURCHASE_BILL",
          sourceId: updated.id,
          date: updated.billDate,
          description: `Purchase bill ${updated.billNumber}`,
          actor: { userId: session.user.id, role: session.user.role },
          amount: updated.total,
          netAmount: updated.subTotal,
          taxAmount: updated.taxTotal,
          grossAmount: updated.total,
        });
      } catch (error) {
        console.error("[Accounting] Purchase bill auto-post failed:", error);
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
