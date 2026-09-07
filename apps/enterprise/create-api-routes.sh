#!/bin/bash

# Gold Pours API
cat > app/api/gold/pours/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const goldPourSchema = z.object({
  siteId: z.string().uuid(),
  barId: z.string().min(1).max(100),
  grossWeight: z.number().positive(),
  witness1Id: z.string().uuid(),
  witness2Id: z.string().uuid(),
  storageLocation: z.string().min(1).max(200),
  estimatedPurity: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const status = searchParams.get('status');
    const { page, limit, skip } = getPaginationParams(request);

    const where: any = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (status) where.status = status;

    const [pours, total] = await Promise.all([
      prisma.goldPour.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          witness1: { select: { name: true } },
          witness2: { select: { name: true } },
        },
        orderBy: { pouredAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.goldPour.count({ where }),
    ]);

    return successResponse(paginationResponse(pours, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/gold/pours error:', error);
    return errorResponse('Failed to fetch gold pours');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = goldPourSchema.parse(body);

    // Validate witness rule (must be different)
    if (validated.witness1Id === validated.witness2Id) {
      return errorResponse('Witness 1 and Witness 2 must be different persons', 400);
    }

    // Verify site and witnesses belong to company
    const [site, witness1, witness2] = await Promise.all([
      prisma.site.findUnique({
        where: { id: validated.siteId },
        select: { companyId: true, isActive: true },
      }),
      prisma.user.findUnique({
        where: { id: validated.witness1Id },
        select: { companyId: true, isActive: true },
      }),
      prisma.user.findUnique({
        where: { id: validated.witness2Id },
        select: { companyId: true, isActive: true },
      }),
    ]);

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    if (!witness1 || witness1.companyId !== session.user.companyId || !witness1.isActive) {
      return errorResponse('Invalid witness 1', 400);
    }

    if (!witness2 || witness2.companyId !== session.user.companyId || !witness2.isActive) {
      return errorResponse('Invalid witness 2', 400);
    }

    // Create gold pour
    const pour = await prisma.goldPour.create({
      data: {
        siteId: validated.siteId,
        barId: validated.barId,
        grossWeight: validated.grossWeight,
        witness1Id: validated.witness1Id,
        witness2Id: validated.witness2Id,
        storageLocation: validated.storageLocation,
        estimatedPurity: validated.estimatedPurity,
        notes: validated.notes,
        status: 'IN_STORAGE',
        createdById: session.user.id,
        pouredAt: new Date(),
      },
      include: {
        site: { select: { name: true, code: true } },
        witness1: { select: { name: true } },
        witness2: { select: { name: true } },
      },
    });

    return successResponse(pour, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error('[API] POST /api/gold/pours error:', error);
    return errorResponse('Failed to create gold pour');
  }
}
EOF

# Attendance API
cat > app/api/attendance/route.ts << 'EOF'
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
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error('[API] POST /api/attendance error:', error);
    return errorResponse('Failed to record attendance');
  }
}
EOF

# Plant Reports API
cat > app/api/plant-reports/route.ts << 'EOF'
import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const plantReportSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  siteId: z.string().uuid(),
  shift: z.enum(['DAY', 'NIGHT']),
  tonnesFed: z.number().min(0).optional(),
  tonnesProcessed: z.number().min(0).optional(),
  runHours: z.number().min(0).max(24).optional(),
  dieselUsed: z.number().min(0).optional(),
  grindingMedia: z.number().min(0).optional(),
  reagents: z.number().min(0).optional(),
  waterUsed: z.number().min(0).optional(),
  goldRecovered: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  downtimeEvents: z.array(z.object({
    codeId: z.string().uuid(),
    durationHours: z.number().min(0).max(24),
    notes: z.string().max(500).optional(),
  })).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const { page, limit, skip } = getPaginationParams(request);

    const where: any = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (startDate) where.date = { ...where.date, gte: new Date(startDate) };
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) };

    const [reports, total] = await Promise.all([
      prisma.plantReport.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          reportedBy: { select: { name: true } },
          downtimeEvents: {
            include: {
              code: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      prisma.plantReport.count({ where }),
    ]);

    return successResponse(paginationResponse(reports, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/plant-reports error:', error);
    return errorResponse('Failed to fetch plant reports');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = plantReportSchema.parse(body);

    // Verify site
    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    });

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    // Create plant report with downtime events
    const report = await prisma.plantReport.create({
      data: {
        date: new Date(validated.date),
        siteId: validated.siteId,
        shift: validated.shift,
        tonnesFed: validated.tonnesFed,
        tonnesProcessed: validated.tonnesProcessed,
        runHours: validated.runHours,
        dieselUsed: validated.dieselUsed,
        grindingMedia: validated.grindingMedia,
        reagents: validated.reagents,
        waterUsed: validated.waterUsed,
        goldRecovered: validated.goldRecovered,
        notes: validated.notes,
        reportedById: session.user.id,
        downtimeEvents: validated.downtimeEvents ? {
          create: validated.downtimeEvents.map((event) => ({
            codeId: event.codeId,
            durationHours: event.durationHours,
            notes: event.notes,
            reportedById: session.user.id,
          })),
        } : undefined,
      },
      include: {
        site: { select: { name: true, code: true } },
        downtimeEvents: {
          include: {
            code: { select: { name: true, code: true } },
          },
        },
      },
    });

    return successResponse(report, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.errors);
    }
    console.error('[API] POST /api/plant-reports error:', error);
    return errorResponse('Failed to create plant report');
  }
}
EOF

echo "API routes created successfully"
