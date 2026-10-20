import { NextRequest, NextResponse } from "next/server";


import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, includeLine } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

/** Put an excluded line back in To match. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const actor = await booksActor(sessionResult.session);
    
    const line = await includeLine(actor, id);
    return successResponse({ id: line.id });
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/bank/lines/[id]/include error:", error);
    return errorResponse("The line was not changed");
  }
}
