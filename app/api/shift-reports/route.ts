import { NextRequest, NextResponse } from 'next/server';
import { validateSession, errorResponse, successResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

// Validation schema
const shiftReportSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  shift: z.enum(['DAY', 'NIGHT']),
  siteId: z.string().uuid(),
  sectionId: z.string().uuid().optional(),
  supervisorName: z.string().min(1).max(200),
  crewCount: z.number().int().positive().max(1000),
  workType: z.enum(['DEVELOPMENT', 'PRODUCTION', 'HAULAGE', 'SUPPORT', 'OTHER']),
  outputValue: z.number().optional(),
  outputUnit: z.string().max(50).optional(),
  safetyIncident: z.boolean().optional(),
  safetyNotes: z.string().max(1000).optional(),
  handoverNotes: z.string().max(2000).optional(),
});

// GET - List shift reports with filters
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const status = searchParams.get('status');
    const { page, limit, skip } = getPaginationParams(request);

    const where: any = {
      site: {
        companyId: session.user.companyId,
      },
    };

    if (siteId) where.siteId = siteId;
    if (startDate) where.date = { ...where.date, gte: new Date(startDate) };
    if (endDate) where.date = { ...where.date, lte: new Date(endDate) };
    if (status) where.status = status;

    const [reports, total] = await Promise.all([
      prisma.shiftReport.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          section: { select: { name: true } },
          supervisor: { select: { name: true } },
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
      prisma.shiftReport.count({ where }),
    ]);

    return successResponse(paginationResponse(reports, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/shift-reports error:', error);
    return errorResponse('Failed to fetch shift reports');
  }
}

// POST - Create new shift report
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = shiftReportSchema.parse(body);

    // Verify site belongs to user's company
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

    // Check if report already exists for this site/date/shift
    const existing = await prisma.shiftReport.findFirst({
      where: {
        siteId: validated.siteId,
        date: new Date(validated.date),
        shift: validated.shift,
      },
    });

    if (existing) {
      return errorResponse('Shift report already exists for this date and shift', 409);
    }

    // Create the shift report
    const report = await prisma.shiftReport.create({
      data: {
        date: new Date(validated.date),
        shift: validated.shift,
        siteId: validated.siteId,
        sectionId: validated.sectionId,
        supervisorName: validated.supervisorName,
        crewCount: validated.crewCount,
        workType: validated.workType,
        outputValue: validated.outputValue,
        outputUnit: validated.outputUnit,
        safetyIncident: validated.safetyIncident || false,
        safetyNotes: validated.safetyNotes,
        handoverNotes: validated.handoverNotes,
        status: 'DRAFT',
        createdById: session.user.id,
      },
      include: {
        site: { select: { name: true, code: true } },
        section: { select: { name: true } },
      },
    });

    return successResponse(report, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/shift-reports error:', error);
    return errorResponse('Failed to create shift report');
  }
}
