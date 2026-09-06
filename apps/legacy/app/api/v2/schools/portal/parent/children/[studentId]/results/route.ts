import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import {
  canViewAnyPortalSubject,
  consentDeniedMessage,
  getGuardianChildLink,
  guardianMaySee,
  resolvePortalGuardian,
} from "@/lib/schools/portal-identity";

type RouteParams = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardianId = searchParams.get("guardianId");

    if (!canViewAnyPortalSubject(session.user.role)) {
      const resolution = await resolvePortalGuardian(
        {
          companyId,
          userId: session.user.id,
          role: session.user.role,
          requestedId: guardianId,
        },
        { select: { id: true } },
      );

      if (resolution.kind === "forbidden") {
        return errorResponse(
          "Cannot query results for a different guardian context",
          403,
        );
      }
      if (!resolution.subject) {
        return errorResponse("Guardian context not found", 404);
      }

      const link = await getGuardianChildLink({
        companyId,
        guardianId: resolution.subject.id,
        studentId,
      });
      if (!link) {
        return errorResponse("Student is not linked to this parent account", 403);
      }
      if (!guardianMaySee(link, "academic-results")) {
        return errorResponse(consentDeniedMessage("academic-results"), 403);
      }
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!student) return errorResponse("Student not found", 404);

    const resultLines = await prisma.schoolResultLine.findMany({
      where: {
        companyId,
        studentId,
        sheet: { status: "PUBLISHED" },
      },
      include: {
        sheet: {
          select: {
            id: true,
            title: true,
            status: true,
            publishedAt: true,
            term: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }],
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-parent-student-results",
        companyId,
        student,
        results: resultLines,
        summary: {
          lines: resultLines.length,
          averageScore:
            resultLines.length > 0
              ? resultLines.reduce((sum, line) => sum + line.score, 0) / resultLines.length
              : null,
        },
      },
    });
  } catch (error) {
    console.error(
      "[API] GET /api/v2/schools/portal/parent/children/[studentId]/results error:",
      error,
    );
    return errorResponse("Failed to fetch child result details");
  }
}
