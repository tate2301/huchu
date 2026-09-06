import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { getTeacherProfile } from "@/lib/schools/governance-v2";
import { formatMinute } from "@/lib/schools/timetable-format";

const querySchema = z.object({
  weekStart: z.string().date().optional(),
  termId: z.string().uuid().optional(),
});

/** Midnight UTC, matching how `@db.Date` columns are stored and compared. */
function utcDay(value: Date) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

/** ISO-8601 day of week: Monday is 1, Sunday is 7 — what slots are keyed by. */
function isoDayOfWeek(value: Date) {
  const day = value.getUTCDay();
  return day === 0 ? 7 : day;
}

/** The Monday on or before a date. A school week starts on Monday. */
function mondayOf(value: Date) {
  const day = utcDay(value);
  return new Date(day.getTime() - (isoDayOfWeek(day) - 1) * 86_400_000);
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * A teacher's own week, as a grid rather than a list.
 *
 * `me/today` answers "what am I teaching next"; this answers "what does my week
 * look like", which is a different question and a different shape. The two are
 * not the same query run five times: a week needs the periods even where the
 * teacher is free, because a week that hid its free periods would read as a
 * shorter week than it is, and "when am I free on Wednesday" is what a
 * timetable is opened for.
 *
 * Timetable slots are a weekly pattern, so the lessons repeat for every week of
 * the term. Cover is not: it is arranged against one lesson on one date, so it
 * is fetched for the week being looked at and merged on top. That is also why
 * the week's dates travel with the response — the client must not be the one
 * deciding which Monday the server meant.
 *
 * Scoped to the caller's own profile rather than taking a `teacherProfileId`.
 * The admin route at `/api/v2/schools/timetable` takes one and is the right
 * door for the office; a teacher reads their own week and nobody else's.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      weekStart: searchParams.get("weekStart") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
    });

    const profile = await getTeacherProfile(companyId, session.user.id);
    if (!profile) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const found = query.termId
      ? await prisma.schoolTerm.findFirst({
          where: { id: query.termId, companyId },
          select: { id: true, code: true, name: true },
        })
      : await getCurrentTerm(companyId);
    const term = found ? { id: found.id, code: found.code, name: found.name } : null;

    // The school's today, not the tablet's. A shared device in a staffroom may
    // be set to anything, and which day is highlighted is the school's fact.
    const today = utcDay(new Date());
    const weekStart = query.weekStart ? utcDay(new Date(query.weekStart)) : mondayOf(today);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);

    if (!term) {
      return successResponse({
        term: null,
        weekStart: isoDate(weekStart),
        today: isoDate(today),
        days: [],
        periods: [],
        lessons: [],
        cover: [],
      });
    }

    const [periods, slots, cover] = await Promise.all([
      prisma.schoolPeriod.findMany({
        where: { companyId, OR: [{ termId: term.id }, { termId: null }] },
        select: {
          id: true,
          code: true,
          name: true,
          startMinute: true,
          endMinute: true,
          isTeaching: true,
          sequence: true,
        },
        orderBy: [{ sequence: "asc" }, { startMinute: "asc" }],
      }),
      prisma.schoolTimetableSlot.findMany({
        where: { companyId, termId: term.id, teacherProfileId: profile.id },
        select: {
          id: true,
          dayOfWeek: true,
          periodId: true,
          classSubjectId: true,
          classId: true,
          class: { select: { code: true, name: true } },
          stream: { select: { name: true } },
          room: { select: { name: true } },
          classSubject: {
            select: { subject: { select: { code: true, name: true } } },
          },
        },
      }),
      prisma.schoolCoverAssignment.findMany({
        where: {
          companyId,
          coveringTeacherProfileId: profile.id,
          lessonPlan: { lessonDate: { gte: weekStart, lt: weekEnd } },
        },
        select: {
          id: true,
          reason: true,
          lessonPlan: {
            select: {
              id: true,
              lessonDate: true,
              topic: true,
              slot: {
                select: { periodId: true, room: { select: { name: true } } },
              },
              classSubject: {
                select: {
                  id: true,
                  class: { select: { name: true } },
                  stream: { select: { name: true } },
                  subject: { select: { name: true } },
                  teacherProfile: { select: { user: { select: { name: true } } } },
                },
              },
            },
          },
        },
      }),
    ]);

    const lessons = slots.map((slot) => ({
      slotId: slot.id,
      dayOfWeek: slot.dayOfWeek,
      periodId: slot.periodId,
      classSubjectId: slot.classSubjectId,
      classId: slot.classId,
      classCode: slot.class.code,
      className: slot.class.name,
      streamName: slot.stream?.name ?? null,
      subjectCode: slot.classSubject.subject.code,
      subjectName: slot.classSubject.subject.name,
      roomName: slot.room?.name ?? null,
    }));

    const covering = cover.map((row) => ({
      coverId: row.id,
      lessonPlanId: row.lessonPlan.id,
      date: isoDate(row.lessonPlan.lessonDate),
      dayOfWeek: isoDayOfWeek(row.lessonPlan.lessonDate),
      periodId: row.lessonPlan.slot?.periodId ?? null,
      topic: row.lessonPlan.topic,
      className: row.lessonPlan.classSubject.class.name,
      streamName: row.lessonPlan.classSubject.stream?.name ?? null,
      subjectName: row.lessonPlan.classSubject.subject.name,
      roomName: row.lessonPlan.slot?.room?.name ?? null,
      forTeacherName: row.lessonPlan.classSubject.teacherProfile.user.name,
      reason: row.reason,
    }));

    // Monday to Friday always, and the weekend only when something is on it.
    // A Saturday column every school never uses is five sixths of a lie.
    const weekendInUse = new Set(
      [...lessons.map((row) => row.dayOfWeek), ...covering.map((row) => row.dayOfWeek)].filter(
        (day) => day > 5,
      ),
    );
    const dayNumbers = [1, 2, 3, 4, 5, ...[...weekendInUse].sort((a, b) => a - b)];

    const days = dayNumbers.map((dayOfWeek) => {
      const date = new Date(weekStart.getTime() + (dayOfWeek - 1) * 86_400_000);
      return {
        dayOfWeek,
        date: isoDate(date),
        isToday: date.getTime() === today.getTime(),
      };
    });

    return successResponse({
      term,
      weekStart: isoDate(weekStart),
      today: isoDate(today),
      days,
      periods: periods
        .filter((period) => period.isTeaching)
        .map((period) => ({
          id: period.id,
          code: period.code,
          name: period.name,
          startMinute: period.startMinute,
          endMinute: period.endMinute,
          startsAt: formatMinute(period.startMinute),
          endsAt: formatMinute(period.endMinute),
        })),
      lessons,
      cover: covering,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/teacher/me/timetable error:", error);
    return errorResponse("Failed to load your week");
  }
}
