import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import { getTeacherProfile } from "../../../../../governance-v2";
import {
  assignmentBoard,
  AssignmentError,
  markSubmission,
  publishAssignment,
  submitAssignment,
} from "../../../../../assignments";
import { resolvePortalStudent } from "../../../../../portal-identity";

const patchSchema = z.object({
  publish: z.boolean().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  instructions: z.string().trim().max(4000).nullish(),
  dueAt: z.string().datetime().nullish(),
  maxScore: z.number().positive().max(1000).nullish(),
});

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("submit"),
    /** Absent means the caller, which is how a student portal hands work in. */
    studentId: z.string().uuid().optional(),
    content: z.string().trim().max(8000).nullish(),
    attachmentUrl: z.string().url().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("mark"),
    submissionId: z.string().uuid(),
    score: z.number().min(0).max(1000).nullish(),
    feedback: z.string().trim().max(2000).nullish(),
    sendBack: z.boolean().optional(),
  }),
]);

/** Who has handed in and who has not. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const board = await assignmentBoard({
      companyId: session.user.companyId,
      assignmentId: id,
    });
    return successResponse(board);
  } catch (error) {
    if (error instanceof AssignmentError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/assignments/[id] error:", error);
    return errorResponse("Failed to fetch the homework board");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.results", "capture");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const existing = await prisma.schoolAssignment.findFirst({
      where: { id, companyId },
      select: { id: true, classSubject: { select: { teacherProfileId: true } } },
    });
    if (!existing) return errorResponse("Assignment not found", 404);

    if (schoolPermissionDenial(session, "schools.results", "moderate")) {
      const profile = await getTeacherProfile(companyId, session.user.id);
      if (!profile || profile.id !== existing.classSubject.teacherProfileId) {
        return errorResponse("That homework is not yours to change", 403);
      }
    }

    const validated = patchSchema.parse(await request.json());

    if (validated.publish !== undefined) {
      // Publishing goes through the service so the date and the flag stay in
      // step — the database refuses one without the other.
      await publishAssignment({
        companyId,
        assignmentId: id,
        publish: validated.publish,
      });
    }

    const fields = {
      ...(validated.title !== undefined ? { title: validated.title } : {}),
      ...(validated.instructions !== undefined
        ? { instructions: validated.instructions ?? null }
        : {}),
      ...(validated.dueAt !== undefined
        ? { dueAt: validated.dueAt ? new Date(validated.dueAt) : null }
        : {}),
      ...(validated.maxScore !== undefined
        ? { maxScore: validated.maxScore ?? null }
        : {}),
    };
    if (Object.keys(fields).length > 0) {
      await prisma.schoolAssignment.update({ where: { id }, data: fields });
    }

    const updated = await prisma.schoolAssignment.findUniqueOrThrow({
      where: { id },
      select: { id: true, title: true, isPublished: true, dueAt: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof AssignmentError) return errorResponse(error.message, 409);
    console.error("[API] PATCH /api/v2/schools/assignments/[id] error:", error);
    return errorResponse("Failed to update the homework");
  }
}

/**
 * Hand work in, or mark it.
 *
 * One route, two actions, because both are writes against the same assignment
 * and splitting them would mean two nearly identical guards. Who may do which
 * is decided separately: a student hands in their own work and nobody else's,
 * which is resolved from the session rather than from a `studentId` in the body.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const validated = postSchema.parse(await request.json());

    if (validated.action === "submit") {
      // A student handing in their own work: the id comes from who they are,
      // never from what they ask for. Staff may hand in on a child's behalf —
      // paper handed over at the desk — and that needs the capture grant.
      let studentId: string;
      if (validated.studentId) {
        if (schoolPermissionDenial(session, "schools.results", "capture")) {
          return errorResponse("You may only hand in your own work", 403);
        }
        studentId = validated.studentId;
      } else {
        const resolved = await resolvePortalStudent(
          {
            companyId,
            userId: session.user.id,
            role: session.user.role,
          },
          { select: { id: true } },
        );
        if (!resolved.subject) {
          return errorResponse("You are not a student here", 403);
        }
        studentId = resolved.subject.id;
      }

      const submission = await submitAssignment({
        companyId,
        assignmentId: id,
        studentId,
        content: validated.content ?? null,
        attachmentUrl: validated.attachmentUrl ?? null,
      });
      return successResponse(submission, 201);
    }

    const denied = schoolPermissionDenial(session, "schools.results", "capture");
    if (denied) return errorResponse(denied, 403);

    const marked = await markSubmission({
      companyId,
      submissionId: validated.submissionId,
      score: validated.score ?? null,
      feedback: validated.feedback ?? null,
      markedById: session.user.id,
      sendBack: validated.sendBack,
    });
    return successResponse(marked);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof AssignmentError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/assignments/[id] error:", error);
    return errorResponse("Failed to save");
  }
}
