import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { getCurrentTerm } from "@/lib/schools/calendar";
import { GoalError, goalsForStudent, saveGoal } from "@/lib/schools/goals-meetings";
import { resolvePortalStudent } from "@/lib/schools/portal-identity";

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

/**
 * Correct a target that is already there.
 *
 * POST writes by the three of pupil, term and subject, which is the right key
 * for setting one and the wrong one for fixing one. A head of department who
 * opened an existing target and changed the subject — because it was typed
 * against Geography and meant Mathematics — was not moving it, they were
 * writing a second target and leaving the wrong one on the board. Nor could the
 * term be corrected at all: a target set in the wrong term is invisible from the
 * term it belongs to, and the only way to reach it was to set it again where it
 * should have been and live with the duplicate.
 *
 * So this addresses the goal by its own id, and everything a moderation
 * reasonably changes is here: the number, the plan the child reads, the
 * baseline, the teacher's note beside it, and which subject and term the whole
 * thing belongs to. Nothing else in the pack points at a goal row, so there is
 * no `isActive` to retire — a target that should not exist is a delete for a
 * later brief, and a target that is simply wrong is this.
 *
 * Staff only, at the same grant the POST uses for a named pupil. A child
 * revising their own aim still goes through POST, which upserts their one row
 * per subject; moving somebody else's target between subjects and rewriting the
 * teacher's note is the department's, not theirs.
 */
const patchSchema = z.object({
  id: z.string().uuid(),
  termId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  targetMark: z.number().min(0).max(100).nullish(),
  plan: z.string().trim().max(2000).nullish(),
  baselineMark: z.number().min(0).max(100).nullish(),
  teacherNote: z.string().trim().max(1000).nullish(),
});

export async function PATCH(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    const body = patchSchema.parse(await request.json());

    // The id is a claim until it is resolved against the caller's company.
    const existing = await prisma.schoolStudentGoal.findFirst({
      where: { id: body.id, companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("That target is not this school's.", 404);

    // So are the two the target can be moved onto. A foreign key alone would
    // take a subject id from another school, because the row it lands on is
    // ours and the column it points at is not checked against us.
    if (body.subjectId) {
      const subject = await prisma.schoolSubject.findFirst({
        where: { id: body.subjectId, companyId },
        select: { id: true },
      });
      if (!subject) return errorResponse("That subject is not this school's.", 404);
    }
    if (body.termId) {
      const term = await prisma.schoolTerm.findFirst({
        where: { id: body.termId, companyId },
        select: { id: true },
      });
      if (!term) return errorResponse("That term is not this school's.", 404);
    }

    const updated = await prisma.schoolStudentGoal.update({
      where: { id: existing.id },
      data: {
        ...(body.termId !== undefined ? { termId: body.termId } : {}),
        ...(body.subjectId !== undefined ? { subjectId: body.subjectId } : {}),
        // All four are `nullish`: an explicit null rubs the field out, an absent
        // one leaves what is there. A screen that patches only the note must not
        // wipe the plan the child was given.
        ...(body.targetMark !== undefined ? { targetMark: body.targetMark } : {}),
        ...(body.plan !== undefined ? { plan: body.plan } : {}),
        ...(body.baselineMark !== undefined ? { baselineMark: body.baselineMark } : {}),
        ...(body.teacherNote !== undefined ? { teacherNote: body.teacherNote } : {}),
      },
      select: {
        id: true,
        termId: true,
        subjectId: true,
        targetMark: true,
        baselineMark: true,
      },
    });

    return successResponse({
      ...updated,
      targetMark: updated.targetMark === null ? null : Number(updated.targetMark),
      baselineMark:
        updated.baselineMark === null ? null : Number(updated.baselineMark),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse(
        "That pupil already has a target in that subject for that term.",
        409,
      );
    }
    console.error("[API] PATCH /api/v2/schools/goals error:", error);
    return errorResponse("Failed to change the goal");
  }
}
