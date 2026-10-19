import { NextRequest, NextResponse } from "next/server";


import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, unmatchLine } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

/** Unmatch a line: it goes back to To match. Refused in a closed reconciliation. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const actor = await booksActor(sessionResult.session);
    
    const line = await unmatchLine(actor, id);
    return successResponse({ id: line.id });
  } catch (error) {
    const refusal = refusedResponse(error, "Say why, in a few words");
    if (refusal) return refusal;
    console.error("[API] POST /api/books/bank/lines/[id]/unmatch error:", error);
    return errorResponse("The line was not changed");
  }
}
