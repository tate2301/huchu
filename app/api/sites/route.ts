import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';

// GET - List all sites for user's company
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const sites = await prisma.site.findMany({
      where: {
        companyId: session.user.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
      },
      orderBy: { name: 'asc' },
    });

    return successResponse({ sites });
  } catch (error) {
    console.error('[API] GET /api/sites error:', error);
    return errorResponse('Failed to fetch sites');
  }
}
