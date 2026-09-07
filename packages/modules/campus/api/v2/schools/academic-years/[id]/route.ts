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
import {
  activateAcademicYear,
  findOverlappingAcademicYear,
  isDateRangeValid,
} from "../../../../../calendar";
import { isUniqueConstraintError, optionalDateInputSchema } from "../../_helpers";

const updateSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    startDate: optionalDateInputSchema,
    endDate: optionalDateInputSchema,
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const academicYearInclude = {
  terms: {
    select: {
      id: true,
      code: true,
      name: true,
      startDate: true,
      endDate: true,
      isActive: true,
    },
    orderBy: { startDate: "asc" as const },
  },
  _count: { select: { terms: true, classes: true } },
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid academic year id", 400);

    const record = await prisma.schoolAcademicYear.findFirst({
      where: { id, companyId: session.user.companyId },
      include: academicYearInclude,
    });
    if (!record) return errorResponse("Academic year not found", 404);

    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/academic-years/[id] error:", error);
    return errorResponse("Failed to fetch academic year");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid academic year id", 400);

    const existing = await prisma.schoolAcademicYear.findFirst({
      where: { id, companyId },
      select: { id: true, startDate: true, endDate: true },
    });
    if (!existing) return errorResponse("Academic year not found", 404);

    const validated = updateSchema.parse(await request.json());
    const startDate = validated.startDate
      ? new Date(validated.startDate)
      : existing.startDate;
    const endDate = validated.endDate ? new Date(validated.endDate) : existing.endDate;

    if (!isDateRangeValid(startDate, endDate)) {
      return errorResponse("The year must end after it starts", 400);
    }

    if (validated.startDate || validated.endDate) {
      const overlapping = await findOverlappingAcademicYear({
        companyId,
        startDate,
        endDate,
        excludeYearId: id,
      });
      if (overlapping) {
        return errorResponse(
          `These dates overlap ${overlapping.code} - ${overlapping.name}. Academic years cannot overlap.`,
          409,
        );
      }
    }

    // Deactivating is a plain write; activating has to stand the current year
    // down first, so it goes through the transaction in calendar.ts.
    if (validated.isActive === true) {
      await activateAcademicYear({ companyId, academicYearId: id });
    }

    const updated = await prisma.schoolAcademicYear.update({
      where: { id },
      data: {
        ...(validated.code === undefined ? {} : { code: validated.code }),
        ...(validated.name === undefined ? {} : { name: validated.name }),
        ...(validated.startDate === undefined ? {} : { startDate }),
        ...(validated.endDate === undefined ? {} : { endDate }),
        ...(validated.isActive === false ? { isActive: false } : {}),
      },
      include: academicYearInclude,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("An academic year with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/academic-years/[id] error:", error);
    return errorResponse("Failed to update academic year");
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.academics", "archive");
    if (denied) return errorResponse(denied, 403);
    const { id } = await context.params;
    if (!isValidUUID(id)) return errorResponse("Invalid academic year id", 400);

    const existing = await prisma.schoolAcademicYear.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, _count: { select: { terms: true, classes: true } } },
    });
    if (!existing) return errorResponse("Academic year not found", 404);

    // Terms cascade, and everything term-scoped hangs off them, so a year with
    // terms is never safe to remove — the school archives it instead.
    if (existing._count.terms > 0 || existing._count.classes > 0) {
      return errorResponse(
        "This academic year has terms or classes attached and cannot be deleted",
        409,
      );
    }

    await prisma.schoolAcademicYear.delete({ where: { id } });
    return successResponse({ id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/academic-years/[id] error:", error);
    return errorResponse("Failed to delete academic year");
  }
}
