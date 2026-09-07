import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "../../../../permissions";
import { getCurrentTerm } from "../../../../calendar";
import { getTeacherProfile } from "../../../../governance-v2";
import {
  arrangeCover,
  copyWeekForward,
  layOutWeek,
  LessonPlanError,
  lessonWeek,
  saveLessonPlan,
} from "../../../../lesson-plans";

const querySchema = z.object({
  weekStart: z.string().date(),
  classSubjectId: z.string().uuid().optional(),
  mine: z.coerce.boolean().optional(),
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
    reflection: z.string().trim().max(2000).nullish(),
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
  z.object({
    action: z.literal("cover"),
    lessonPlanId: z.string().uuid(),
    coveringTeacherProfileId: z.string().uuid(),
    reason: z.string().trim().max(300).nullish(),
  }),
]);

/** A week of lessons, with cover. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      weekStart: searchParams.get("weekStart") ?? undefined,
      classSubjectId: searchParams.get("classSubjectId") ?? undefined,
      mine: searchParams.get("mine") ?? undefined,
    });

    let teacherProfileId: string | undefined;
    if (query.mine) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile) return errorResponse("You do not have a teacher profile", 403);
      teacherProfileId = profile.id;
    }

    const plans = await lessonWeek({
      companyId,
      classSubjectId: query.classSubjectId,
      teacherProfileId,
      weekStart: new Date(query.weekStart),
    });

    return successResponse({ weekStart: query.weekStart, plans });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/lesson-plans error:", error);
    return errorResponse("Failed to fetch the week");
  }
}

/**
 * Write a plan, copy a week forward, or arrange cover.
 *
 * Cover needs the wider grant: naming somebody else to take a class is a
 * timetable decision, not a note in your own planner.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const validated = bodySchema.parse(await request.json());

    if (validated.action === "save") {
      const termId = (await getCurrentTerm(companyId))?.id;
      if (!termId) return errorResponse("This school has no active term", 400);

      const plan = await saveLessonPlan({
        companyId,
        id: validated.id,
        termId,
        classSubjectId: validated.classSubjectId,
        slotId: validated.slotId ?? null,
        lessonDate: new Date(validated.lessonDate),
        topic: validated.topic,
        objectives: validated.objectives ?? null,
        activities: validated.activities ?? null,
        resourcesNote: validated.resourcesNote ?? null,
        homeworkNote: validated.homeworkNote ?? null,
        reflection: validated.reflection ?? null,
        createdById: session.user.id,
      });
      return successResponse(plan, validated.id ? 200 : 201);
    }

    if (validated.action === "copy-week") {
      const result = await copyWeekForward({
        companyId,
        classSubjectId: validated.classSubjectId,
        fromWeekStart: new Date(validated.fromWeekStart),
        toWeekStart: new Date(validated.toWeekStart),
        createdById: session.user.id,
      });
      return successResponse(result);
    }

    if (validated.action === "lay-out-week") {
      const result = await layOutWeek({
        companyId,
        classSubjectId: validated.classSubjectId,
        weekStart: new Date(validated.weekStart),
        createdById: session.user.id,
      });
      return successResponse(result);
    }

    const coverDenied = schoolPermissionDenial(session, "schools.teachers", "edit");
    if (coverDenied) return errorResponse(coverDenied, 403);

    const cover = await arrangeCover({
      companyId,
      lessonPlanId: validated.lessonPlanId,
      coveringTeacherProfileId: validated.coveringTeacherProfileId,
      reason: validated.reason ?? null,
      arrangedById: session.user.id,
    });
    return successResponse(cover, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LessonPlanError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/lesson-plans error:", error);
    return errorResponse("Failed to save");
  }
}
