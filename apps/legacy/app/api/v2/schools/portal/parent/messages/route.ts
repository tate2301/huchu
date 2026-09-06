import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  MessageError,
  openThread,
  replyToThread,
  startThread,
  threadsForGuardian,
} from "@/lib/schools/messages";
import { resolvePortalGuardian } from "@/lib/schools/portal-identity";

/**
 * A family's conversations with the school.
 *
 * The guardian is resolved from the session, never from a parameter — the same
 * rule the rest of the parent portal follows — so a thread id is the only thing
 * a caller supplies, and the library checks that it belongs to them.
 */

const querySchema = z.object({ threadId: z.string().uuid().optional() });

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    studentId: z.string().uuid().nullish(),
    /** Null writes to the office rather than to a teacher. */
    teacherProfileId: z.string().uuid().nullish(),
    subject: z.string().trim().min(1).max(160),
    body: z.string().trim().min(1).max(4000),
  }),
  z.object({
    action: z.literal("reply"),
    threadId: z.string().uuid(),
    body: z.string().trim().min(1).max(4000),
  }),
]);

async function guardianFor(companyId: string, userId: string, role: string | null | undefined) {
  const resolution = await resolvePortalGuardian(
    { companyId, userId, role, requestedId: null },
    { select: { id: true } },
  );
  return resolution.subject;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const guardian = await guardianFor(companyId, session.user.id, session.user.role);
    if (!guardian) {
      return errorResponse("This account is not linked to a family", 403);
    }

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      threadId: searchParams.get("threadId") ?? undefined,
    });

    if (query.threadId) {
      const thread = await openThread({
        companyId,
        threadId: query.threadId,
        side: "GUARDIAN",
        guardianId: guardian.id,
      });
      return successResponse(thread);
    }

    const threads = await threadsForGuardian({ companyId, guardianId: guardian.id });
    return successResponse({ threads });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/portal/parent/messages error:", error);
    return errorResponse("Failed to load your messages");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const guardian = await guardianFor(companyId, session.user.id, session.user.role);
    if (!guardian) {
      return errorResponse("This account is not linked to a family", 403);
    }

    const validated = bodySchema.parse(await request.json());

    if (validated.action === "start") {
      const thread = await startThread({
        companyId,
        guardianId: guardian.id,
        senderUserId: session.user.id,
        senderSide: "GUARDIAN",
        subject: validated.subject,
        body: validated.body,
        studentId: validated.studentId ?? null,
        teacherProfileId: validated.teacherProfileId ?? null,
      });
      return successResponse(thread, 201);
    }

    const message = await replyToThread({
      companyId,
      threadId: validated.threadId,
      senderUserId: session.user.id,
      senderSide: "GUARDIAN",
      body: validated.body,
      guardianId: guardian.id,
    });
    return successResponse(message, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 409);
    console.error("[API] POST /api/v2/schools/portal/parent/messages error:", error);
    return errorResponse("Failed to send your message");
  }
}
