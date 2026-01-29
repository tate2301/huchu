import { NextRequest, NextResponse } from 'next/server';
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const attendanceSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  siteId: z.string().uuid(),
  shift: z.enum(['DAY', 'NIGHT']),
  records: z.array(z.object({
    employeeId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    overtime: z.number().min(0).max(24).optional(),
    notes: z.string().max(500).optional(),
  })).min(1),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const shift = searchParams.get('shift');
    const status = searchParams.get('status');
    const employeeId = searchParams.get('employeeId');
    const date = searchParams.get('date');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (employeeId) where.employeeId = employeeId;
    if (shift === 'DAY' || shift === 'NIGHT') where.shift = shift;
    if (status) where.status = status;

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

    const [records, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          employee: { select: { id: true, name: true, employeeId: true } },
          site: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ date: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.attendance.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/attendance error:', error);
    return errorResponse('Failed to fetch attendance records');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = attendanceSchema.parse(body);

    // Verify site
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

    const employeeIds = validated.records.map((record) => record.employeeId);
    const uniqueEmployeeIds = new Set(employeeIds);
    if (uniqueEmployeeIds.size !== employeeIds.length) {
      return errorResponse('Duplicate employee entries in attendance records', 400);
    }

    const attendanceDate = new Date(validated.date);

    const existingAttendance = await prisma.attendance.findMany({
      where: {
        date: attendanceDate,
        siteId: validated.siteId,
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
      date: attendanceDate,
      siteId: validated.siteId,
      shift: validated.shift,
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
    console.error('[API] POST /api/attendance error:', error);
    return errorResponse('Failed to record attendance');
  }
}
