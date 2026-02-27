import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { isPrivilegedRole } from "@/lib/schools/governance-v2";

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

    if (!isPrivilegedRole(session.user.role)) {
      const guardian = await prisma.schoolGuardian.findFirst({
        where: {
          companyId,
          ...(session.user.email
            ? { email: { equals: session.user.email, mode: "insensitive" } }
            : { id: "__none__" }),
        },
        select: { id: true },
      });
      if (!guardian) {
        return errorResponse("Guardian context not found", 404);
      }
      if (guardianId && guardianId !== guardian.id) {
        return errorResponse("Cannot query results for a different guardian context", 403);
      }

      const link = await prisma.schoolStudentGuardian.findFirst({
        where: {
          companyId,
          studentId,
          guardianId: guardian.id,
        },
        select: { id: true, canReceiveAcademicResults: true },
      });
      if (!link) {
        return errorResponse("Student is not linked to this parent account", 403);
      }
      if (!link.canReceiveAcademicResults) {
        return errorResponse("Academic visibility is disabled for this parent link", 403);
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
