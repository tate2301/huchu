import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

/**
 * Assignable CRM users for owner filters and assignment pickers.
 *
 * Deliberately readable by every CRM user, not just managers: a rep has to be
 * able to see who owns a lead and hand one over. Only the fields needed to
 * render a picker are returned.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const users = await prisma.user.findMany({
      where: { companyId: session.user.companyId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });

    return successResponse({ data: users });
  } catch (error) {
    console.error("[API] GET /api/v2/crm/team error:", error);
    return errorResponse("Failed to fetch team members");
  }
}
