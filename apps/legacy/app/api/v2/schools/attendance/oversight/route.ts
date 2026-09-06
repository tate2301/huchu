import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getSchoolDay } from "@/lib/schools/calendar";

const querySchema = z.object({
  date: z.string().date(),
  classId: z.string().uuid().optional(),
});

/**
 * The register board: the class ladder for one day, with what came in beside it.
 *
 * A separate route from `/api/v2/schools/attendance/sessions` rather than a flag
 * on it, because it answers the opposite question. The sessions list can only
 * ever return registers that *exist*; the office's question at 09:15 is which
 * ones do not, and absence is not a row. So this reads the ladder outward — every
 * class, then the sessions against it — and returns the missing ones as rows.
 *
 * It also carries the two things the board cannot be read without. The school-day
 * verdict, because a public holiday would otherwise read as every class failing
 * to send a register, which is the wrong thing to chase. And the form teacher,
 * because a missing register with nobody attached to it cannot be chased at all —
 * the school keeps that in `isClassTeacher` on the profile, so it is derived here
 * from the active class-subject assignments rather than made a client's problem.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      date: searchParams.get("date") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
    });

    const day = new Date(`${query.date}T00:00:00.000Z`);
    const week = weekOf(day);

    const [schoolDay, classes, sessions, weekSessions, rolls, assignments] =
      await Promise.all([
        getSchoolDay(companyId, day),
        prisma.schoolClass.findMany({
          where: { companyId, ...(query.classId ? { id: query.classId } : {}) },
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            streams: {
              select: { id: true, code: true, name: true },
              orderBy: { name: "asc" },
            },
          },
          orderBy: [{ level: "asc" }, { name: "asc" }],
          take: 200,
        }),
        prisma.schoolAttendanceSession.findMany({
          where: {
            companyId,
            attendanceDate: day,
            ...(query.classId ? { classId: query.classId } : {}),
          },
          select: {
            id: true,
            classId: true,
            streamId: true,
            status: true,
            submittedAt: true,
            updatedAt: true,
          },
          take: 500,
        }),
        // Monday to Friday, for the strip beside the board. One grouped count
        // rather than five day queries.
        prisma.schoolAttendanceSession.groupBy({
          by: ["attendanceDate", "classId"],
          where: {
            companyId,
            attendanceDate: { gte: week[0], lte: week[week.length - 1] },
          },
          _count: { _all: true },
        }),
        prisma.schoolStudent.groupBy({
          by: ["currentClassId"],
          where: {
            companyId,
            status: "ACTIVE",
            ...(query.classId ? { currentClassId: query.classId } : {}),
          },
          _count: { _all: true },
        }),
        // Who to chase. A form teacher is a teacher with `isClassTeacher` who
        // actually teaches the class this term; a class with several only names
        // the first, which is the person the office rings.
        prisma.schoolClassSubject.findMany({
          where: {
            companyId,
            isActive: true,
            teacherProfile: { isClassTeacher: true, isActive: true },
            ...(query.classId ? { classId: query.classId } : {}),
          },
          select: {
            classId: true,
            teacherProfile: {
              select: { id: true, user: { select: { id: true, name: true } } },
            },
          },
          orderBy: [{ classId: "asc" }, { createdAt: "asc" }],
          take: 500,
        }),
      ]);

    const lineCounts =
      sessions.length > 0
        ? await prisma.schoolAttendanceSessionLine.groupBy({
            by: ["sessionId", "status"],
            where: { companyId, sessionId: { in: sessions.map((row) => row.id) } },
            _count: { _all: true },
          })
        : [];

    const presentBySession = new Map<string, { present: number; marked: number }>();
    for (const group of lineCounts) {
      const current = presentBySession.get(group.sessionId) ?? { present: 0, marked: 0 };
      current.marked += group._count._all;
      // Late is still in the room. A register that counted only PRESENT would
      // report a punctuality figure under an attendance heading.
      if (group.status === "PRESENT" || group.status === "LATE") {
        current.present += group._count._all;
      }
      presentBySession.set(group.sessionId, current);
    }

    const rollByClass = new Map(
      rolls
        .filter((row) => row.currentClassId !== null)
        .map((row) => [row.currentClassId as string, row._count._all]),
    );
    const teacherByClass = new Map<
      string,
      { profileId: string; userId: string; name: string }
    >();
    for (const assignment of assignments) {
      if (teacherByClass.has(assignment.classId)) continue;
      teacherByClass.set(assignment.classId, {
        profileId: assignment.teacherProfile.id,
        userId: assignment.teacherProfile.user.id,
        name: assignment.teacherProfile.user.name,
      });
    }

    const rows = classes.map((schoolClass) => {
      const mine = sessions.filter((row) => row.classId === schoolClass.id);
      const counted = mine.reduce(
        (total, row) => {
          const seen = presentBySession.get(row.id);
          return {
            present: total.present + (seen?.present ?? 0),
            marked: total.marked + (seen?.marked ?? 0),
          };
        },
        { present: 0, marked: 0 },
      );
      // A class that started a register and did not send it is not the same
      // problem as one that never opened it, so the three states are distinct.
      const state =
        mine.length === 0
          ? "MISSING"
          : mine.every((row) => row.status !== "DRAFT")
            ? "SUBMITTED"
            : "DRAFT";
      const lastAt = mine.reduce<Date | null>((latest, row) => {
        const at = row.submittedAt ?? row.updatedAt;
        return !latest || at > latest ? at : latest;
      }, null);

      return {
        classId: schoolClass.id,
        classCode: schoolClass.code,
        className: schoolClass.name,
        level: schoolClass.level,
        streams: schoolClass.streams,
        formTeacher: teacherByClass.get(schoolClass.id) ?? null,
        sessions: mine.length,
        state,
        present: counted.present,
        marked: counted.marked,
        onRoll: rollByClass.get(schoolClass.id) ?? 0,
        lastActivityAt: lastAt,
      };
    });

    const withRegister = rows.filter((row) => row.state !== "MISSING").length;

    return successResponse({
      date: query.date,
      schoolDay,
      rows,
      summary: {
        yearGroups: rows.length,
        withRegister,
        missing: rows.length - withRegister,
        present: rows.reduce((total, row) => total + row.present, 0),
        marked: rows.reduce((total, row) => total + row.marked, 0),
        onRoll: rows.reduce((total, row) => total + row.onRoll, 0),
      },
      week: week.map((date) => {
        const iso = date.toISOString().slice(0, 10);
        const classIds = new Set(
          weekSessions
            .filter((row) => row.attendanceDate.toISOString().slice(0, 10) === iso)
            .map((row) => row.classId),
        );
        return { date: iso, withRegister: classIds.size, yearGroups: rows.length };
      }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/attendance/oversight error:", error);
    return errorResponse("Failed to load the register board");
  }
}

/** Monday to Friday of the week containing `day`, in UTC. A school week. */
function weekOf(day: Date) {
  const start = new Date(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()),
  );
  const offset = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - offset);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}
