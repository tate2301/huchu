import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";
import {
  copyWeekForward,
  layOutWeek,
  LessonPlanError,
  saveLessonPlan,
} from "@/lib/schools/lesson-plans";
import { formatMinute } from "@/lib/schools/timetable-format";

const querySchema = z.object({
  classSubjectId: z.string().uuid(),
  weekStart: z.string().date().optional(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("save"),
    id: z.string().uuid().optional(),
    classSubjectId: z.string().uuid(),
    slotId: z.string().uuid().nullish(),
    lessonDate: z.string().date(),
    topic: z.string().trim().min(1).max(300),
    objectives: z.string().trim().max(2000).nullish(),
    activities: z.string().trim().max(4000).nullish(),
    resourcesNote: z.string().trim().max(2000).nullish(),
    homeworkNote: z.string().trim().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("copy-week"),
    classSubjectId: z.string().uuid(),
    fromWeekStart: z.string().date(),
    toWeekStart: z.string().date(),
  }),
  z.object({
    action: z.literal("lay-out-week"),
    classSubjectId: z.string().uuid(),
    weekStart: z.string().date(),
  }),
]);

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
 * The assignment, once it has been established the caller may have it.
 *
 * Same rule as `me/register`: a teacher plans the lessons of a class they
 * teach and of no other. A privileged caller — a head of department looking at
 * a colleague's scheme of work — is let through, because the office already has
 * that reach from the admin side and a second, stricter answer here would only
 * disagree with it.
 */
type OwnedAssignment = NonNullable<
  Awaited<ReturnType<typeof findAssignment>>
>;

function findAssignment(companyId: string, classSubjectId: string) {
  return prisma.schoolClassSubject.findFirst({
    where: { id: classSubjectId, companyId },
    select: {
      id: true,
      termId: true,
      teacherProfileId: true,
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, name: true } },
      subject: { select: { id: true, code: true, name: true } },
      term: { select: { id: true, code: true, name: true } },
    },
  });
}

async function ownedClassSubject(
  companyId: string,
  userId: string,
  role: string | null | undefined,
  classSubjectId: string,
): Promise<{ error: string } | { assignment: OwnedAssignment }> {
  const assignment = await findAssignment(companyId, classSubjectId);
  if (!assignment) return { error: "That class is not one of yours" };

  if (isPrivilegedRole(role)) return { assignment };

  const profile = await getTeacherProfile(companyId, userId);
  if (!profile) return { error: "You are not linked to a teacher profile" };
  if (assignment.teacherProfileId !== profile.id) {
    return { error: "That class is not one of yours" };
  }
  return { assignment };
}

/**
 * A week of lesson slots for one class, plans laid over the timetable.
 *
 * Built outward from the timetable rather than from the plans, which is the
 * whole difference between this and `GET /api/v2/schools/lesson-plans`. That
 * route returns the plans that exist; a planner has to show the lessons that
 * are going to happen whether or not anybody has written anything for them,
 * because an unplanned Thursday is exactly what a teacher opens this screen to
 * find. A grid of only what is written would be silent about the gap.
 *
 * Last week's plan count travels with the response so "copy last week forward"
 * can say how many plans it would bring, rather than offering an action whose
 * size is only discovered after it runs.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      classSubjectId: searchParams.get("classSubjectId") ?? undefined,
      weekStart: searchParams.get("weekStart") ?? undefined,
    });

    const owned = await ownedClassSubject(
      companyId,
      session.user.id,
      session.user.role,
      query.classSubjectId,
    );
    if ("error" in owned) return errorResponse(owned.error, 403);
    const { assignment } = owned;

    const today = utcDay(new Date());
    const weekStart = query.weekStart ? utcDay(new Date(query.weekStart)) : mondayOf(today);
    const lastWeekStart = new Date(weekStart.getTime() - 7 * 86_400_000);

    const [periods, slots, plans, lastWeek] = await Promise.all([
      prisma.schoolPeriod.findMany({
        where: { companyId, OR: [{ termId: assignment.termId }, { termId: null }] },
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
        where: { companyId, termId: assignment.termId, classSubjectId: assignment.id },
        select: {
          id: true,
          dayOfWeek: true,
          periodId: true,
          room: { select: { name: true } },
        },
      }),
      // Read directly rather than through `lessonWeek`: that helper does not
      // select `resourcesNote`, and the planner's materials box is one of the
      // four things a teacher writes. A field that saves but comes back blank
      // is worse than one that is not offered.
      prisma.schoolLessonPlan.findMany({
        where: {
          companyId,
          classSubjectId: assignment.id,
          lessonDate: { gte: weekStart, lt: new Date(weekStart.getTime() + 7 * 86_400_000) },
        },
        select: {
          id: true,
          lessonDate: true,
          slotId: true,
          topic: true,
          objectives: true,
          resourcesNote: true,
          homeworkNote: true,
          cover: {
            select: {
              reason: true,
              coveringTeacher: { select: { user: { select: { name: true } } } },
            },
          },
        },
      }),
      prisma.schoolLessonPlan.count({
        where: {
          companyId,
          classSubjectId: assignment.id,
          lessonDate: {
            gte: lastWeekStart,
            lt: new Date(lastWeekStart.getTime() + 7 * 86_400_000),
          },
        },
      }),
    ]);

    // Monday to Friday always, and the weekend only when this class is
    // timetabled onto it. An empty Saturday column is noise on every screen.
    const weekendInUse = new Set(
      slots.map((slot) => slot.dayOfWeek).filter((day) => day > 5),
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

    // A plan is matched to its slot first and to the bare date second, so a
    // plan written before the lesson was timetabled still finds its cell
    // rather than being invisible next to an empty one.
    const planFor = (date: string, slotId: string) => {
      const onDate = plans.filter((plan) => isoDate(plan.lessonDate) === date);
      return (
        onDate.find((plan) => plan.slotId === slotId) ??
        onDate.find((plan) => plan.slotId === null) ??
        null
      );
    };

    const lessons = days.flatMap((day) =>
      slots
        .filter((slot) => slot.dayOfWeek === day.dayOfWeek)
        .map((slot) => {
          const plan = planFor(day.date, slot.id);
          return {
            key: `${day.date}|${slot.periodId}`,
            slotId: slot.id,
            periodId: slot.periodId,
            dayOfWeek: day.dayOfWeek,
            date: day.date,
            roomName: slot.room?.name ?? null,
            plan: plan
              ? {
                  id: plan.id,
                  topic: plan.topic,
                  objectives: plan.objectives,
                  resourcesNote: plan.resourcesNote,
                  homeworkNote: plan.homeworkNote,
                }
              : null,
            cover: plan?.cover
              ? {
                  teacherName: plan.cover.coveringTeacher.user.name,
                  reason: plan.cover.reason,
                }
              : null,
          };
        }),
    );

    return successResponse({
      classSubject: {
        id: assignment.id,
        termId: assignment.termId,
        termName: assignment.term.name,
        className: assignment.class.name,
        classCode: assignment.class.code,
        streamName: assignment.stream?.name ?? null,
        subjectName: assignment.subject.name,
        subjectCode: assignment.subject.code,
      },
      weekStart: isoDate(weekStart),
      lastWeekStart: isoDate(lastWeekStart),
      lastWeekPlans: lastWeek,
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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/portal/teacher/me/lessons error:", error);
    return errorResponse("Failed to load the week's lessons");
  }
}

/**
 * Write a plan, or bring last week's forward.
 *
 * The admin route at `/api/v2/schools/lesson-plans` already does both, but it
 * asks for `schools.academics: edit`, and the teacher persona is granted only
 * `view` there. Planning your own lessons is not an academics edit — it is the
 * teacher's own work, which is what this door is for. Arranging cover is
 * deliberately absent: naming somebody else to take a class is a timetable
 * decision, and it stays behind `schools.teachers: edit` on the admin route.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    const owned = await ownedClassSubject(
      companyId,
      session.user.id,
      session.user.role,
      validated.classSubjectId,
    );
    if ("error" in owned) return errorResponse(owned.error, 403);
    const { assignment } = owned;

    if (validated.action === "copy-week") {
      const result = await copyWeekForward({
        companyId,
        classSubjectId: assignment.id,
        fromWeekStart: new Date(validated.fromWeekStart),
        toWeekStart: new Date(validated.toWeekStart),
        createdById: session.user.id,
      });
      return successResponse(result);
    }

    if (validated.action === "lay-out-week") {
      const result = await layOutWeek({
        companyId,
        classSubjectId: assignment.id,
        weekStart: new Date(validated.weekStart),
        createdById: session.user.id,
      });
      return successResponse(result);
    }

    // `saveLessonPlan` writes every column it is given, so a field this screen
    // does not offer would be nulled by an edit that never mentioned it. The
    // planner has four boxes; the running order and the after-the-lesson
    // reflection are written elsewhere, and are carried through untouched
    // rather than quietly erased by somebody fixing a typo in the topic.
    const existing = validated.id
      ? await prisma.schoolLessonPlan.findFirst({
          where: { id: validated.id, companyId },
          select: { activities: true, reflection: true },
        })
      : null;

    // The term comes from the assignment, not from whichever term happens to be
    // active: a plan written for a lesson belongs to that lesson's term.
    const plan = await saveLessonPlan({
      companyId,
      ...(validated.id ? { id: validated.id } : {}),
      termId: assignment.termId,
      classSubjectId: assignment.id,
      slotId: validated.slotId ?? null,
      lessonDate: new Date(validated.lessonDate),
      topic: validated.topic,
      objectives: validated.objectives ?? null,
      activities: validated.activities ?? existing?.activities ?? null,
      resourcesNote: validated.resourcesNote ?? null,
      homeworkNote: validated.homeworkNote ?? null,
      reflection: existing?.reflection ?? null,
      createdById: session.user.id,
    });

    return successResponse(plan, validated.id ? 200 : 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LessonPlanError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/portal/teacher/me/lessons error:", error);
    return errorResponse("Failed to save the lesson plan");
  }
}
