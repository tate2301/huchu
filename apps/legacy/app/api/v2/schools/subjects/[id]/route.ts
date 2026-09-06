import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { isSchoolAdmin, schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import { isUniqueConstraintError } from "../../_helpers";

const updateSubjectSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    isCore: z.boolean().optional(),
    passMark: z.number().finite().min(0).max(100).optional(),
    isActive: z.boolean().optional(),
    // S-4.3 — the record page's identity strip. A subject is a thing, so it may
    // carry an emoji: 📐 reads faster down a list than a repeated generic icon.
    avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
    emoji: z.string().trim().min(1).max(16).nullable().optional(),
    accent: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const subjectDetailInclude = {
  /**
   * S-4.3 — who teaches this subject, and to whom.
   *
   * The include used to be `_count.classSubjects` alone, which answers "how many"
   * and is enough for a list of subjects. The record page is opened to ask which
   * classes take it and who teaches each, so it needs the rows.
   */
  classSubjects: {
    include: {
      class: { select: { id: true, code: true, name: true } },
      stream: { select: { id: true, code: true, name: true } },
      term: { select: { id: true, code: true, name: true } },
      teacherProfile: {
        select: {
          id: true,
          employeeCode: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: {
      classSubjects: true,
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

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid subject ID", 400);
    }

    const subject = await prisma.schoolSubject.findFirst({
      where: { id, companyId: session.user.companyId },
      include: subjectDetailInclude,
    });
    if (!subject) {
      return errorResponse("Subject not found", 404);
    }

    return successResponse(subject);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/subjects/[id] error:", error);
    return errorResponse("Failed to fetch subject");
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

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid subject ID", 400);
    }

    const body = await request.json();
    // How a record is presented — its picture, emoji, accent — is an
    // administrator's act; see `isSchoolAdmin`. Everything else on this
    // route stays with the resource's own edit grant.
    if (
      ("avatarUrl" in body || "emoji" in body || "accent" in body) &&
      !isSchoolAdmin(session.user.role)
    ) {
      return errorResponse("Only an administrator can change a record's display image", 403);
    }

    const validated = updateSubjectSchema.parse(body);

    const existing = await prisma.schoolSubject.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    if (!existing) {
      return errorResponse("Subject not found", 404);
    }

    const updated = await prisma.schoolSubject.update({
      where: { id: existing.id },
      data: {
        ...(validated.avatarUrl !== undefined ? { avatarUrl: validated.avatarUrl } : {}),
        ...(validated.emoji !== undefined ? { emoji: validated.emoji } : {}),
        ...(validated.accent !== undefined ? { accent: validated.accent } : {}),
        ...(validated.code !== undefined ? { code: validated.code } : {}),
        ...(validated.name !== undefined ? { name: validated.name } : {}),
        ...(validated.isCore !== undefined ? { isCore: validated.isCore } : {}),
        ...(validated.passMark !== undefined ? { passMark: validated.passMark } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
      },
      include: subjectDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A subject with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/subjects/[id] error:", error);
    return errorResponse("Failed to update subject");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid subject ID", 400);
    }

    const existing = await prisma.schoolSubject.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        _count: {
          select: {
            classSubjects: true,
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("Subject not found", 404);
    }

    if (existing._count.classSubjects > 0) {
      return errorResponse(
        "Cannot delete subject because it is linked to class assignments",
        409,
      );
    }

    await prisma.schoolSubject.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/subjects/[id] error:", error);
    return errorResponse("Failed to delete subject");
  }
}
