import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import {
  LeaverError,
  addAlumniUpdate,
  alumnusRecord,
  recordConsent,
  recordDestination,
} from "@/lib/schools/leavers";
import { schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * One former pupil: the record, the timeline, the consent and the destination.
 *
 * The exam results and the conduct line are read from the tables that own them
 * rather than copied onto the alumnus at closing time. A grade amended after a
 * remark two years later should change what this page says, and a copy would
 * not.
 */

const patchSchema = z.union([
  z.object({ consent: z.enum(["NOT_ASKED", "MAY_CONTACT", "NO_CONTACT"]) }),
  z.object({
    destinationKind: z.enum([
      "UNKNOWN",
      "UNIVERSITY",
      "COLLEGE",
      "EMPLOYED",
      "SELF_EMPLOYED",
      "TRANSFERRED",
      "GAP_YEAR",
      "ABROAD",
      "OTHER",
    ]),
    destination: z.string().trim().max(200).nullish(),
  }),
  z.object({
    happenedOn: z.string().datetime(),
    summary: z.string().trim().min(1).max(300),
    documentReference: z.string().trim().max(80).nullish(),
  }),
]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ alumnusId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.alumni", "view");
    if (denied) return errorResponse(denied, 403);

    const { alumnusId } = await context.params;
    const record = await alumnusRecord({
      companyId: session.user.companyId,
      alumnusId,
    });
    return successResponse(record);
  } catch (error) {
    if (error instanceof LeaverError) return errorResponse(error.message, 404);
    console.error("[API] GET /api/v2/schools/alumni/[id] error:", error);
    return errorResponse("Failed to read the record");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ alumnusId: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.alumni", "record");
    if (denied) return errorResponse(denied, 403);

    const { alumnusId } = await context.params;
    const body = patchSchema.parse(await request.json());
    const companyId = session.user.companyId;

    if ("consent" in body) {
      const updated = await recordConsent({
        companyId,
        actorId: session.user.id,
        alumnusId,
        consent: body.consent,
      });
      return successResponse(updated);
    }
    if ("destinationKind" in body) {
      const updated = await recordDestination({
        companyId,
        alumnusId,
        destinationKind: body.destinationKind,
        destination: body.destination ?? null,
      });
      return successResponse(updated);
    }

    const added = await addAlumniUpdate({
      companyId,
      actorId: session.user.id,
      alumnusId,
      happenedOn: new Date(body.happenedOn),
      summary: body.summary,
      documentReference: body.documentReference ?? null,
    });
    return successResponse(added, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof LeaverError) return errorResponse(error.message, 422);
    console.error("[API] PATCH /api/v2/schools/alumni/[id] error:", error);
    return errorResponse("Failed to record it");
  }
}
