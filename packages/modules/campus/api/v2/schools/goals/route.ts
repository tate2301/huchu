import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { schoolPermissionDenial } from "../../../../permissions";
import { getCurrentTerm } from "../../../../calendar";
import { GoalError, goalsForStudent, saveGoal } from "../../../../goals-meetings";
import { resolvePortalStudent } from "../../../../portal-identity";

const querySchema = z.object({
  studentId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
});

const saveSchema = z.object({
  studentId: z.string().uuid().optional(),
  /**
   * The term the target belongs to. Staff only, and absent means the school's
   * current one: the oversight board can be read on any term, and writing a
   * target into today's term because that is what the server assumed would put
   * it on a screen nobody was looking at.
   */
  termId: z.string().uuid().optional(),
  subjectId: z.string().uuid(),
  targetMark: z.number().min(0).max(100).nullish(),
  plan: z.string().trim().max(2000).nullish(),
  baselineMark: z.number().min(0).max(100).nullish(),
  teacherNote: z.string().trim().max(1000).nullish(),
});

/**
 * A child's goals, with where they actually are.
 *
 * The student portal calls this with no `studentId` and gets their own; staff
 * name a child and need the students grant. The same S-0.2 rule as everywhere
 * else — who you are decides what you see, not what you ask for.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      studentId: searchParams.get("studentId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
    });

    let studentId: string;
    if (query.studentId) {
      const denied = schoolPermissionDenial(session, "schools.students", "view");
      if (denied) return errorResponse(denied, 403);
      studentId = query.studentId;
    } else {
      const resolved = await resolvePortalStudent(
        { companyId, userId: session.user.id, role: session.user.role },
        { select: { id: true } },
      );
      if (!resolved.subject) return errorResponse("You are not a student here", 403);
      studentId = resolved.subject.id;
    }

    const termId = query.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const goals = await goalsForStudent({ companyId, studentId, termId });
    return successResponse({ termId, goals });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/goals error:", error);
    return errorResponse("Failed to fetch the goals");
  }
}

/**
 * Set or change a goal.
 *
 * A student sets their own; a teacher adds the note. `teacherNote` is refused
 * from a portal caller, because a target a child writes for themselves and a
 * comment their teacher writes about it are different things and only one of
 * them is theirs to write.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const validated = saveSchema.parse(await request.json());
    const isStaff = !schoolPermissionDenial(session, "schools.students", "edit");

    let studentId: string;
    if (validated.studentId) {
      if (!isStaff) return errorResponse("You may only set your own goals", 403);
      studentId = validated.studentId;
    } else {
      const resolved = await resolvePortalStudent(
        { companyId, userId: session.user.id, role: session.user.role },
        { select: { id: true } },
      );
      if (!resolved.subject) return errorResponse("You are not a student here", 403);
      studentId = resolved.subject.id;
    }

    if (validated.teacherNote != null && !isStaff) {
      return errorResponse("Only a teacher writes the teacher's note", 403);
    }

    if (validated.termId && !isStaff) {
      return errorResponse("You may only set goals in the current term", 403);
    }
    const termId = validated.termId ?? (await getCurrentTerm(companyId))?.id;
    if (!termId) return errorResponse("This school has no active term", 400);

    const goal = await saveGoal({
      companyId,
      studentId,
      termId,
      subjectId: validated.subjectId,
      targetMark: validated.targetMark ?? null,
      plan: validated.plan ?? null,
      baselineMark: validated.baselineMark ?? null,
      ...(validated.teacherNote !== undefined
        ? { teacherNote: validated.teacherNote }
        : {}),
    });

    return successResponse(goal, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof GoalError) return errorResponse(error.message, 400);
    console.error("[API] POST /api/v2/schools/goals error:", error);
    return errorResponse("Failed to save the goal");
  }
}
