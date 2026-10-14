import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readJournal } from "@/lib/books/journals";
import { prisma } from "@/lib/prisma";

/** One journal's lines, and what posting it takes. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { id } = await params;
    const journal = await readJournal(prisma, sessionResult.session.user.companyId, id);
    if (!journal) return errorResponse("That journal is not in this workspace", 404);
    return successResponse(journal);
  } catch (error) {
    console.error("[API] GET /api/books/journals/[id] error:", error);
    return errorResponse("Could not read the journal");
  }
}
