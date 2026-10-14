import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { VANE_SUBJECTS, vaneOnRecord } from "@/lib/vane/panel";

const querySchema = z.object({ type: z.enum(VANE_SUBJECTS), id: z.string().min(1).max(60) });

/** Vane's open cards about one record (`?type=CrmDeal&id=…`), for that record's page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!query.success) return errorResponse("Name the record", 400);
    return successResponse(
      await vaneOnRecord(prisma, {
        companyId: session.user.companyId,
        userId: session.user.id,
        role: session.user.role,
        subjectType: query.data.type,
        subjectId: query.data.id,
      }),
    );
  } catch (error) {
    console.error("[API] GET /api/vane/record error:", error);
    return errorResponse("Could not read what Vane has on this record");
  }
}
