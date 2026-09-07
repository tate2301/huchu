import { Prisma } from "@corelithzw/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { normalizeProvidedId } from "@corelithzw/platform/id-generator";
import { buildCustomFieldValues, mergeCustomFields } from "@corelithzw/module-records/custom-fields";
import { prisma } from "@corelithzw/db/client";
import { isSchoolAdmin, schoolPermissionDenial } from "../../../../../permissions";
import {
  isUniqueConstraintError,
  normalizeOptionalNullableString,
} from "../../_helpers";

const updateGuardianSchema = z
  .object({
    guardianNo: z.string().trim().min(1).max(40).optional(),
    firstName: z.string().trim().min(1).max(120).optional(),
    lastName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(3).max(50).optional(),
    email: z.string().trim().email().nullable().optional(),
    address: z.string().trim().min(1).max(500).nullable().optional(),
    nationalId: z.string().trim().min(1).max(80).nullable().optional(),
    // S-4.3 — the record page's identity strip.
    avatarUrl: z.string().trim().url().max(2000).nullable().optional(),
    accent: z.string().trim().min(1).max(40).nullable().optional(),
    // S-4.4 — the school's own fields. Partial: only the keys sent are touched.
    customFields: z.record(z.string(), z.unknown()).optional(),
    clearCustomFields: z.array(z.string()).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const guardianDetailInclude = {
  studentLinks: {
    include: {
      student: {
        select: {
          id: true,
          studentNo: true,
          admissionNo: true,
          firstName: true,
          lastName: true,
          dateOfBirth: true,
          status: true,
          currentClass: { select: { id: true, code: true, name: true } },
          currentStream: { select: { id: true, code: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" as const },
  },
  _count: {
    select: {
      studentLinks: true,
    },
  },
} satisfies Prisma.SchoolGuardianInclude;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.students", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
    }

    const guardian = await prisma.schoolGuardian.findFirst({
      where: { id, companyId: session.user.companyId },
      include: guardianDetailInclude,
    });

    if (!guardian) {
      return errorResponse("Guardian not found", 404);
    }

    return successResponse(guardian);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to fetch guardian profile");
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

    const denied = schoolPermissionDenial(session, "schools.students", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
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

    const validated = updateGuardianSchema.parse(body);

    const existing = await prisma.schoolGuardian.findFirst({
      where: { id, companyId },
      select: { id: true, customFields: true },
    });
    if (!existing) {
      return errorResponse("Guardian not found", 404);
    }

    let normalizedGuardianNo: string | undefined;
    if (validated.guardianNo !== undefined) {
      try {
        normalizedGuardianNo = normalizeProvidedId(
          validated.guardianNo,
          "SCHOOL_GUARDIAN",
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid guardian number format";
        return errorResponse(message, 400);
      }
    }

    // S-4.4 — validated and merged by the same code the CRM records use, so a
    // school's SINGLE_SELECT rejects an unlisted option here exactly as it does
    // there. Partial, so patching a phone number leaves the custom fields alone.
    let nextCustomFields: Prisma.InputJsonValue | undefined;
    if (validated.customFields !== undefined || validated.clearCustomFields !== undefined) {
      const definitions = await prisma.crmFieldDefinition.findMany({
        where: { companyId, entity: "GUARDIAN", archivedAt: null },
      });
      const built = buildCustomFieldValues(definitions, validated.customFields ?? {}, {
        partial: true,
      });
      if (built.errors.length > 0) {
        return errorResponse("Validation failed", 400, built.errors);
      }
      nextCustomFields = mergeCustomFields(
        existing.customFields,
        built.values,
        validated.clearCustomFields ?? [],
      ) as Prisma.InputJsonValue;
    }

    const updated = await prisma.schoolGuardian.update({
      where: { id: existing.id },
      data: {
        ...(nextCustomFields !== undefined ? { customFields: nextCustomFields } : {}),
        ...(validated.avatarUrl !== undefined ? { avatarUrl: validated.avatarUrl } : {}),
        ...(validated.accent !== undefined ? { accent: validated.accent } : {}),
        ...(normalizedGuardianNo !== undefined
          ? { guardianNo: normalizedGuardianNo }
          : {}),
        ...(validated.firstName !== undefined ? { firstName: validated.firstName } : {}),
        ...(validated.lastName !== undefined ? { lastName: validated.lastName } : {}),
        ...(validated.phone !== undefined ? { phone: validated.phone } : {}),
        ...(validated.email !== undefined
          ? { email: normalizeOptionalNullableString(validated.email) ?? null }
          : {}),
        ...(validated.address !== undefined
          ? { address: normalizeOptionalNullableString(validated.address) ?? null }
          : {}),
        ...(validated.nationalId !== undefined
          ? { nationalId: normalizeOptionalNullableString(validated.nationalId) ?? null }
          : {}),
      },
      include: guardianDetailInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("Guardian number already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to update guardian profile");
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

    const denied = schoolPermissionDenial(session, "schools.students", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid guardian ID", 400);
    }

    const existing = await prisma.schoolGuardian.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        _count: {
          select: {
            studentLinks: true,
          },
        },
      },
    });
    if (!existing) {
      return errorResponse("Guardian not found", 404);
    }

    if (existing._count.studentLinks > 0) {
      return errorResponse(
        "Cannot delete guardian because it is linked to students",
        409,
      );
    }

    await prisma.schoolGuardian.delete({
      where: { id: existing.id },
    });
    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return errorResponse("Cannot delete guardian because it is linked to students", 409);
    }
    console.error("[API] DELETE /api/v2/schools/guardians/[id] error:", error);
    return errorResponse("Failed to delete guardian");
  }
}
