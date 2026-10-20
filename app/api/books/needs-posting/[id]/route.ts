import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { mapAndRetry, NeedsPostingRefused, postInThisMonth } from "@/lib/books/needs-posting-actions";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("map"), accountId: z.string().uuid() }),
  z.object({ action: z.literal("this-month") }),
]);

/**
 * One posting in Needs posting: map the account it is missing and retry (the
 * owner or the accountant), or post money held for a closed month in this
 * month (the owner).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    const { id } = await params;
    const body = actionSchema.parse(await request.json().catch(() => null));
    const may = canDo(actor, body.action === "map" ? "posting.map" : "posting.redate");
    if (!may.allowed) return errorResponse(may.reason, 403);
    return successResponse(body.action === "map" ? await mapAndRetry(actor, id, body.accountId) : await postInThisMonth(actor, id));
  } catch (error) {
    if (error instanceof NeedsPostingRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) return errorResponse("Validation failed", 400, error.issues);
    console.error("[API] POST /api/books/needs-posting/[id] error:", error);
    return errorResponse("Could not change the posting");
  }
}
