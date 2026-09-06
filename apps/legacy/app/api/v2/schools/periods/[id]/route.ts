import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { findOverlappingPeriod, isValidPeriodRange } from "@/lib/schools/timetable";
import { isUniqueConstraintError } from "../../_helpers";

const updateSchema = z
  .object({
    code: z.string().trim().min(1).max(40).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    startMinute: z.number().int().min(0).max(1440).optional(),
    endMinute: z.number().int().min(0).max(1440).optional(),
    sequence: z.number().int().min(0).max(100).optional(),
    isTeaching: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });

const periodSelect = {
  id: true,
  code: true,
  name: true,
  startMinute: true,
  endMinute: true,
  sequence: true,
  isTeaching: true,
  termId: true,
  term: { select: { id: true, code: true, name: true } },
  _count: { select: { slots: true } },
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
    if (!isValidUUID(id)) return errorResponse("Invalid period id", 400);

    const record = await prisma.schoolPeriod.findFirst({
      where: { id, companyId: session.user.companyId },
      select: periodSelect,
    });
    if (!record) return errorResponse("Period not found", 404);

    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/periods/[id] error:", error);
    return errorResponse("Failed to fetch period");
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
    if (!isValidUUID(id)) return errorResponse("Invalid period id", 400);

    const existing = await prisma.schoolPeriod.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        termId: true,
        startMinute: true,
        endMinute: true,
        isTeaching: true,
        _count: { select: { slots: true } },
      },
    });
    if (!existing) return errorResponse("Period not found", 404);

    const validated = updateSchema.parse(await request.json());

    const startMinute = validated.startMinute ?? existing.startMinute;
    const endMinute = validated.endMinute ?? existing.endMinute;

    if (!isValidPeriodRange(startMinute, endMinute)) {
      return errorResponse("A period must end after it starts", 400);
    }

    if (validated.startMinute !== undefined || validated.endMinute !== undefined) {
      const overlapping = await findOverlappingPeriod({
        companyId,
        termId: existing.termId,
        startMinute,
        endMinute,
        excludePeriodId: existing.id,
      });
      if (overlapping) {
        return errorResponse(
          `These times overlap ${overlapping.name}.`,
          409,
        );
      }
    }

    // Turning a period into break time with lessons still in it would leave
    // those lessons scheduled in a slot nothing may be scheduled in. The
    // timetabler has to move them first, and is told how many.
    if (validated.isTeaching === false && existing.isTeaching && existing._count.slots > 0) {
      return errorResponse(
        `${existing._count.slots} lesson${existing._count.slots === 1 ? " is" : "s are"} scheduled in this period. Move them before making it a non-teaching period.`,
        409,
      );
    }

    const updated = await prisma.schoolPeriod.update({
      where: { id: existing.id },
      data: validated,
      select: periodSelect,
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (isUniqueConstraintError(error)) {
      return errorResponse("A period with this code already exists", 409);
    }
    console.error("[API] PATCH /api/v2/schools/periods/[id] error:", error);
    return errorResponse("Failed to update period");
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
    if (!isValidUUID(id)) return errorResponse("Invalid period id", 400);

    const existing = await prisma.schoolPeriod.findFirst({
      where: { id, companyId: session.user.companyId },
      select: { id: true, name: true, _count: { select: { slots: true } } },
    });
    if (!existing) return errorResponse("Period not found", 404);

    // The FK cascades, so deleting here would silently take a day's lessons
    // with it. Refuse and say how many, as the year and term routes do.
    if (existing._count.slots > 0) {
      return errorResponse(
        `${existing.name} has ${existing._count.slots} lesson${existing._count.slots === 1 ? "" : "s"} scheduled in it. Remove them before deleting the period.`,
        409,
      );
    }

    await prisma.schoolPeriod.delete({ where: { id: existing.id } });
    return successResponse({ id: existing.id });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/periods/[id] error:", error);
    return errorResponse("Failed to delete period");
  }
}
