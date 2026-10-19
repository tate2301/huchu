import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { decideRequisitions } from "@/lib/books/requisition-decide";

/**
 * Approve or reject requisitions from Books (BkRequisitions' selection,
 * BkRequisition, BkRequisitionPhone): each the CRM's or the shop's own way,
 * never your own, over the limit only the owner. Answers what was done and
 * what was skipped, with why.
 */
const bodySchema = z
  .object({
    ids: z.array(z.string().uuid()).min(1).max(200),
    approve: z.boolean(),
    note: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((body) => body.approve || (body.note?.trim().length ?? 0) >= 3, { message: "Say why it is not approved: the requester is told.", path: ["note"] });

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Choose the requisitions.", 400, parsed.error.issues);
    const { refused } = await guardBooks(sessionResult.session, "approve", { kind: "requisition" });
    if (refused) return refused;
    return successResponse(await decideRequisitions(sessionResult.session, parsed.data.ids, { approve: parsed.data.approve, note: parsed.data.note ?? null }));
  } catch (error) {
    console.error("[API] POST /api/books/requisitions/decide error:", error);
    return errorResponse("Could not decide the requisitions");
  }
}
