import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { acceptProposals } from "@/lib/books/bank";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({ lineIds: z.array(z.string().uuid()).min(1).max(500) });

/** Accept Vane's matches: a person pressed it; each match is checked again and recorded. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return errorResponse("Choose the lines to accept", 400);
    return successResponse(
      await acceptProposals(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        lineIds: body.data.lineIds,
      }),
    );
  } catch (error) {
    console.error("[API] POST /api/books/bank/accept error:", error);
    return errorResponse("The matches were not accepted");
  }
}
