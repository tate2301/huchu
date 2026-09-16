import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { applyTermClose, planTermClose } from "@/lib/schools/boarding-rollover";
import { BoardingSessionError } from "@/lib/schools/boarding-sessions";

const closeSchema = z.object({
  endDate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
});

async function termOrRefuse(companyId: string, termId: string) {
  const term = await prisma.schoolTerm.findFirst({
    where: { id: termId, companyId },
    select: { id: true, code: true, name: true, endDate: true },
  });
  if (!term) throw new BoardingSessionError("Term not found", 404);
  return term;
}

/**
 * What closing this term's boarding would end.
 *
 * "This ends 215 allocations and frees 215 beds, 88 of them in Nyanga House" —
 * in front of the warden before they press anything.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const term = await termOrRefuse(companyId, id);
    const plan = await planTermClose(prisma, { companyId, termId: term.id });

    return successResponse({
      ...plan,
      term: { id: term.id, code: term.code, name: term.name },
    });
  } catch (error) {
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] GET /api/v2/schools/boarding/terms/[id]/close error:",
      error,
    );
    return errorResponse("Failed to preview the term close");
  }
}

/**
 * Close the term's boarding.
 *
 * Every ACTIVE allocation becomes ENDED with an end date. ENDED rather than
 * deleted, always: "who slept in bed 12 last October" is a safeguarding
 * question, and the beds come free anyway because free is computed from live
 * allocations rather than from the absence of a row.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // `archive`, which the WARDEN persona deliberately does not hold. Ending
    // every allocation in a term is a two-hundred-row act the school does once
    // a term, not warden work on a Tuesday — it stays with the head.
    const denied = schoolPermissionDenial(session, "schools.boarding", "archive");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const companyId = session.user.companyId;

    const body = await request.json().catch(() => ({}));
    const validated = closeSchema.parse(body ?? {});

    const term = await termOrRefuse(companyId, id);
    const endDate = validated.endDate ? new Date(validated.endDate) : term.endDate;

    const plan = await planTermClose(prisma, { companyId, termId: term.id });
    const { ended } = await applyTermClose(prisma, {
      companyId,
      termId: term.id,
      endDate,
    });

    return successResponse({
      termId: term.id,
      endDate,
      ended,
      byHostel: plan.byHostel,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error(
      "[API] POST /api/v2/schools/boarding/terms/[id]/close error:",
      error,
    );
    return errorResponse("Failed to close boarding for the term");
  }
}
