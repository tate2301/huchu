import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, setVoidGrant, tierOf, voidGrantHolders, voidGrantOf } from "@/lib/books/core";
import { refusedResponse } from "@/lib/books/core/refused";

/** "May void and revise posted documents" (books-final §2.3): who holds it, and the owner giving or taking it. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    if (tierOf(actor) !== "owner") return errorResponse("Only the owner sees who may void and revise.", 403);
    // One person's grant, for their page in Management → Users.
    const userId = request.nextUrl.searchParams.get("userId");
    if (userId) {
      const grant = await voidGrantOf(actor.companyId, userId);
      return grant ? successResponse(grant) : errorResponse("That person is not in this workspace.", 404);
    }
    return successResponse({ holders: await voidGrantHolders(actor.companyId) });
  } catch (error) {
    console.error("[API] GET /api/books/core/grants error:", error);
    return errorResponse("Could not read who may void and revise");
  }
}

const schema = z.object({ userId: z.string().min(1), allowed: z.boolean() });

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const body = schema.parse(await request.json().catch(() => null));
    return successResponse(await setVoidGrant(await booksActor(sessionResult.session), body.userId, body.allowed));
  } catch (error) {
    const refusal = refusedResponse(error);
    if (refusal) return refusal;
    console.error("[API] POST /api/books/core/grants error:", error);
    return errorResponse("Nothing was changed");
  }
}
