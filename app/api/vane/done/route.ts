import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { listVaneDone } from "@/lib/vane/lists";

const querySchema = z.object({
  days: z.coerce.number().int().refine((days) => [1, 7, 30].includes(days)).default(7),
  template: z.string().max(60).optional(),
});

/** What Vane did, a day at a time, and what people did next: today, the last 7 or the last 30 days. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = request.nextUrl.searchParams;
    const query = querySchema.safeParse({ days: params.get("days") ?? undefined, template: params.get("template") ?? undefined });
    if (!query.success) return errorResponse("Ask for today, the last 7 or the last 30 days", 400);
    return successResponse(
      await listVaneDone(
        prisma,
        { companyId: session.user.companyId, userId: session.user.id, role: session.user.role },
        query.data,
      ),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/done error:", error);
    return errorResponse("Could not read what Vane did");
  }
}
