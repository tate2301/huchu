import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!siteId || !startDate || !endDate) {
      return errorResponse('siteId, startDate, and endDate are required', 400);
    }

    // Verify site access
    const site = await prisma.site.findUnique({
      where: { id: siteId },
      select: { companyId: true },
    });

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    // Get downtime events with aggregation
    const downtimeEvents = await prisma.downtimeEvent.findMany({
      where: {
        plantReport: {
          siteId,
          date: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
      },
      include: {
        code: { select: { name: true, code: true } },
      },
    });

    // Aggregate by cause
    const aggregated: Record<string, { name: string; code: string; hours: number; count: number }> = {};
    
    downtimeEvents.forEach((event: { code: { name: string; code: string }; durationHours: number }) => {
      const key = event.code.code;
      if (!aggregated[key]) {
        aggregated[key] = {
          name: event.code.name,
          code: event.code.code,
          hours: 0,
          count: 0,
        };
      }
      aggregated[key].hours += event.durationHours;
      aggregated[key].count += 1;
    });

    // Convert to array and sort by hours
    const causes = Object.values(aggregated).sort((a, b) => b.hours - a.hours);

    const totalHours = causes.reduce((sum, cause) => sum + cause.hours, 0);

    return successResponse({
      siteId,
      startDate,
      endDate,
      totalDowntimeHours: totalHours,
      totalIncidents: downtimeEvents.length,
      topCause: causes[0] || null,
      causes,
    });
  } catch (error) {
    console.error('[API] GET /api/analytics/downtime error:', error);
    return errorResponse('Failed to fetch downtime analytics');
  }
}
