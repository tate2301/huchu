import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import { canViewAnyPortalSubject } from "../../../../../portal-identity";

/**
 * The link between a student and a guardian, and what that guardian may see.
 *
 * `canReceiveFinancials` and `canReceiveAcademicResults` were previously set
 * once, when the link was created, and never changeable — so a school could
 * grant consent but never withdraw it. A separated parent who should come off
 * the financial list stayed on it for good.
 *
 * Only school staff may change these. A guardian editing their own consent
 * would defeat the point of the school holding it.
 */

const updateSchema = z
  .object({
    relationship: z.string().trim().min(1).max(60).optional(),
    isPrimary: z.boolean().optional(),
    canReceiveFinancials: z.boolean().optional(),
    canReceiveAcademicResults: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const linkSelect = {
  id: true,
  relationship: true,
  isPrimary: true,
  canReceiveFinancials: true,
  canReceiveAcademicResults: true,
  student: { select: { id: true, studentNo: true, firstName: true, lastName: true } },
  guardian: { select: { id: true, guardianNo: true, firstName: true, lastName: true } },
} as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Guardian consent is managed by school staff", 403);
    }

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid link id", 400);

    const companyId = session.user.companyId;
    const existing = await prisma.schoolStudentGuardian.findFirst({
      where: { id, companyId },
      select: { id: true, studentId: true },
    });
    if (!existing) return errorResponse("Guardian link not found", 404);

    const validated = updateSchema.parse(await request.json());

    // One primary guardian per student — promoting this link demotes the rest
    // in the same transaction, so a student never has two people who both
    // believe they are the first point of contact.
    const updated = await prisma.$transaction(async (tx) => {
      if (validated.isPrimary === true) {
        await tx.schoolStudentGuardian.updateMany({
          where: { companyId, studentId: existing.studentId, id: { not: id } },
          data: { isPrimary: false },
        });
      }

      return tx.schoolStudentGuardian.update({
        where: { id },
        data: {
          ...(validated.relationship === undefined
            ? {}
            : { relationship: validated.relationship }),
          ...(validated.isPrimary === undefined
            ? {}
            : { isPrimary: validated.isPrimary }),
          ...(validated.canReceiveFinancials === undefined
            ? {}
            : { canReceiveFinancials: validated.canReceiveFinancials }),
          ...(validated.canReceiveAcademicResults === undefined
            ? {}
            : { canReceiveAcademicResults: validated.canReceiveAcademicResults }),
        },
        select: linkSelect,
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/guardian-links/[id] error:", error);
    return errorResponse("Failed to update the guardian link");
  }
}

/**
 * Detach a guardian from a pupil.
 *
 * The `archive` grant rather than `edit`: withdrawing a link is how a parent
 * stops receiving everything about a child at once, and getting it wrong is
 * not a typo somebody notices on the next screen. The row goes rather than
 * being flagged, because a link is the consent — a dormant one that could be
 * re-read as live is the state this was meant to prevent.
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "archive");
    if (denied) return errorResponse(denied, 403);

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Guardian consent is managed by school staff", 403);
    }

    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid link id", 400);

    const existing = await prisma.schoolStudentGuardian.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Guardian link not found", 404);

    await prisma.schoolStudentGuardian.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/guardian-links/[id] error:", error);
    return errorResponse("Failed to remove the guardian link");
  }
}
