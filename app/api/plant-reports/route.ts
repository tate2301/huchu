import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const plantReportSchema = z.object({
  date: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  siteId: z.string().uuid(),
  tonnesFed: z.number().min(0).optional(),
  tonnesProcessed: z.number().min(0).optional(),
  runHours: z.number().min(0).max(24).optional(),
  dieselUsed: z.number().min(0).optional(),
  grindingMedia: z.number().min(0).optional(),
  reagentsUsed: z.number().min(0).optional(),
  waterUsed: z.number().min(0).optional(),
  goldRecovered: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  downtimeEvents: z.array(z.object({
    downtimeCodeId: z.string().uuid(),
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
    const search = searchParams.get("search")?.trim();
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (startDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, gte: new Date(startDate) };
    }
    if (endDate) {
      const dateWhere = (where.date as Record<string, Date> | undefined) ?? {};
      where.date = { ...dateWhere, lte: new Date(endDate) };
    }
    if (search) {
      const normalizedSearch = search.toUpperCase();
      const statusMatches = ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"].includes(normalizedSearch);
      where.OR = [
        { notes: { contains: search, mode: "insensitive" } },
        { site: { name: { contains: search, mode: "insensitive" } } },
        { site: { code: { contains: search, mode: "insensitive" } } },
        { reportedBy: { name: { contains: search, mode: "insensitive" } } },
        ...(statusMatches ? [{ status: normalizedSearch }] : []),
      ];
    }

    const [reports, total] = await Promise.all([
      prisma.plantReport.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          reportedBy: { select: { name: true } },
          downtimeEvents: {
            include: {
              downtimeCode: { select: { description: true, code: true } },
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

    if (!site.isActive) {
      return errorResponse('Site is not active', 400);
    }

    if (validated.downtimeEvents && validated.downtimeEvents.length > 0) {
      const downtimeCodeIds = Array.from(
        new Set(validated.downtimeEvents.map((event) => event.downtimeCodeId))
      );

      const downtimeCodes = await prisma.downtimeCode.findMany({
        where: {
          id: { in: downtimeCodeIds },
          OR: [{ siteId: validated.siteId }, { siteId: null }],
        },
        select: { id: true },
      });

      if (downtimeCodes.length !== downtimeCodeIds.length) {
        return errorResponse('Invalid downtime code for site', 400);
      }
    }

    // Create plant report with downtime events
    const report = await prisma.plantReport.create({
      data: {
        date: new Date(validated.date),
        siteId: validated.siteId,
        tonnesFed: validated.tonnesFed,
        tonnesProcessed: validated.tonnesProcessed,
        runHours: validated.runHours,
        dieselUsed: validated.dieselUsed,
        grindingMedia: validated.grindingMedia,
        reagentsUsed: validated.reagentsUsed,
        waterUsed: validated.waterUsed,
        goldRecovered: validated.goldRecovered,
        notes: validated.notes,
        reportedById: session.user.id,
        downtimeEvents: validated.downtimeEvents ? {
          create: validated.downtimeEvents.map((event) => ({
            downtimeCodeId: event.downtimeCodeId,
            durationHours: event.durationHours,
            notes: event.notes,
          })),
        } : undefined,
      },
      include: {
        site: { select: { name: true, code: true } },
        downtimeEvents: {
          include: {
            downtimeCode: { select: { description: true, code: true } },
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
