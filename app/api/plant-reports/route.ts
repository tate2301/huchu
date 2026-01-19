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
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/plant-reports error:', error);
    return errorResponse('Failed to create plant report');
  }
}
