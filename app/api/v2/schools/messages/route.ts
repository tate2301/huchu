import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  allThreads,
  assignThread,
  closeThread,
  MessageError,
  openThread,
  replyToThread,
} from "@/lib/schools/messages";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * Every conversation in the school — the head's view.
 *
 * Oversight, not participation: reading here does not mark a thread read on a
 * teacher's behalf, because a head glancing at an inbox must not clear the
 * badge that tells the teacher to reply. Closing is the one write, and it is
 * the office's to make.
 */

const querySchema = z.object({ threadId: z.string().uuid().optional() });
/**
 * Three writes the office owns. Closing ends a conversation; assigning decides
 * who answers it — and `teacherProfileId: null` hands it back to the office
 * queue, which is why the field is nullable rather than absent.
 *
 * Answering is the third. It used not to be: a reply could only be written from
 * the staff portal, so a family asking the office about a bill reached a bursar
 * who could read the question, route it and close it, but not answer it. The
 * question a fee query needs answering by is the bursar's, and routing it to a
 * teacher who cannot see the ledger was the only thing this route allowed.
 */
const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("close"),
    threadId: z.string().uuid(),
  }),
  z.object({
    action: z.literal("assign"),
    threadId: z.string().uuid(),
    teacherProfileId: z.string().uuid().nullable(),
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

    const denied = schoolPermissionDenial(session, "schools.reports", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      threadId: searchParams.get("threadId") ?? undefined,
    });

    if (query.threadId) {
      const thread = await openThread({
        companyId,
        threadId: query.threadId,
        side: "STAFF",
        readOnly: true,
      });
      return successResponse(thread);
    }

    const threads = await allThreads({ companyId });
    return successResponse({ threads });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/messages error:", error);
    return errorResponse("Failed to load conversations");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const validated = postSchema.parse(await request.json());
    const companyId = session.user.companyId;

    // Triage and answering are different acts, so they are different grants.
    // Deciding who answers a thread, and ending it, stay on `schools.reports`
    // create, which only the office holds. Writing to a family is `reply`,
    // which the bursar and the head of department hold as well — answering a
    // fee question is the bursar's job, and they had no way to do it.
    const denied =
      validated.action === "reply"
        ? schoolPermissionDenial(session, "schools.reports", "reply")
        : schoolPermissionDenial(session, "schools.reports", "create");
    if (denied) return errorResponse(denied, 403);

    if (validated.action === "reply") {
      // `officeRole` is what lets the office answer a thread nobody has been
      // assigned yet — the same flag that lets it read one.
      const message = await replyToThread({
        companyId,
        threadId: validated.threadId,
        senderUserId: session.user.id,
        senderSide: "STAFF",
        body: validated.body,
        officeRole: true,
      });
      return successResponse({ id: message.id }, 201);
    }

    if (validated.action === "assign") {
      await assignThread({
        companyId,
        threadId: validated.threadId,
        teacherProfileId: validated.teacherProfileId,
      });
      return successResponse({ assigned: true });
    }

    await closeThread({ companyId, threadId: validated.threadId });
    return successResponse({ closed: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof MessageError) return errorResponse(error.message, 404);
    console.error("[API] POST /api/v2/schools/messages error:", error);
    return errorResponse("Failed to update the conversation");
  }
}
