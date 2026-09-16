import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  LeaverError,
  closeLeaver,
  leavingDocuments,
  markClearance,
} from "@/lib/schools/leavers";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One leaver: the five marks, the documents, and closing the record.
 *
 * Settling a mark needs `clear`, which the bursar, the warden and the registrar
 * each hold — one mark is each of theirs. Closing needs `record`, the
 * registrar's, because closing a record puts a pupil on the alumni register and
 * takes them off the roll.
 */

const patchSchema = z.union([
  z.object({
    kind: z.enum(["FEES", "LIBRARY", "BOARDING", "PORTAL", "RESULTS"]),
    state: z.enum(["TODO", "DONE", "NOT_APPLICABLE"]),
    overrideNote: z.string().trim().max(300).nullish(),
  }),
  z.object({ close: z.literal(true) }),
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ leaverId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.leavers", "view");
    if (denied) return errorResponse(denied, 403);

    const { leaverId } = await context.params;
    const documents = await leavingDocuments({
      companyId: session.user.companyId,
      leaverId,
    });
    return successResponse(documents);
  } catch (error) {
    if (error instanceof LeaverError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/leavers/[id] error:", error);
    return errorResponse("Failed to read the leaver");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ leaverId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { leaverId } = await context.params;
    const body = patchSchema.parse(await request.json());
    const base = { companyId: session.user.companyId, actorId: session.user.id, leaverId };

    if ("close" in body) {
      const denied = schoolPermissionDenial(session, "schools.leavers", "record");
      if (denied) return errorResponse(denied, 403);
      const closed = await closeLeaver(base);
      return successResponse(closed);
    }

    const denied = schoolPermissionDenial(session, "schools.leavers", "clear");
    if (denied) return errorResponse(denied, 403);
    const marked = await markClearance({
      ...base,
      kind: body.kind,
      state: body.state,
      overrideNote: body.overrideNote ?? null,
    });
    return successResponse(marked);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LeaverError) return errorResponse(error.message, 422);
    console.error("[API] PATCH /api/v2/schools/leavers/[id] error:", error);
    return errorResponse("Failed to change the leaver");
  }
}
