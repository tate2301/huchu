import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import {
  allThreads,
  assignThread,
  closeThread,
  MessageError,
  openThread,
} from "../../../../messages";
import { schoolPermissionDenial } from "../../../../permissions";

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
 * Two writes the office owns. Closing ends a conversation; assigning decides
 * who answers it — and `teacherProfileId: null` hands it back to the office
 * queue, which is why the field is nullable rather than absent.
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

    const denied = schoolPermissionDenial(session, "schools.reports", "create");
    if (denied) return errorResponse(denied, 403);

    const validated = postSchema.parse(await request.json());
    const companyId = session.user.companyId;

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
