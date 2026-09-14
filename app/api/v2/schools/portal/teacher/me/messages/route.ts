import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { getTeacherProfile, isPrivilegedRole } from "@/lib/schools/governance-v2";
import {
  MessageError,
  openThread,
  replyToThread,
  startThread,
  threadsForStaff,
} from "@/lib/schools/messages";

/**
 * A teacher's conversations with families.
 *
 * Scoped to the caller's own teacher profile, the same rule as the register and
 * the planner: a teacher reads the threads they are on and no colleague's. The
 * office queue is narrower than it looks — a thread addressed to the school
 * names a child and carries the family's business, so a teacher sees only the
 * entries about children they take. A privileged caller is the office, and gets
 * the queue whole, because the head already has that reach from the admin side.
 */

const querySchema = z.object({ threadId: z.string().uuid().optional() });

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    guardianId: z.string().uuid(),
    studentId: z.string().uuid().nullish(),
    subject: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("reply"),
    threadId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }),
]);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const profile = await getTeacherProfile(companyId, session.user.id);
    const privileged = isPrivilegedRole(session.user.role);
    if (!profile && !privileged) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      threadId: searchParams.get("threadId") ?? undefined,
    });

    if (query.threadId) {
      const thread = await openThread({
        companyId,
        threadId: query.threadId,
        side: "STAFF",
        teacherProfileId: profile?.id ?? null,
        officeRole: privileged,
      });
      return successResponse(thread);
    }

    const threads = await threadsForStaff({
      companyId,
      teacherProfileId: profile?.id ?? null,
      officeRole: privileged,
    });
    return successResponse({ threads });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/portal/teacher/me/messages error:", error);
    return errorResponse("Failed to load your messages");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const profile = await getTeacherProfile(companyId, session.user.id);
    const privileged = isPrivilegedRole(session.user.role);
    if (!profile && !privileged) {
      return errorResponse("You are not linked to a teacher profile", 403);
    }

    const validated = bodySchema.parse(await request.json());

    if (validated.action === "start") {
      const thread = await startThread({
        companyId,
        guardianId: validated.guardianId,
        senderUserId: session.user.id,
        senderSide: "STAFF",
        subject: validated.subject,
        body: validated.body,
        studentId: validated.studentId ?? null,
        teacherProfileId: profile?.id ?? null,
        officeRole: privileged,
      });
      return successResponse(thread, 201);
    }

    const message = await replyToThread({
      companyId,
      threadId: validated.threadId,
      senderUserId: session.user.id,
      senderSide: "STAFF",
      body: validated.body,
      teacherProfileId: profile?.id ?? null,
      officeRole: privileged,
    });
    return successResponse(message, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/portal/teacher/me/messages error:", error);
    return errorResponse("Failed to send your message");
  }
}
