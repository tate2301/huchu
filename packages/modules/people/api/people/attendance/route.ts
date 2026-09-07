import { NextRequest, NextResponse } from 'next/server';
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from '@corelithzw/platform/api-utils';
import { hrPermissionDenial } from "../../../hr/permissions";
import {
  ATTENDANCE_STATUSES,
  canSessionMarkAttendance,
  parseAttendanceStatus,
} from "../../../people/attendance";
import { prisma } from '@corelithzw/db/client';
import { z } from 'zod';

function normalizeShiftLabel(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

const shiftLabelSchema = z
  .string()
  .trim()
  .min(1, "Shift is required")
  .max(50, "Shift must be 50 characters or less")
  .transform(normalizeShiftLabel);

const attendanceSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  // Optional, and usually not sent at all. A crew already knows where it works,
  // so the site is taken from the shift group below; a tenant with no sites has
  // nothing to send and no longer has to invent one.
  siteId: z.string().uuid().optional(),
  shift: shiftLabelSchema,
  shiftGroupId: z.string().uuid().optional(),
  shiftLeaderId: z.string().uuid().optional(),
  records: z.array(z.object({
    employeeId: z.string().uuid(),
    status: z.enum(ATTENDANCE_STATUSES),
    overtime: z.number().min(0).max(24).optional(),
    notes: z.string().max(500).optional(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // A register says who was at work, which is workforce data. A signed-in
    // teacher, parent or cashier on a tenant that also runs a yard has no
    // business reading it.
    const viewDenial = hrPermissionDenial(session, "hr.attendance", "view");
    if (viewDenial) return errorResponse(viewDenial, 403);

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const shift = searchParams.get('shift');
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const shiftGroupId = searchParams.get("shiftGroupId");
    const shiftLeaderId = searchParams.get("shiftLeaderId");
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get("search")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    // On the row, not through the site. A register with no site is normal now, and
    // `site: { companyId }` would have hidden every one of them — and, worse, left
    // them outside the only thing scoping this table to a tenant.
    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    };

    if (siteId) where.siteId = siteId;
    if (employeeId) where.employeeId = employeeId;
    if (shiftGroupId) where.shiftGroupId = shiftGroupId;
    if (shiftLeaderId) where.shiftLeaderId = shiftLeaderId;
    if (shift?.trim()) where.shift = normalizeShiftLabel(shift);
    // Parsed, not passed through. `where` is a loose `Record<string, unknown>`,
    // so a raw `?status=bogus` typechecks and — now that the column is an enum —
    // makes Postgres raise rather than return nothing. An unknown status means no
    // such status, which means no rows.
    const parsedStatus = parseAttendanceStatus(status);
    if (parsedStatus) where.status = parsedStatus;

    if (date) {
      const dayStart = new Date(date);
      const dayEnd = new Date(date);
      dayEnd.setDate(dayEnd.getDate() + 1);
      where.date = { gte: dayStart, lt: dayEnd };
    } else {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);
      if (Object.keys(dateFilter).length > 0) {
        where.date = dateFilter;
      }
    }

    if (search) {
      const normalizedSearch = search.toUpperCase();
      const searchedStatus = parseAttendanceStatus(normalizedSearch);
      where.OR = [
        { notes: { contains: search, mode: "insensitive" } },
        { shift: { contains: search, mode: "insensitive" } },
        { shiftLeaderName: { contains: search, mode: "insensitive" } },
        { employee: { name: { contains: search, mode: "insensitive" } } },
        { employee: { employeeId: { contains: search, mode: "insensitive" } } },
        { site: { name: { contains: search, mode: "insensitive" } } },
        { site: { code: { contains: search, mode: "insensitive" } } },
        { shiftGroup: { name: { contains: search, mode: "insensitive" } } },
        ...(searchedStatus ? [{ status: searchedStatus }] : []),
      ];
    }

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
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
        orderBy: [{ date: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/people/attendance error:', error);
    return errorResponse('Failed to fetch attendance records');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Two checks, two questions. The feature says the tenant bought a register;
    // the role says this person may write to one. Only the first existed before
    // the move, so on a tenant with attendance switched on any signed-in user
    // could create a record — and `Attendance.overtime` is read straight into a
    // payroll run.
    if (!canSessionMarkAttendance(session)) {
      return errorResponse("Insufficient permissions to create attendance records.", 403);
    }
    const denial = hrPermissionDenial(session, "hr.attendance", "create");
    if (denial) return errorResponse(denial, 403);

    const body = await request.json();
    const validated = attendanceSchema.parse(body);

    // Verify the site only if one was named. Still validated the same way when it
    // is, so a mine cannot mark a register against somebody else's shaft.
    if (validated.siteId) {
      const site = await prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      });

      if (!site || site.companyId !== session.user.companyId) {
        return errorResponse('Invalid site', 403);
      }

      if (!site.isActive) {
        return errorResponse('Site is not active', 400);
      }
    }

    // Where the shift happened, computed rather than asked for. Explicit wins if
    // sent; otherwise the crew's own site; otherwise none, which is a whole
    // company's register and the normal case off a mine.
    let resolvedSiteId: string | null = validated.siteId ?? null;
    let resolvedShiftLeaderId: string | undefined = validated.shiftLeaderId;
    let resolvedShiftLeaderName: string | undefined;

    if (validated.shiftGroupId) {
      const shiftGroup = await prisma.shiftGroup.findUnique({
        where: { id: validated.shiftGroupId },
        select: {
          id: true,
          companyId: true,
          siteId: true,
          isActive: true,
          leaderEmployeeId: true,
          leader: { select: { name: true } },
        },
      });

      if (!shiftGroup || shiftGroup.companyId !== session.user.companyId) {
        return errorResponse("Invalid shift group", 403);
      }
      if (!shiftGroup.isActive) {
        return errorResponse("Shift group is not active", 400);
      }
      // Only a contradiction is an error. A group with no site is not a mismatch
      // with a request that named none — it is the ordinary case.
      if (validated.siteId && shiftGroup.siteId && shiftGroup.siteId !== validated.siteId) {
        return errorResponse("Shift group does not belong to the selected site", 400);
      }
      resolvedSiteId = validated.siteId ?? shiftGroup.siteId ?? null;

      resolvedShiftLeaderId = shiftGroup.leaderEmployeeId;
      resolvedShiftLeaderName = shiftGroup.leader.name;
    } else if (resolvedShiftLeaderId) {
      const leader = await prisma.employee.findUnique({
        where: { id: resolvedShiftLeaderId },
        select: { id: true, companyId: true, isActive: true, name: true },
      });
      if (!leader || leader.companyId !== session.user.companyId || !leader.isActive) {
        return errorResponse("Invalid shift leader", 400);
      }
      resolvedShiftLeaderName = leader.name;
    }

    const employeeIds = validated.records.map((record) => record.employeeId);
    const uniqueEmployeeIds = new Set(employeeIds);
    if (uniqueEmployeeIds.size !== employeeIds.length) {
      return errorResponse('Duplicate employee entries in attendance records', 400);
    }

    const attendanceDate = new Date(validated.date);

    // Matches the unique key, which is `[date, shift, employeeId]` and no longer
    // includes the site. Keeping the site in this check would have let the same
    // person be marked twice for one shift at two shafts and then failed at the
    // insert with a constraint error instead of this 409.
    const existingAttendance = await prisma.attendance.findMany({
      where: {
        date: attendanceDate,
        shift: validated.shift,
        employeeId: { in: employeeIds },
      },
      select: { employeeId: true },
    });

    if (existingAttendance.length > 0) {
      return errorResponse('Attendance already recorded for one or more employees', 409, {
        employeeIds: existingAttendance.map((record) => record.employeeId),
      });
    }

    const employees = await prisma.employee.findMany({
      where: { id: { in: employeeIds }, companyId: session.user.companyId, isActive: true },
      select: { id: true },
    });

    if (employees.length !== employeeIds.length) {
      return errorResponse('One or more employees are invalid or inactive', 400);
    }

    const attendanceRecords = validated.records.map((record) => ({
      companyId: session.user.companyId,
      date: attendanceDate,
      siteId: resolvedSiteId,
      shift: validated.shift,
      shiftGroupId: validated.shiftGroupId,
      shiftLeaderId: resolvedShiftLeaderId,
      shiftLeaderName: resolvedShiftLeaderName,
      employeeId: record.employeeId,
      status: record.status,
      overtime: record.overtime || 0,
      notes: record.notes,
    }));

    const result = await prisma.attendance.createMany({
      data: attendanceRecords,
    });

    return successResponse({
      success: true,
      count: result.count,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/people/attendance error:', error);
    return errorResponse('Failed to record attendance');
  }
}
