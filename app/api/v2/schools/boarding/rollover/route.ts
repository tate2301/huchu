import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { applyRollover, planRollover } from "@/lib/schools/boarding-rollover";
import { BoardingSessionError } from "@/lib/schools/boarding-sessions";

const previewQuerySchema = z.object({
  fromTermId: z.string().uuid(),
  toTermId: z.string().uuid(),
});

const commitSchema = z.object({
  fromTermId: z.string().uuid(),
  toTermId: z.string().uuid(),
  startDate: z
    .string()
    .trim()
    .min(1)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Invalid date value",
    })
    .optional(),
});

/**
 * Both terms exist and belong to this school, and they are not the same one.
 *
 * Checked in the route rather than in the domain layer because it is a scoping
 * question, and a rollover that silently reads another tenant's term is the
 * kind of bug that only shows up as somebody else's children appearing on a
 * bed board.
 */
async function bothTerms(companyId: string, fromTermId: string, toTermId: string) {
  if (fromTermId === toTermId) {
    throw new BoardingSessionError(
      "A term cannot be carried over into itself",
      400,
    );
  }
  const terms = await prisma.schoolTerm.findMany({
    where: { companyId, id: { in: [fromTermId, toTermId] } },
    select: { id: true, code: true, name: true, startDate: true },
  });
  const from = terms.find((term) => term.id === fromTermId);
  const to = terms.find((term) => term.id === toTermId);
  if (!from) throw new BoardingSessionError("Term to carry over from not found", 404);
  if (!to) throw new BoardingSessionError("Term to carry over into not found", 404);
  return { from, to };
}

/**
 * What opening the next term would do.
 *
 * Reads only. The warden sees three lists — who gets their bed back, who needs
 * placing by hand, and who is not coming back — before anything is written. A
 * mass allocation nobody previewed is how a school loses a term of data, and
 * "it was only a button" is how it gets explained afterwards.
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "view");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;
    const { searchParams } = new URL(request.url);
    const query = previewQuerySchema.parse({
      fromTermId: searchParams.get("fromTermId") ?? undefined,
      toTermId: searchParams.get("toTermId") ?? undefined,
    });

    const { from, to } = await bothTerms(
      companyId,
      query.fromTermId,
      query.toTermId,
    );

    const plan = await planRollover(prisma, {
      companyId,
      fromTermId: query.fromTermId,
      toTermId: query.toTermId,
    });

    return successResponse({
      ...plan,
      fromTerm: { id: from.id, code: from.code, name: from.name },
      toTerm: { id: to.id, code: to.code, name: to.name },
      counts: {
        carriedOver: plan.carriedOver.length,
        needsPlacing: plan.needsPlacing.length,
        notReturning: plan.notReturning.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] GET /api/v2/schools/boarding/rollover error:", error);
    return errorResponse("Failed to preview the rollover");
  }
}

/**
 * Commit the carry-over half of the plan.
 *
 * The plan is recomputed here rather than accepted from the client: the
 * preview the warden looked at may be minutes old, and a bed taken in between
 * must not be double-allocated on the strength of a stale payload.
 *
 * Only `carriedOver` is written. `needsPlacing` is a worklist for a person and
 * `notReturning` is information — inventing a bed for either would be the
 * system making a placement decision a warden should make.
 */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.boarding", "allocate-bed");
    if (denied) return errorResponse(denied, 403);

    const companyId = session.user.companyId;
    const body = await request.json();
    const validated = commitSchema.parse(body);

    const { to } = await bothTerms(
      companyId,
      validated.fromTermId,
      validated.toTermId,
    );

    const plan = await planRollover(prisma, {
      companyId,
      fromTermId: validated.fromTermId,
      toTermId: validated.toTermId,
    });

    const startDate = validated.startDate
      ? new Date(validated.startDate)
      : to.startDate;

    const { created } = await applyRollover(prisma, {
      companyId,
      toTermId: validated.toTermId,
      candidates: plan.carriedOver,
      startDate,
    });

    return successResponse({
      fromTermId: validated.fromTermId,
      toTermId: validated.toTermId,
      created,
      // Handed back with the result so the screen can go straight to the short
      // list of children a person still has to place.
      needsPlacing: plan.needsPlacing,
      notReturning: plan.notReturning,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof BoardingSessionError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/schools/boarding/rollover error:", error);
    return errorResponse("Failed to carry boarding over into the new term");
  }
}
