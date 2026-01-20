import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const attendanceSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  siteId: z.string().uuid(),
  shift: z.enum(['DAY', 'NIGHT']),
  records: z.array(z.object({
    userId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    overtime: z.number().min(0).max(24).optional(),
    notes: z.string().max(500).optional(),
  })).min(1),
});

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

    const userIds = validated.records.map((record) => record.userId);
    const uniqueUserIds = new Set(userIds);
    if (uniqueUserIds.size !== userIds.length) {
      return errorResponse('Duplicate user entries in attendance records', 400);
    }

    const attendanceDate = new Date(validated.date);

    const existingAttendance = await prisma.attendance.findMany({
      where: {
        date: attendanceDate,
        siteId: validated.siteId,
        shift: validated.shift,
        userId: { in: userIds },
      },
      select: { userId: true },
    });

    if (existingAttendance.length > 0) {
      return errorResponse('Attendance already recorded for one or more users', 409, {
        userIds: existingAttendance.map((record) => record.userId),
      });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: userIds }, companyId: session.user.companyId, isActive: true },
      select: { id: true },
    });

    if (users.length !== userIds.length) {
      return errorResponse('One or more users are invalid or inactive', 400);
    }

    const attendanceRecords = validated.records.map((record) => ({
      date: attendanceDate,
      siteId: validated.siteId,
      shift: validated.shift,
      userId: record.userId,
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
