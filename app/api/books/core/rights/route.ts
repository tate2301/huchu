import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, isUndoKind, undoRights } from "@/lib/books/core";

/**
 * `GET /api/books/core/rights?kind=invoice` (books-final §5.13): which bulk
 * undo a list's selection offers this person, by their role and the owner's
 * grant. Each row is checked again when the action runs.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const kind = request.nextUrl.searchParams.get("kind") ?? "";
    if (!isUndoKind(kind)) return errorResponse("There is no such kind of document.", 404);
    return successResponse(undoRights(await booksActor(sessionResult.session), kind));
  } catch (error) {
    console.error("[API] GET /api/books/core/rights error:", error);
    return errorResponse("Could not read what you may do");
  }
}
