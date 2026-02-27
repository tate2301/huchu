import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, hasRole, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

function normalizeShiftLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const shiftLabelSchema = z
  .string()
  .trim()
  .min(1, "Shift is required")
  .max(50, "Shift must be 50 characters or less")
  .transform(normalizeShiftLabel);

const attendanceUpdateSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  shift: shiftLabelSchema.optional(),
  shiftGroupId: z.string().uuid().nullable().optional(),
  shiftLeaderId: z.string().uuid().nullable().optional(),
  status: z.enum(["PRESENT", "ABSENT", "LATE"]).optional(),
  overtime: z.number().min(0).max(24).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { id } = await params;

    const record = await prisma.attendance.findUnique({
      where: { id },
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
        site: { select: { id: true, name: true, code: true, companyId: true } },
        shiftGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            leader: { select: { id: true, name: true, employeeId: true } },
          },
        },
      },
    });

    if (!record) {
      return errorResponse("Attendance record not found", 404);
    }

    if (record.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    return successResponse(record);
  } catch (error) {
    console.error("[API] GET /api/attendance/[id] error:", error);
    return errorResponse("Failed to fetch attendance record");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("Only SUPERADMIN can update attendance records.", 403);
    }

    const { id } = await params;
    const body = await request.json();
    const validated = attendanceUpdateSchema.parse(body);

    const existing = await prisma.attendance.findUnique({
      where: { id },
      include: {
        site: { select: { id: true, companyId: true } },
      },
    });

    if (!existing) {
      return errorResponse("Attendance record not found", 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    let nextShiftGroupId: string | null = existing.shiftGroupId;
    let resolvedShiftLeaderId: string | null = existing.shiftLeaderId;
    let resolvedShiftLeaderName: string | null = existing.shiftLeaderName;

    if (validated.shiftGroupId !== undefined) {
      nextShiftGroupId = validated.shiftGroupId;
    }

    if (nextShiftGroupId) {
      const shiftGroup = await prisma.shiftGroup.findUnique({
        where: { id: nextShiftGroupId },
        select: {
          id: true,
          companyId: true,
          siteId: true,
          leaderEmployeeId: true,
          leader: { select: { name: true } },
        },
      });

      if (!shiftGroup || shiftGroup.companyId !== session.user.companyId) {
        return errorResponse("Invalid shift group", 400);
      }

      if (shiftGroup.siteId !== existing.siteId) {
        return errorResponse("Shift group does not belong to this site", 400);
      }

      resolvedShiftLeaderId = shiftGroup.leaderEmployeeId;
      resolvedShiftLeaderName = shiftGroup.leader.name;
    } else if (validated.shiftGroupId === null && validated.shiftLeaderId === undefined) {
      resolvedShiftLeaderId = null;
      resolvedShiftLeaderName = null;
    }

    if (validated.shiftLeaderId !== undefined && !nextShiftGroupId) {
      if (validated.shiftLeaderId === null) {
        resolvedShiftLeaderId = null;
        resolvedShiftLeaderName = null;
      } else {
        const leader = await prisma.employee.findUnique({
          where: { id: validated.shiftLeaderId },
          select: { id: true, companyId: true, name: true },
        });

        if (!leader || leader.companyId !== session.user.companyId) {
          return errorResponse("Invalid shift leader", 400);
        }

        resolvedShiftLeaderId = leader.id;
        resolvedShiftLeaderName = leader.name;
      }
    }

    const updateData: Prisma.AttendanceUpdateInput = {};

    if (validated.date !== undefined) {
      updateData.date = new Date(validated.date);
    }
    if (validated.shift !== undefined) {
      updateData.shift = validated.shift;
    }
    if (validated.status !== undefined) {
      updateData.status = validated.status;
    }
    if (validated.overtime !== undefined) {
      updateData.overtime = validated.overtime;
    }
    if (validated.notes !== undefined) {
      updateData.notes = validated.notes;
    }
    if (validated.shiftGroupId !== undefined) {
      updateData.shiftGroup = nextShiftGroupId
        ? { connect: { id: nextShiftGroupId } }
        : { disconnect: true };
    }
    if (validated.shiftGroupId !== undefined || validated.shiftLeaderId !== undefined) {
      updateData.shiftLeaderId = resolvedShiftLeaderId;
      updateData.shiftLeaderName = resolvedShiftLeaderName;
    }

    const updated = await prisma.attendance.update({
      where: { id },
      data: updateData,
      include: {
        employee: { select: { id: true, name: true, employeeId: true } },
        site: { select: { id: true, name: true, code: true } },
        shiftGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            leader: { select: { id: true, name: true, employeeId: true } },
          },
        },
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return errorResponse("Attendance already exists for this employee/shift/date.", 409);
    }
    console.error("[API] PATCH /api/attendance/[id] error:", error);
    return errorResponse("Failed to update attendance record");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    if (!hasRole(session, ["SUPERADMIN"])) {
      return errorResponse("Only SUPERADMIN can delete attendance records.", 403);
    }

    const { id } = await params;

    const existing = await prisma.attendance.findUnique({
      where: { id },
      include: { site: { select: { companyId: true } } },
    });

    if (!existing) {
      return errorResponse("Attendance record not found", 404);
    }

    if (existing.site.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403);
    }

    await prisma.attendance.delete({
      where: { id },
    });

    return successResponse({ success: true, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/attendance/[id] error:", error);
    return errorResponse("Failed to delete attendance record");
  }
}
