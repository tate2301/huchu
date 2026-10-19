import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, VoidRefused } from "@/lib/books/core";
import { approveCommission, CommissionRefused, payCommission, voidCommission } from "@/lib/books/core/commission";
import { prisma } from "@/lib/prisma";
import { requireCrmCapability } from "../../../_helpers";

/**
 * One commission entry's moves, through the Books core (D19, books-final §5.3):
 * approve (posts the expense, never the earner's own), mark paid (out of a
 * money account, or through the next pay run), void (a pending one, or an
 * approved one by mirror; never a paid one). No reopen, no status jumps.
 */
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("APPROVE"), notes: z.string().trim().max(500).optional() }),
  z.object({ action: z.literal("MARK_PAID"), bankAccountId: z.string().uuid().nullable().optional() }),
  z.object({ action: z.literal("VOID"), notes: z.string().trim().min(3).max(500).optional() }),
  z.object({ action: z.literal("REOPEN") }),
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const mayManage = await requireCrmCapability(session, "commissions.manage");
    const { id } = await params;

    const existing = await prisma.crmCommissionEntry.findFirst({ where: { id, companyId: session.user.companyId }, select: { id: true } });
    if (!existing) return errorResponse("Commission entry not found", 404);

    const body = bodySchema.parse(await request.json());
    const actor = await booksActor(session);
    switch (body.action) {
      case "APPROVE":
        if (!mayManage) return errorResponse("Manager access required", 403);
        return successResponse(await approveCommission(actor, id, { mayManage, note: body.notes }));
      case "MARK_PAID":
        return successResponse(await payCommission(actor, id, { bankAccountId: body.bankAccountId ?? null, mayManage }));
      case "VOID":
        return successResponse(await voidCommission(actor, id, { mayManage, reason: body.notes ?? "Voided in the CRM" }));
      case "REOPEN":
        return errorResponse("Commission is not reopened. Void it and work it out again.", 409);
    }
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    if (error instanceof CommissionRefused) return errorResponse(error.message, error.status);
    if (error instanceof VoidRefused) return errorResponse(error.message, error.status);
    console.error("[API] PATCH /api/v2/crm/commissions/entries/[id] error:", error);
    return errorResponse("Failed to update commission entry");
  }
}
