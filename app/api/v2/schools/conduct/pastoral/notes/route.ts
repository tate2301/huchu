import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { listNotesForViewer } from "@/lib/schools/pastoral-access";
import { PastoralError, hasAnyClearance, writeNote } from "@/lib/schools/pastoral";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { whoCan } from "@/lib/schools/access";

/**
 * Pastoral notes.
 *
 * Two checks run, and both are necessary. `schools.pastoral` answers *may this
 * role read pastoral notes at all*; `listNotesForViewer` answers *may this
 * person read this note about this pupil*. A persona grant cannot answer the
 * second, and the first is not a substitute for it.
 *
 * Note that `schools.pastoral` is deliberately outside the tenant-admin
 * short-circuit in `lib/schools/permissions.ts`. `SUPERADMIN` and `MANAGER`
 * answer true for every other school resource before any persona check; here
 * they do not, because the artboard draws the Group Head — the most senior
 * person in the group — as `Not cleared`.
 *
 * There is **no export and no print on this route, and there must never be**.
 * All four other conduct screens have one; this one has a shield instead, and
 * that absence is one of the four `Never` rules enacted in the chrome.
 */

const listQuery = z.object({
  level: z.coerce.number().int().min(1).max(13).optional(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  band: z
    .enum(["PASTORAL_TEAM_ONLY", "HEAD_AND_PASTORAL_TEAM", "SAFEGUARDING_NAMED_INDIVIDUALS"])
    .optional(),
  review: z.enum(["overdue", "due", "none"]).optional(),
  studentId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const createSchema = z.object({
  studentId: z.string().uuid(),
  body: z.string().trim().min(1).max(8000),
  band: z.enum([
    "PASTORAL_TEAM_ONLY",
    "HEAD_AND_PASTORAL_TEAM",
    "SAFEGUARDING_NAMED_INDIVIDUALS",
  ]),
  reviewDueAt: z.string().datetime().nullish(),
  referredTo: z.string().trim().max(200).nullish(),
  namedReaderIds: z.array(z.string().uuid()).max(20).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.pastoral", "view");
    if (denied) {
      return errorResponse(
        `Pastoral notes are read by ${whoCan("schools.pastoral", "view") ?? "the pastoral team"}.`,
        403,
      );
    }

    const viewer = { companyId: session.user.companyId, userId: session.user.id };
    // The page, not a 404, for somebody who holds the grant and no clearance.
    // Hiding the destination entirely would make a nurse think the feature does
    // not exist.
    const cleared = await hasAnyClearance(viewer);

    const { searchParams } = new URL(request.url);
    const filters = listQuery.parse(Object.fromEntries(searchParams.entries()));
    const listing = await listNotesForViewer(viewer, filters);
    return successResponse({ ...listing, cleared });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    // A read that fails, fails closed. There is no fallback projection here and
    // there must not be one: an unredacted list is not a graceful degradation.
    console.error("[API] GET /api/v2/schools/conduct/pastoral/notes error:", error);
    return errorResponse("Failed to read the notes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.pastoral", "create");
    if (denied) return errorResponse(denied, 403);

    const body = createSchema.parse(await request.json());
    const note = await writeNote({
      companyId: session.user.companyId,
      actorId: session.user.id,
      studentId: body.studentId,
      body: body.body,
      band: body.band,
      reviewDueAt: body.reviewDueAt ? new Date(body.reviewDueAt) : null,
      referredTo: body.referredTo ?? null,
      namedReaderIds: body.namedReaderIds,
    });
    // The id and nothing else. A create response that echoed the note back
    // would be a copy of the body outside the access model.
    return successResponse({ id: note.id }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof PastoralError) return errorResponse(error.message, 422);
    console.error("[API] POST /api/v2/schools/conduct/pastoral/notes error:", error);
    return errorResponse("Failed to write the note");
  }
}
