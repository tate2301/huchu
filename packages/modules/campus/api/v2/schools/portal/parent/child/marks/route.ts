import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";

import { scopeToChild } from "../_guard";

/**
 * S-6.5 — the marks a school has released.
 *
 * Two gates, the same pair the report card uses (S-5.2): the sheet must be
 * PUBLISHED and the guardian must have `canReceiveAcademicResults`. A parent
 * reading a mark before the school has checked it is the failure the publish
 * window exists to prevent, and it is worse here than anywhere — a mark seen and
 * then corrected is a conversation with a child about a grade that never was.
 *
 * The pass mark travels with each subject rather than being applied here, because
 * whether 45 is a pass is a fact about the subject (S-1.3) and the screen should
 * not have to know a school-wide number that does not exist.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const scope = await scopeToChild({
      companyId: session.user.companyId,
      userId: session.user.id,
      role: session.user.role,
      studentId: searchParams.get("childId"),
      needs: "academic-results",
    });
    if (!scope.ok) return scope.response;

    const companyId = session.user.companyId;
    const termId = searchParams.get("termId");

    const lines = await prisma.schoolResultLine.findMany({
      where: {
        companyId,
        studentId: scope.studentId,
        sheet: { status: "PUBLISHED", ...(termId ? { termId } : {}) },
      },
      orderBy: [{ sheet: { term: { startDate: "desc" } } }, { subjectCode: "asc" }],
      select: {
        id: true,
        subjectCode: true,
        score: true,
        grade: true,
        remarks: true,
        sheet: {
          select: {
            id: true,
            title: true,
            publishedAt: true,
            term: { select: { id: true, name: true } },
          },
        },
      },
    });

    const subjects = await prisma.schoolSubject.findMany({
      where: { companyId, code: { in: lines.map((line) => line.subjectCode) } },
      select: { code: true, name: true, passMark: true },
    });
    const byCode = new Map(subjects.map((subject) => [subject.code, subject]));

    return successResponse({
      marks: lines.map((line) => ({
        id: line.id,
        subjectCode: line.subjectCode,
        subjectName: byCode.get(line.subjectCode)?.name ?? line.subjectCode,
        passMark: byCode.get(line.subjectCode)?.passMark ?? null,
        score: line.score,
        grade: line.grade,
        remarks: line.remarks,
        term: line.sheet?.term ?? null,
        publishedAt: line.sheet?.publishedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/parent/child/marks error:", error);
    return errorResponse("Failed to load marks");
  }
}
