import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, excludeLine } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

/** Exclude a statement line from matching, with a reason (D15). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const actor = await booksActor(sessionResult.session);
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(await request.json());
    const line = await excludeLine(actor, id, reason);
    return successResponse({ id: line.id });
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/bank/lines/[id]/exclude error:", error);
    return errorResponse("The line was not changed");
  }
}
