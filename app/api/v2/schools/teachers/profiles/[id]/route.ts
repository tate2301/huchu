import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { prisma } from "@/lib/prisma";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
} from "../../../_helpers";

const updateProfileSchema = z
  .object({
    userId: z.string().uuid().optional(),
    employeeCode: z.string().trim().min(1).max(40).optional(),
    department: z.string().trim().min(1).max(120).nullable().optional(),
    isClassTeacher: z.boolean().optional(),
    isHod: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const teacherProfileDetailInclude = {
  user: {
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      isActive: true,
    },
  },
  assignments: {
    include: {
      term: { select: { id: true, code: true, name: true } },
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      subject: { select: { id: true, code: true, name: true, isCore: true } },
    },
    orderBy: { createdAt: "desc" as const },
  },
  _count: {
    select: {
      assignments: true,
    },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid teacher profile ID", 400);
    }

    const profile = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      include: teacherProfileDetailInclude,
    });
    if (!profile) {
      return errorResponse("Teacher profile not found", 404);
    }

    return successResponse(profile);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/profiles/[id] error:", error);
    return errorResponse("Failed to fetch teacher profile");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid teacher profile ID", 400);
    }

    const body = await request.json();
    const validated = updateProfileSchema.parse(body);

    const existing = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Teacher profile not found", 404);
    }

    if (validated.userId) {
      const user = await prisma.user.findFirst({
        where: { id: validated.userId, companyId },
        select: { id: true },
      });
      if (!user) {
        return errorResponse("Selected user does not belong to this company", 400);
      }
    }

    const updated = await prisma.schoolTeacherProfile.update({
      where: { id: existing.id },
      data: {
        ...(validated.userId !== undefined ? { userId: validated.userId } : {}),
        ...(validated.employeeCode !== undefined
          ? { employeeCode: validated.employeeCode.trim().toUpperCase() }
          : {}),
        ...(validated.department !== undefined
          ? { department: normalizeOptionalNullableString(validated.department) ?? null }
          : {}),
        ...(validated.isClassTeacher !== undefined
          ? { isClassTeacher: validated.isClassTeacher }
          : {}),
        ...(validated.isHod !== undefined ? { isHod: validated.isHod } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      include: teacherProfileDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Teacher profile already exists for this user or employee code", 409);
    }
    console.error("[API] PATCH /api/v2/schools/teachers/profiles/[id] error:", error);
    return errorResponse("Failed to update teacher profile");
  }
}

/**
 * Archiving a teacher profile.
 *
 * The grant this checks is `archive`, and it now does that: `isActive` goes
 * false and the profile stays. It used to call `delete`, which cascades the
 * person out of the timetable and the cover rota, and the "linked to class
 * assignments" refusal meant the one act the staff list offers — taking a
 * teacher who has left off it — was impossible for every teacher who had ever
 * taught. Reinstating is an ordinary PATCH of the same field.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.teachers", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid teacher profile ID", 400);
    }

    const existing = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId },
      select: { id: true, isActive: true },
    });
    if (!existing) {
      return errorResponse("Teacher profile not found", 404);
    }

    if (!existing.isActive) {
      return successResponse({ id: existing.id, isActive: existing.isActive });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.schoolTeacherProfile.update({
        where: { id: existing.id },
        data: { isActive: false },
        select: { id: true, isActive: true },
      });
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.teacher.archived",
        entityType: "SchoolTeacherProfile",
        entityId: row.id,
      });
      return row;
    });

    return successResponse(updated);
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/teachers/profiles/[id] error:", error);
    return errorResponse("Failed to archive teacher profile");
  }
}
