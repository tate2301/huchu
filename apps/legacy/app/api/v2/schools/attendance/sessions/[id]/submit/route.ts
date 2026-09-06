import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "submit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.schoolAttendanceSession.findUnique({
      where: { id },
      select: {
        id: true,
        companyId: true,
        status: true,
        termId: true,
        classId: true,
        streamId: true,
      },
    });
    if (!existing || existing.companyId !== companyId) {
      return errorResponse("Attendance session not found", 404);
    }
    if (existing.status !== "DRAFT") {
      return errorResponse("Only draft attendance sessions can be submitted", 400);
    }

    if (!isPrivilegedRole(session.user.role)) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) {
        return errorResponse("Active teacher profile is required to submit attendance", 403);
      }
      const assignment = await prisma.schoolClassSubject.findFirst({
        where: {
          companyId,
          teacherProfileId: profile.id,
          isActive: true,
          termId: existing.termId,
          classId: existing.classId,
          OR: [{ streamId: null }, { streamId: existing.streamId }],
        },
        select: { id: true },
      });
      if (!assignment) {
        return errorResponse("You are not assigned to this class/stream attendance scope", 403);
      }
    }

    const updated = await prisma.schoolAttendanceSession.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedByUserId: session.user.id,
      },
    });

    return successResponse(updated);
  } catch (error) {
    console.error(
      "[API] POST /api/v2/schools/attendance/sessions/[id]/submit error:",
      error,
    );
    return errorResponse("Failed to submit attendance session");
  }
}

