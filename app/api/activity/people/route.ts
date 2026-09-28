import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { isOrgAdminRole } from "@/lib/preferences/nav";
import { prisma } from "@/lib/prisma";

/** The people the log's Person filter offers: everyone in the workspace, by name. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!isOrgAdminRole(session.user.role)) {
      return errorResponse("Only managers can review the activity log", 403);
    }

    const users = await prisma.user.findMany({
      where: { companyId: session.user.companyId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    return successResponse({
      people: users.map((user) => ({ id: user.id, name: user.name || user.email })),
    });
  } catch (error) {
    console.error("[API] GET /api/activity/people error:", error);
    return errorResponse("Failed to load people");
  }
}
