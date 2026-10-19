import { NextRequest, NextResponse } from "next/server";

import { errorResponse, getPaginationParams, paginationResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { claimSchema, createClaim } from "@/lib/books/core/claims";
import { refusedResponse } from "@/lib/books/core/refused";
import { prisma } from "@/lib/prisma";

/** Expense claims (D13): everyone's for those who keep the books, one's own for everyone else; and a new draft. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const actor = await booksActor(sessionResult.session);
    const everyone = canDo(actor, "approve", { kind: "claim" }).allowed;
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);
    const where = { companyId: actor.companyId, ...(everyone ? {} : { claimantId: actor.userId }), ...(status ? { status: status as never } : {}) };
    const [rows, total] = await Promise.all([
      prisma.expenseClaim.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: limit, include: { claimant: { select: { id: true, name: true } }, lines: { orderBy: { sortOrder: "asc" } } } }),
      prisma.expenseClaim.count({ where }),
    ]);
    return successResponse(paginationResponse(rows, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/books/claims error:", error);
    return errorResponse("Could not load the claims");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = claimSchema.parse(await request.json());
    return successResponse(await createClaim(await booksActor(sessionResult.session), input), 201);
  } catch (error) {
    const refused = refusedResponse(error, "Add what was spent, with an amount for each.");
    if (refused) return refused;
    console.error("[API] POST /api/books/claims error:", error);
    return errorResponse("Could not save the claim");
  }
}
