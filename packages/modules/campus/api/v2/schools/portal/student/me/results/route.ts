import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { resolvePortalStudent } from "../../../../../../../portal-identity";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const requestedStudentId = searchParams.get("studentId");

    const resolution = await resolvePortalStudent(
      {
        companyId,
        userId: session.user.id,
        role: session.user.role,
        requestedId: requestedStudentId,
      },
      {
        select: {
          id: true,
          studentNo: true,
          firstName: true,
          lastName: true,
        },
      },
    );
    if (resolution.kind === "forbidden") {
      return errorResponse("Student portal does not allow overriding self scope", 403);
    }
    const student = resolution.subject;
    if (!student) return errorResponse("Student profile not found", 404);

    const resultLines = await prisma.schoolResultLine.findMany({
      where: {
        companyId,
        studentId: student.id,
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
      take: 300,
    });

    return successResponse({
      success: true,
      data: {
        resource: "portal-student-me-results",
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
    console.error("[API] GET /api/v2/schools/portal/student/me/results error:", error);
    return errorResponse("Failed to fetch student result records");
  }
}

