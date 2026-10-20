import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, voidDocument } from "@/lib/books/core";
import { decideClaim, reimburseClaim, submitClaim, voidClaimReimbursement } from "@/lib/books/core/claims";
import { refusedResponse } from "@/lib/books/core/refused";

/** A claim's moves (D13, books-final §4.12): submit, approve or reject, reimburse, void either. */
const actionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "reimburse", "void", "void-reimbursement"]),
  note: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
  bankAccountId: z.string().uuid().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    switch (body.action) {
      case "submit":
        return successResponse(await submitClaim(actor, id));
      case "approve":
      case "reject":
        return successResponse((await decideClaim(actor, id, { approve: body.action === "approve", note: body.note })).claim);
      case "reimburse":
        if (!body.bankAccountId) return errorResponse("Choose the account it is paid from.", 400);
        return successResponse((await reimburseClaim(actor, id, { bankAccountId: body.bankAccountId })).claim);
      case "void":
      case "void-reimbursement":
        if (!body.reason) return errorResponse("Say why, in a few words. The reason is kept in the audit trail.", 400);
        return successResponse(body.action === "void" ? await voidDocument(actor, "claim", id, { reason: body.reason }) : await voidClaimReimbursement(actor, id, body.reason));
    }
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] PATCH /api/books/claims/[id] error:", error);
    return errorResponse("Could not change the claim");
  }
}
