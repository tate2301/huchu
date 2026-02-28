import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getTeacherAssignments, getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("termId") ?? undefined;
    const classId = searchParams.get("classId") ?? undefined;

    if (isPrivilegedRole(session.user.role)) {
      return successResponse({
        success: true,
        data: {
          resource: "portal-teacher-classes",
          companyId,
          assignments: [],
          summary: { assignments: 0, classes: 0, terms: 0 },
        },
      });
    }

    const profile = await getTeacherProfile(companyId, session.user.id);
    if (!profile) {
      return successResponse({
        success: true,
        data: {
          resource: "portal-teacher-classes",
          companyId,
          assignments: [],
          summary: { assignments: 0, classes: 0, terms: 0 },
        },
      });
    }

    const assignments = await getTeacherAssignments(companyId, profile.id, {
      ...(termId ? { termId } : {}),
      ...(classId ? { classId } : {}),
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-teacher-classes",
        companyId,
        assignments,
        summary: {
          assignments: assignments.length,
          classes: new Set(assignments.map((assignment) => assignment.classId)).size,
          terms: new Set(assignments.map((assignment) => assignment.termId)).size,
        },
      },
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/teacher/me/classes error:", error);
    return errorResponse("Failed to fetch teacher class assignments");
  }
}

