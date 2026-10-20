import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { booksActor, canDo, VoidRefused } from "@/lib/books/core";
import { approveBill, BillRefusedError, checkBillFti, recordBill, voidBillPostings } from "@/lib/books/core/bills";
import { docLabel } from "@/lib/books/doc-number";

/**
 * A supplier's bill, moved through the Books core (books-final §4.8): a draft
 * is received (recorded: numbered, posted, its FTI kept), approved first by
 * the owner over the payments limit, its FDMS check set, or voided by mirror.
 * Paid is worked out from the payments on it; nothing goes back to draft.
 */
const updateSchema = z.object({
  status: z.enum(["DRAFT", "RECEIVED", "PAID", "VOIDED"]).optional(),
  notes: z.string().max(1000).optional(),
  /** Why it is voided: kept on the audit event. */
  reason: z.string().trim().min(3).max(300).optional(),
  /** D16: the supplier's FTI, and what FDMS said about it. */
  supplierFtiNumber: z.string().trim().max(60).nullable().optional(),
  fdmsStatus: z.enum(["NOT_CHECKED", "VALID", "NOT_VALID"]).optional(),
  /** The owner's approval of a bill over the payments limit, before it is recorded. */
  approve: z.literal(true).optional(),
  note: z.string().trim().max(1000).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const validated = updateSchema.parse(await request.json());
    const existing = await prisma.purchaseBill.findUnique({ where: { id } });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Purchase bill not found", 404);
    }
    const actor = await booksActor(session);
    const name = docLabel(existing.billNumber, "bill");

    // No arbitrary status jumps (books-final §4.1).
    if (validated.status === "PAID") {
      return errorResponse("Paid is worked out from the payments on it. Record a payment instead.", 409);
    }
    if (validated.status === "DRAFT" && existing.status !== "DRAFT") {
      return errorResponse(`${name} was received, so it cannot go back to draft. Void it instead.`, 409);
    }
    if (validated.status === "VOIDED" && existing.status === "VOIDED") {
      return errorResponse(`${name} is void already.`, 409);
    }

    if (validated.approve) {
      return successResponse(await approveBill(actor, id, validated.note));
    }

    if (validated.status === "RECEIVED") {
      const { bill } = await recordBill(actor, id, { supplierFtiNumber: validated.supplierFtiNumber, fdmsStatus: validated.fdmsStatus });
      return successResponse(validated.notes !== undefined ? await prisma.purchaseBill.update({ where: { id }, data: { notes: validated.notes } }) : bill);
    }

    if (validated.status === "VOIDED") {
      if (existing.status !== "DRAFT") {
        const allowed = canDo(actor, "void", { kind: "bill", ownerId: existing.issuedById });
        if (!allowed.allowed) return errorResponse(allowed.reason, 403);
        // A posted bill is voided by its mirror, through the core: the original stays, marked void,
        // and its payables line stops counting. A locked month refuses the void with nothing changed.
        try {
          await voidBillPostings(actor, existing, validated.reason ?? "Voided in Accounting, Purchases");
        } catch (error) {
          if (error instanceof VoidRefused) return errorResponse(`${name} was not voided: ${error.message}`, error.status);
          throw error;
        }
      } else {
        const allowed = canDo(actor, "draft.edit", { kind: "bill", ownerId: existing.createdById });
        if (!allowed.allowed) return errorResponse(allowed.reason, 403);
      }
      return successResponse(await prisma.purchaseBill.update({ where: { id }, data: { status: "VOIDED", notes: validated.notes } }));
    }

    if (validated.fdmsStatus || validated.supplierFtiNumber !== undefined) {
      await checkBillFti(actor, id, { status: validated.fdmsStatus ?? existing.fdmsStatus, supplierFtiNumber: validated.supplierFtiNumber });
    }
    if (validated.notes !== undefined) {
      const allowed = canDo(actor, "draft.edit", { kind: "bill", ownerId: existing.createdById });
      if (!allowed.allowed) return errorResponse(allowed.reason, 403);
      await prisma.purchaseBill.update({ where: { id }, data: { notes: validated.notes } });
    }
    return successResponse(await prisma.purchaseBill.findUniqueOrThrow({ where: { id } }));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BillRefusedError) return errorResponse(error.message, error.status);
    console.error("[API] PATCH /api/accounting/purchases/bills/[id] error:", error);
    return errorResponse("Failed to update purchase bill");
  }
}
