import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { doneQuerySchema, vaneDone } from "@/lib/vane/pages";

/** What Vane finished, by day, with what happened next: `?period=today|7d|30d&who=everyone|me&kind=`. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = new URL(request.url).searchParams;
    const query = doneQuerySchema.parse({
      period: params.get("period") ?? undefined,
      who: params.get("who") ?? undefined,
      kind: params.get("kind"),
    });
    return successResponse(
      await vaneDone(prisma, { companyId: session.user.companyId, userId: session.user.id, role: session.user.role, query }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/done error:", error);
    return errorResponse("Could not read what Vane did");
  }
}
