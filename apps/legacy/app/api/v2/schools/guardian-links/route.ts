import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { canViewAnyPortalSubject } from "@/lib/schools/portal-identity";
import { isUniqueConstraintError } from "../_helpers";

/**
 * Attaching a child to a guardian.
 *
 * The links could only ever be created in the same breath as the guardian —
 * `POST /api/v2/schools/guardians` takes a `studentLinks` array — so a second
 * child born into a family already on the books had no route at all, and the
 * office's answer was to create the parent twice. This is the missing verb.
 *
 * Same guard as the sibling PATCH: school staff only, because consent is the
 * school's record of what it may tell whom and a parent granting themselves
 * the fee notices would empty it of meaning. The persona grant is checked as
 * well, so the button that offers this and the endpoint behind it agree.
 */

const createSchema = z.object({
  guardianId: z.string().uuid(),
  studentId: z.string().uuid(),
  relationship: z.string().trim().min(1).max(60),
  isPrimary: z.boolean().optional(),
  canReceiveFinancials: z.boolean().optional(),
  canReceiveAcademicResults: z.boolean().optional(),
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

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);

    if (!canViewAnyPortalSubject(session.user.role)) {
      return errorResponse("Guardian links are managed by school staff", 403);
    }

    const companyId = session.user.companyId;
    const validated = createSchema.parse(await request.json());

    const [guardian, student] = await Promise.all([
      prisma.schoolGuardian.findFirst({
        where: { id: validated.guardianId, companyId },
        select: { id: true },
      }),
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true },
      }),
    ]);

    if (!guardian) return errorResponse("Guardian not found in this school", 404);
    if (!student) return errorResponse("Pupil not found in this school", 404);

    // One primary guardian per pupil, the same rule the PATCH enforces — the
    // two would otherwise disagree the moment a family's second parent was
    // added as the first point of contact.
    const created = await prisma.$transaction(async (tx) => {
      if (validated.isPrimary === true) {
        await tx.schoolStudentGuardian.updateMany({
          where: { companyId, studentId: validated.studentId },
          data: { isPrimary: false },
        });
      }

      return tx.schoolStudentGuardian.create({
        data: {
          companyId,
          guardianId: validated.guardianId,
          studentId: validated.studentId,
          relationship: validated.relationship,
          isPrimary: validated.isPrimary ?? false,
          canReceiveFinancials: validated.canReceiveFinancials ?? true,
          canReceiveAcademicResults: validated.canReceiveAcademicResults ?? true,
        },
        select: linkSelect,
      });
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("This guardian is already linked to that pupil", 409);
    }
    console.error("[API] POST /api/v2/schools/guardian-links error:", error);
    return errorResponse("Failed to link the guardian to the pupil");
  }
}
