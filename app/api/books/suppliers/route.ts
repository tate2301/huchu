import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { guardBooks } from "@/lib/books/core";
import { partyData, partySchema } from "@/lib/books/party-form";
import { prisma } from "@/lib/prisma";

/** New supplier, from Books' drawer (on Record a bill and Pay a supplier). */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const input = partySchema.parse(await request.json());
    const { actor, refused } = await guardBooks(sessionResult.session, "draft.create", { kind: "bill" });
    if (refused) return refused;
    const vendor = await prisma.vendor.create({ data: { companyId: actor.companyId, ...partyData(input) } });
    return successResponse({ id: vendor.id, name: vendor.name }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse(error.issues[0]?.message ?? "Check the supplier's details.", 400, error.issues);
    console.error("[API] POST /api/books/suppliers error:", error);
    return errorResponse("Could not add the supplier");
  }
}
