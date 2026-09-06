import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { isSchoolAdmin, schoolPermissionDenial } from "@/lib/schools/permissions";

/**
 * S-4.3 — what a record page may edit about a teacher.
 *
 * Deliberately narrow. A teacher is one person with two records: this profile,
 * which is the school's view of them, and an `Employee`, which is payroll's
 * (S-1.7). Name, email and phone live on the `User`, and employment terms live
 * on the `Employee`; editing either from here would put two screens in charge of
 * one fact. What is left is genuinely the school's: which department they are in,
 * whether they hold a form, whether they are a head of department, and whether
 * they are still teaching.
 */
const updateTeacherSchema = z
  .object({
    department: z.string().trim().min(1).max(120).nullable().optional(),
    isClassTeacher: z.boolean().optional(),
    isHod: z.boolean().optional(),
    isActive: z.boolean().optional(),
    avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
    accent: z.string().trim().min(1).max(40).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

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

    const { id } = await params;
    if (!isValidUUID(id)) return errorResponse("Invalid teacher ID", 400);

    const body = (await request.json()) as Record<string, unknown>;
    // How a record is presented — its picture, emoji, accent — is an
    // administrator's act; see `isSchoolAdmin`. Everything else on this
    // route stays with the resource's own edit grant.
    if (
      ("avatarUrl" in body || "emoji" in body || "accent" in body) &&
      !isSchoolAdmin(session.user.role)
    ) {
      return errorResponse("Only an administrator can change a record's display image", 403);
    }

    const validated = updateTeacherSchema.parse(body);

    const existing = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true },
    });
    if (!existing) return errorResponse("Teacher not found", 404);

    const updated = await prisma.schoolTeacherProfile.update({
      where: { id: existing.id },
      data: {
        ...(validated.department !== undefined ? { department: validated.department } : {}),
        ...(validated.isClassTeacher !== undefined
          ? { isClassTeacher: validated.isClassTeacher }
          : {}),
        ...(validated.isHod !== undefined ? { isHod: validated.isHod } : {}),
        ...(validated.isActive !== undefined ? { isActive: validated.isActive } : {}),
        ...(validated.avatarUrl !== undefined ? { avatarUrl: validated.avatarUrl } : {}),
        ...(validated.accent !== undefined ? { accent: validated.accent } : {}),
      },
      include: {
        user: { select: { id: true, email: true, name: true, phone: true, isActive: true } },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/teachers/[id] error:", error);
    return errorResponse("Failed to update teacher profile");
  }
}

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
      return errorResponse("Invalid teacher ID", 400);
    }

    const teacher = await prisma.schoolTeacherProfile.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
            isActive: true,
          },
        },
        // The HR record for the same person, so the record page can say whether
        // payroll knows this teacher exists and offer to join them up. The list
        // has carried this since S-1.7; the record page sent the reader back to
        // the list to act on it.
        employee: {
          select: { id: true, employeeId: true, name: true, jobTitle: true },
        },
        assignments: {
          include: {
            term: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
            subject: { select: { id: true, code: true, name: true, isCore: true } },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            assignments: true,
          },
        },
      },
    });

    if (!teacher) {
      return errorResponse("Teacher not found", 404);
    }

    return successResponse(teacher);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/teachers/[id] error:", error);
    return errorResponse("Failed to fetch teacher profile");
  }
}
