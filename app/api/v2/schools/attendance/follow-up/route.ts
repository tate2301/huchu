import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { prisma } from "@/lib/prisma";

/**
 * Who has been away, and who has not been rung about it.
 *
 * The register board next door answers a different question — which classes
 * have not sent a register in — and it answers it from the class ladder
 * outward, because an absent register is an absence of a row. This is the
 * question that comes after: the registers are in, so who is repeatedly not in
 * them, and has anybody phoned home.
 *
 * Absence is counted over a window rather than reported per day because one
 * missed morning is a cold and six in a fortnight is a safeguarding matter, and
 * a screen that lists every absence separately buries the second in the first.
 * The window defaults to the last four school weeks.
 *
 * `EXCUSED` is deliberately excluded from the count and kept in the response.
 * A school that has been told a child is at a funeral has done its job; showing
 * that alongside the unexplained ones is how somebody sees the difference
 * without opening the record.
 */

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(180).default(28),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  /** Only pupils at or above this many unexplained absences. */
  threshold: z.coerce.number().int().min(1).max(100).default(2),
  search: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "view");
    if (denied) return errorResponse(denied, 403);

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      days: searchParams.get("days") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      streamId: searchParams.get("streamId") ?? undefined,
      threshold: searchParams.get("threshold") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const companyId = session.user.companyId;
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - query.days);

    // The sessions in the window, narrowed by class before any line is read —
    // a school year is a lot of lines and all but one class's are irrelevant.
    const sessions = await prisma.schoolAttendanceSession.findMany({
      where: {
        companyId,
        attendanceDate: { gte: since },
        ...(query.classId ? { classId: query.classId } : {}),
        ...(query.streamId ? { streamId: query.streamId } : {}),
      },
      select: { id: true, attendanceDate: true, classId: true, streamId: true },
    });

    if (sessions.length === 0) {
      return successResponse({
        rows: [],
        summary: { pupils: 0, absences: 0, unexplained: 0, sessions: 0 },
        window: { days: query.days, since: since.toISOString() },
      });
    }

    const sessionById = new Map(sessions.map((entry) => [entry.id, entry]));

    const lines = await prisma.schoolAttendanceSessionLine.findMany({
      where: {
        companyId,
        sessionId: { in: sessions.map((entry) => entry.id) },
        status: { in: ["ABSENT", "EXCUSED"] },
      },
      select: {
        id: true,
        status: true,
        remarks: true,
        sessionId: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            isBoarding: true,
            currentClass: { select: { id: true, code: true, name: true } },
            currentStream: { select: { id: true, code: true, name: true } },
            guardianLinks: {
              where: { isPrimary: true },
              take: 1,
              select: {
                relationship: true,
                guardian: {
                  select: { id: true, firstName: true, lastName: true, phone: true },
                },
              },
            },
          },
        },
      },
    });

    /** One row per pupil, not per absence — the pupil is who gets rung. */
    type Row = {
      studentId: string;
      name: string;
      admissionNo: string | null;
      isBoarding: boolean;
      className: string | null;
      streamName: string | null;
      unexplained: number;
      excused: number;
      lastAbsent: string | null;
      remarks: string[];
      guardian: {
        id: string;
        name: string;
        phone: string | null;
        relationship: string;
      } | null;
    };

    const byStudent = new Map<string, Row>();

    for (const line of lines) {
      const student = line.student;
      if (!student) continue;
      if (query.search) {
        const needle = query.search.toLowerCase();
        const haystack =
          `${student.firstName} ${student.lastName} ${student.admissionNo ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }

      const attendanceDate = sessionById.get(line.sessionId)?.attendanceDate ?? null;
      const link = student.guardianLinks[0];

      const existing = byStudent.get(student.id) ?? {
        studentId: student.id,
        name: `${student.lastName}, ${student.firstName}`,
        admissionNo: student.admissionNo,
        isBoarding: student.isBoarding,
        className: student.currentClass?.name ?? null,
        streamName: student.currentStream?.name ?? null,
        unexplained: 0,
        excused: 0,
        lastAbsent: null,
        remarks: [],
        guardian: link?.guardian
          ? {
              id: link.guardian.id,
              name: `${link.guardian.firstName} ${link.guardian.lastName}`,
              phone: link.guardian.phone,
              relationship: link.relationship,
            }
          : null,
      };

      if (line.status === "EXCUSED") existing.excused += 1;
      else existing.unexplained += 1;

      if (line.remarks) existing.remarks.push(line.remarks);

      const iso = attendanceDate ? attendanceDate.toISOString() : null;
      if (iso && (!existing.lastAbsent || iso > existing.lastAbsent)) {
        existing.lastAbsent = iso;
      }

      byStudent.set(student.id, existing);
    }

    const rows = [...byStudent.values()]
      .filter((row) => row.unexplained >= query.threshold)
      // Worst first, then most recent — the order somebody works down a list of
      // calls to make, rather than alphabetical, which buries the urgent ones.
      .sort(
        (a, b) =>
          b.unexplained - a.unexplained ||
          (b.lastAbsent ?? "").localeCompare(a.lastAbsent ?? ""),
      );

    return successResponse({
      rows,
      summary: {
        pupils: rows.length,
        absences: rows.reduce((total, row) => total + row.unexplained + row.excused, 0),
        unexplained: rows.reduce((total, row) => total + row.unexplained, 0),
        sessions: sessions.length,
      },
      window: { days: query.days, since: since.toISOString() },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/attendance/follow-up error:", error);
    return errorResponse("Failed to fetch the absence follow-up list");
  }
}
