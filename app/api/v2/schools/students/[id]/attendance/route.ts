import { NextRequest, NextResponse } from "next/server";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One pupil's attendance, for their record page.
 *
 * `/schools/attendance` answers the office's question — which classes have not
 * sent a register in — and nothing answered the other one, which is the only
 * one anybody asks about a particular child: how often are they here. A pupil's
 * record could show their guardians, their enrolments and their fees, and not
 * whether they had been in school.
 *
 * Counted from SUBMITTED and LOCKED sessions only. A register a teacher has
 * started and not sent is half a register, and a percentage that moves while
 * somebody is still marking is one nobody can quote to a parent.
 */
const COUNTED_SESSION_STATUSES = ["SUBMITTED", "LOCKED"] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    if (!isValidUUID(id)) {
      return errorResponse("Invalid student ID", 400);
    }

    const companyId = session.user.companyId;
    const student = await prisma.schoolStudent.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!student) return errorResponse("Student not found", 404);

    const { searchParams } = new URL(request.url);
    const termId = searchParams.get("termId") ?? undefined;

    const where = {
      companyId,
      studentId: id,
      session: {
        status: { in: [...COUNTED_SESSION_STATUSES] },
        ...(termId ? { termId } : {}),
      },
    };

    const [byStatus, recent] = await Promise.all([
      prisma.schoolAttendanceSessionLine.groupBy({
        by: ["status"],
        where,
        _count: { _all: true },
      }),
      prisma.schoolAttendanceSessionLine.findMany({
        where,
        orderBy: { session: { attendanceDate: "desc" } },
        take: 30,
        select: {
          id: true,
          status: true,
          remarks: true,
          // `SchoolAttendanceSession` carries classId/streamId as plain
          // columns with no relation declared, so the names are looked up in
          // one follow-up query rather than joined here.
          session: {
            select: { id: true, attendanceDate: true, classId: true, streamId: true },
          },
        },
      }),
    ]);

    const classIds = [...new Set(recent.map((line) => line.session.classId))];
    const streamIds = [
      ...new Set(recent.map((line) => line.session.streamId).filter((v): v is string => Boolean(v))),
    ];
    const [classes, streams] = await Promise.all([
      classIds.length
        ? prisma.schoolClass.findMany({
            where: { companyId, id: { in: classIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
      streamIds.length
        ? prisma.schoolStream.findMany({
            where: { companyId, id: { in: streamIds } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);
    const classNames = new Map(classes.map((row) => [row.id, row.name]));
    const streamNames = new Map(streams.map((row) => [row.id, row.name]));

    const counts = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
    for (const row of byStatus) {
      counts[row.status] = row._count._all;
    }
    const marked = counts.PRESENT + counts.ABSENT + counts.LATE + counts.EXCUSED;

    // Late is here, not absent. A child who arrived at 08:20 was in school, and
    // counting them out of the roll makes a punctuality problem read as an
    // attendance one. Excused is counted in for the same reason a school does:
    // an authorised absence is still a day the child was accounted for.
    const attended = counts.PRESENT + counts.LATE + counts.EXCUSED;

    return successResponse({
      counts,
      marked,
      /** Null rather than 100 when nothing has been marked — see the record page. */
      rate: marked === 0 ? null : Math.round((attended / marked) * 1000) / 10,
      recent: recent.map((line) => ({
        id: line.id,
        status: line.status,
        remarks: line.remarks,
        date: line.session.attendanceDate,
        className: classNames.get(line.session.classId) ?? null,
        streamName: line.session.streamId
          ? (streamNames.get(line.session.streamId) ?? null)
          : null,
      })),
    });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/students/[id]/attendance error:", error);
    return errorResponse("Failed to load attendance");
  }
}
