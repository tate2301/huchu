import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  DetentionError,
  markAttendance,
  markEveryoneHere,
  moveToSession,
  sessionRegister,
} from "@/lib/schools/detention";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One session's register: read it, and mark it.
 *
 * ## Who may mark
 *
 * Reading needs `view`; marking needs `mark`. A teacher holds `mark`, but only
 * the supervisor named on the session may mark **this** register — a teacher
 * who is not standing in the room is not the person who knows who walked in.
 * The refusal names who can, per `11-campus-states-and-motion.md`: *"You do not
 * have permission"* is a dead end.
 *
 * ## `Did not turn up` does not decrement what is owed
 *
 * It is the whole reason `Still to serve` is a column. A pupil who was named
 * and did not come still owes the session, and the register says so at its foot
 * rather than in a second list of the same names.
 */

const markSchema = z.union([
  z.object({
    attendanceId: z.string().uuid(),
    state: z.enum(["HERE", "DID_NOT_TURN_UP", "NOT_MARKED"]),
  }),
  z.object({ everyoneHere: z.literal(true) }),
  z.object({ attendanceId: z.string().uuid(), moveToSessionId: z.string().uuid() }),
]);

/**
 * Whether this person may mark **this** register, given they already hold
 * `schools.conduct:mark`.
 *
 * The grant check is deliberately not in here: it belongs in the handler, where
 * a reader of the route can see it, and `route-guard-coverage.test.ts` asserts
 * that every write declares who may call it in its own body rather than behind
 * a helper. This is the narrowing on top — a teacher may mark the register she
 * is supervising and not somebody else's.
 */
async function supervisorDenial(
  session: { user: { id: string; companyId: string; role?: string | null } },
  sessionId: string,
): Promise<string | null> {
  // `edit` is the office's grant — the deputy head and the administrators hold
  // it, a class teacher does not. Anybody who has it may mark any register.
  if (!schoolPermissionDenial(session, "schools.conduct", "edit")) return null;

  const detention = await prisma.schoolDetentionSession.findFirst({
    where: { id: sessionId, companyId: session.user.companyId },
    select: {
      supervisor: {
        select: { userId: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!detention) return "That detention session is not this school's.";
  if (detention.supervisor?.userId === session.user.id) return null;
  const who = detention.supervisor?.user?.name ?? detention.supervisor?.user?.email;
  return who
    ? `Only ${who}, who is supervising this session, can mark it — or the office.`
    : "Only the supervisor named on this session can mark it — and nobody is named yet. Ask the office.";
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.conduct", "view");
    if (denied) return errorResponse(denied, 403);

    const { sessionId } = await context.params;
    const register = await sessionRegister({
      companyId: session.user.companyId,
      sessionId,
    });
    // Whether the reader may mark, so the row buttons are disabled with the
    // reason on them rather than hidden.
    const markDenial =
      schoolPermissionDenial(session, "schools.conduct", "mark") ??
      (await supervisorDenial(session, sessionId));
    return successResponse({ ...register, markDenial });
  } catch (error) {
    if (error instanceof DetentionError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/conduct/detention/.../register error:", error);
    return errorResponse("Failed to read the register");
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { sessionId } = await context.params;
    const denied = schoolPermissionDenial(session, "schools.conduct", "mark");
    if (denied) return errorResponse(denied, 403);
    const notTheSupervisor = await supervisorDenial(session, sessionId);
    if (notTheSupervisor) return errorResponse(notTheSupervisor, 403);

    const body = markSchema.parse(await request.json());
    const base = { companyId: session.user.companyId, actorId: session.user.id };

    if ("everyoneHere" in body) {
      const result = await markEveryoneHere({ ...base, sessionId });
      return successResponse(result);
    }
    if ("moveToSessionId" in body) {
      const moved = await moveToSession({
        ...base,
        sessionId,
        attendanceId: body.attendanceId,
        toSessionId: body.moveToSessionId,
      });
      return successResponse(moved);
    }
    const marked = await markAttendance({
      ...base,
      sessionId,
      attendanceId: body.attendanceId,
      state: body.state,
    });
    return successResponse(marked);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof DetentionError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/detention/.../register error:", error);
    return errorResponse("Failed to mark the register");
  }
}
