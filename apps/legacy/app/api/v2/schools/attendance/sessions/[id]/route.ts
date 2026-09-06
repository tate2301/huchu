import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { isPrivilegedRole } from "@/lib/schools/governance-v2";

type RouteParams = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  /** Move a register that was filed against the wrong day. */
  attendanceDate: z.string().date().optional(),
  notes: z.string().trim().max(500).nullish(),
});

/**
 * One register, read, corrected or taken back.
 *
 * The sessions list creates and the two sibling routes submit and lock; nothing
 * could correct a register filed against the wrong day, or take back one that
 * should never have existed, so the office kept the correction on paper and the
 * board went on showing a day that never happened.
 *
 * Both writes stop at a locked session. A locked day is the school's record of
 * who was there — it is what an inspector is shown and what a fee waiver is
 * argued from — so moving or deleting one is not a correction, it is a
 * rewriting, and it is refused with the reason rather than silently allowed.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "view");
    if (denied) return errorResponse(denied, 403);

    const { id } = await params;
    const record = await prisma.schoolAttendanceSession.findFirst({
      where: { id, companyId: session.user.companyId },
    });
    if (!record) return errorResponse("Attendance session not found", 404);

    // `SchoolAttendanceSession` carries the class, stream and term as bare ids
    // with no Prisma relation on them, so the names have to be fetched rather
    // than included. Three small reads against indexed primary keys, which is
    // what the list route at `../route.ts` already does for the same reason.
    const [schoolClass, stream, term] = await Promise.all([
      prisma.schoolClass.findFirst({
        where: { id: record.classId, companyId: session.user.companyId },
        select: { id: true, code: true, name: true },
      }),
      record.streamId
        ? prisma.schoolStream.findFirst({
            where: { id: record.streamId },
            select: { id: true, code: true, name: true },
          })
        : Promise.resolve(null),
      prisma.schoolTerm.findFirst({
        where: { id: record.termId, companyId: session.user.companyId },
        select: { id: true, code: true, name: true },
      }),
    ]);

    return successResponse({ ...record, class: schoolClass, stream, term });
  } catch (error) {
    console.error("[API] GET /api/v2/schools/attendance/sessions/[id] error:", error);
    return errorResponse("Failed to fetch the attendance session");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const validated = patchSchema.parse(await request.json());

    const existing = await prisma.schoolAttendanceSession.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        status: true,
        termId: true,
        classId: true,
        streamId: true,
        attendanceDate: true,
      },
    });
    if (!existing) return errorResponse("Attendance session not found", 404);
    if (existing.status === "LOCKED") {
      return errorResponse(
        "This register has been locked. A locked day is the school's record and cannot be moved.",
        409,
      );
    }

    if (validated.attendanceDate) {
      const attendanceDate = new Date(validated.attendanceDate);
      // The same class cannot hold two registers for one day, so a move onto an
      // occupied day is refused rather than allowed to collide at the database.
      const clash = await prisma.schoolAttendanceSession.findFirst({
        where: {
          companyId,
          termId: existing.termId,
          classId: existing.classId,
          streamId: existing.streamId,
          attendanceDate,
          id: { not: id },
        },
        select: { id: true },
      });
      if (clash) {
        return errorResponse(
          "That class already has a register on that day. Take one of them back first.",
          409,
        );
      }
    }

    const updated = await prisma.schoolAttendanceSession.update({
      where: { id },
      data: {
        ...(validated.attendanceDate
          ? { attendanceDate: new Date(validated.attendanceDate) }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes ?? null } : {}),
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/attendance/sessions/[id] error:", error);
    return errorResponse("Failed to update the attendance session");
  }
}

/**
 * Take a register back.
 *
 * The marks go with it — `SchoolAttendanceSessionLine` cascades — because a
 * register with no session is not a record of anything. Only a school
 * administrator may do it, for the same reason locking is restricted: this
 * removes a day from the school's own account of who was present.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.attendance", "archive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    if (!isPrivilegedRole(session.user.role)) {
      return errorResponse(
        "Taking a register back is a school administrator's to do.",
        403,
      );
    }

    const existing = await prisma.schoolAttendanceSession.findFirst({
      where: { id, companyId },
      select: { id: true, status: true },
    });
    if (!existing) return errorResponse("Attendance session not found", 404);
    if (existing.status === "LOCKED") {
      return errorResponse(
        "This register has been locked and is the school's record for the day.",
        409,
      );
    }

    await prisma.$transaction([
      prisma.schoolAttendanceSessionLine.deleteMany({
        where: { companyId, sessionId: id },
      }),
      prisma.schoolAttendanceSession.delete({ where: { id } }),
    ]);

    return successResponse({ id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/attendance/sessions/[id] error:", error);
    return errorResponse("Failed to take the register back");
  }
}
