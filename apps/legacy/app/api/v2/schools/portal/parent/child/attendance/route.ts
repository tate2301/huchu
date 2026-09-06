import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";

import { scopeToChild } from "../_guard";

/**
 * S-6.4 — was my child in school, and what happened on that day.
 *
 * The whole term's register for this child, day by day, newest first. A summary
 * without the days behind it cannot answer the question a parent actually has —
 * "you marked Tendai away on the 14th, why?" — so every session line comes back
 * with its date and its status, and the screen shows the summary above them.
 *
 * Attendance is not consent-gated: a school that will not tell a parent whether
 * their child came to school is not a case the flags describe. Fees and results
 * are the two the flags cover, and both are gated.
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
      needs: null,
    });
    if (!scope.ok) return scope.response;

    const termId = searchParams.get("termId");
    const lines = await prisma.schoolAttendanceSessionLine.findMany({
      where: {
        companyId: session.user.companyId,
        studentId: scope.studentId,
        ...(termId ? { session: { termId } } : {}),
      },
      orderBy: { session: { attendanceDate: "desc" } },
      take: 200,
      select: {
        id: true,
        status: true,
        remarks: true,
        // `SchoolAttendanceSession` holds `classId` and `termId` as plain columns
        // with no relations declared, so the names are looked up once below rather
        // than joined per line.
        session: {
          select: {
            id: true,
            attendanceDate: true,
            status: true,
            classId: true,
            termId: true,
          },
        },
      },
    });

    const [classes, terms] = await Promise.all([
      prisma.schoolClass.findMany({
        where: {
          companyId: session.user.companyId,
          id: { in: [...new Set(lines.map((line) => line.session.classId))] },
        },
        select: { id: true, name: true },
      }),
      prisma.schoolTerm.findMany({
        where: {
          companyId: session.user.companyId,
          id: { in: [...new Set(lines.map((line) => line.session.termId))] },
        },
        select: { id: true, name: true },
      }),
    ]);
    const className = new Map(classes.map((row) => [row.id, row.name]));
    const termName = new Map(terms.map((row) => [row.id, row.name]));

    return successResponse({
      days: lines.map((line) => ({
        id: line.id,
        date: line.session.attendanceDate.toISOString().slice(0, 10),
        status: line.status,
        remarks: line.remarks,
        // Whether the register itself is finished. A day still in DRAFT is a
        // register a teacher has not submitted, and telling a parent their child
        // was absent off an unsubmitted register is how an argument starts.
        register: line.session.status,
        className: className.get(line.session.classId) ?? null,
        term: { id: line.session.termId, name: termName.get(line.session.termId) ?? "" },
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/portal/parent/child/attendance error:", error);
    return errorResponse("Failed to load attendance");
  }
}
