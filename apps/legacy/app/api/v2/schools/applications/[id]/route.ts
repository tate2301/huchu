import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  moveApplication,
  StageTransitionError,
  type ApplicationStage,
} from "@/lib/schools/admissions";

const STAGES = [
  "ENQUIRY",
  "APPLIED",
  "ASSESSMENT",
  "WAITLISTED",
  "OFFERED",
  "ACCEPTED",
  "DECLINED",
  "WITHDRAWN",
] as const;

const patchSchema = z.object({
  stage: z.enum(STAGES).optional(),
  comment: z.string().trim().max(500).nullish(),
  offerExpiresAt: z.string().date().nullish(),
  assessmentScore: z.number().min(0).max(100).nullish(),
  assessmentAt: z.string().date().nullish(),
  appliedForClassId: z.string().uuid().nullish(),
  notes: z.string().trim().max(1000).nullish(),
  guardianName: z.string().trim().max(120).nullish(),
  guardianPhone: z.string().trim().max(40).nullish(),
  guardianEmail: z.string().trim().max(160).nullish(),
});

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await context.params;
    const application = await prisma.schoolApplication.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        appliedForClass: { select: { id: true, code: true, name: true } },
        intendedTerm: { select: { id: true, code: true, name: true } },
        // Newest first: "who turned her down in March" is answered from the
        // bottom of the pipeline, not the top.
        events: { orderBy: { actedAt: "desc" }, take: 50 },
      },
    });
    if (!application) return errorResponse("Application not found", 404);

    return successResponse(application);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/applications/[id] error:", error);
    return errorResponse("Failed to fetch the application");
  }
}

/**
 * Change an application: its details, its stage, or both.
 *
 * A stage change goes through `moveApplication` so the pipeline rules and the
 * trail apply; the plain fields are updated alongside. Doing the two in one
 * request is what lets "she sat the test and scored 72, move her to offered" be
 * one action rather than two.
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.admissions", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { id } = await context.params;
    const existing = await prisma.schoolApplication.findFirst({
      where: { id, companyId },
      select: { id: true, stage: true },
    });
    if (!existing) return errorResponse("Application not found", 404);

    const validated = patchSchema.parse(await request.json());

    // A decision — offering, turning down, waitlisting — needs the approve
    // grant, not merely the edit grant. Correcting a phone number is not the
    // same act as refusing a child a place.
    if (validated.stage && validated.stage !== existing.stage) {
      const decisionDenied = schoolPermissionDenial(
        session,
        "schools.admissions",
        "approve",
      );
      if (decisionDenied) return errorResponse(decisionDenied, 403);
    }

    const fieldUpdates = {
      ...(validated.assessmentScore !== undefined
        ? { assessmentScore: validated.assessmentScore }
        : {}),
      ...(validated.assessmentAt !== undefined
        ? {
            assessmentAt: validated.assessmentAt
              ? new Date(validated.assessmentAt)
              : null,
          }
        : {}),
      ...(validated.appliedForClassId !== undefined
        ? { appliedForClassId: validated.appliedForClassId ?? null }
        : {}),
      ...(validated.notes !== undefined ? { notes: validated.notes ?? null } : {}),
      ...(validated.guardianName !== undefined
        ? { guardianName: validated.guardianName ?? null }
        : {}),
      ...(validated.guardianPhone !== undefined
        ? { guardianPhone: validated.guardianPhone ?? null }
        : {}),
      ...(validated.guardianEmail !== undefined
        ? { guardianEmail: validated.guardianEmail || null }
        : {}),
    };

    if (Object.keys(fieldUpdates).length > 0) {
      await prisma.schoolApplication.update({ where: { id }, data: fieldUpdates });
    }

    if (validated.stage) {
      await moveApplication({
        companyId,
        applicationId: id,
        toStage: validated.stage as ApplicationStage,
        actorUserId: session.user.id,
        comment: validated.comment ?? null,
        offerExpiresAt: validated.offerExpiresAt
          ? new Date(validated.offerExpiresAt)
          : null,
      });
    }

    const updated = await prisma.schoolApplication.findUniqueOrThrow({
      where: { id },
      select: { id: true, applicationNo: true, stage: true },
    });
    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof StageTransitionError) {
      return errorResponse(error.message, 409);
    }
    console.error("[API] PATCH /api/v2/schools/applications/[id] error:", error);
    return errorResponse("Failed to update the application");
  }
}
