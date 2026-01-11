import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const attendanceSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  siteId: z.string().uuid(),
  shift: z.enum(['DAY', 'NIGHT']),
  records: z.array(z.object({
    employeeId: z.string().uuid(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
    overtimeHours: z.number().min(0).max(24).optional(),
  })),
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

    // Create attendance records
    const attendanceRecords = await Promise.all(
      validated.records.map((record) =>
        prisma.attendance.create({
          data: {
            date: new Date(validated.date),
            siteId: validated.siteId,
            shift: validated.shift,
            employeeId: record.employeeId,
            status: record.status,
            overtimeHours: record.overtimeHours || 0,
            recordedById: session.user.id,
          },
        })
      )
    );

    return successResponse({ 
      success: true, 
      count: attendanceRecords.length,
      records: attendanceRecords 
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/attendance error:', error);
    return errorResponse('Failed to record attendance');
  }
}
