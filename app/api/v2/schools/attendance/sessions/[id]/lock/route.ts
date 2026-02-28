import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isPrivilegedRole } from "@/lib/schools/governance-v2";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isPrivilegedRole(session.user.role)) {
      return errorResponse("Only school administrators can lock attendance sessions", 403);
    }

    const existing = await prisma.schoolAttendanceSession.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
      },
    });
    if (!existing || existing.companyId !== companyId) {
      return errorResponse("Attendance session not found", 404);
    }
    if (existing.status === "LOCKED") {
      return errorResponse("Attendance session is already locked", 400);
    }
    if (existing.status !== "SUBMITTED") {
      return errorResponse("Only submitted attendance sessions can be locked", 400);
    }

    const updated = await prisma.schoolAttendanceSession.update({
      where: { id },
      data: {
        status: "LOCKED",
        lockedAt: new Date(),
        lockedByUserId: session.user.id,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/attendance/sessions/[id]/lock error:",
      error,
    );
    return errorResponse("Failed to lock attendance session");
  }
}

