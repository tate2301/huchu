import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor } from "@/lib/books/core";
import { approveVoucher, voidVoucher } from "@/lib/books/core/petty-cash";
import { refusedResponse } from "@/lib/books/core/refused";

/** A voucher's moves: approve (it posts) or send back; void a posted one. */
const actionSchema = z.object({
  action: z.enum(["approve", "reject", "void"]),
  note: z.string().trim().max(1000).nullable().optional(),
  reason: z.string().trim().min(3).max(300).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const body = actionSchema.parse(await request.json());
    const actor = await booksActor(sessionResult.session);
    if (body.action === "void") {
      if (!body.reason) return errorResponse("Say why, in a few words. The reason is kept in the audit trail.", 400);
      return successResponse(await voidVoucher(actor, id, body.reason));
    }
    return successResponse(await approveVoucher(actor, id, { approve: body.action === "approve", note: body.note }));
  } catch (error) {
    const refused = refusedResponse(error);
    if (refused) return refused;
    console.error("[API] PATCH /api/books/petty-cash/[id] error:", error);
    return errorResponse("Could not change the voucher");
  }
}
