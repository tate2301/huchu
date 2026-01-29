import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const siteSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20),
  location: z.string().max(200).optional(),
  measurementUnit: z.enum(['tonnes', 'trips', 'wheelbarrows']).optional(),
});

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

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = siteSchema.parse(body);

    const name = validated.name.trim();
    const code = validated.code.trim().toUpperCase();
    const location = validated.location?.trim() || null;
    const measurementUnit = validated.measurementUnit ?? 'tonnes';

    if (!name || !code) {
      return errorResponse('Site name and code are required', 400);
    }

    const existing = await prisma.site.findUnique({
      where: { code },
      select: { id: true },
    });

    if (existing) {
      return errorResponse('Site code already exists', 409);
    }

    const site = await prisma.site.create({
      data: {
        name,
        code,
        location,
        measurementUnit,
        isActive: true,
        companyId: session.user.companyId,
      },
      select: {
        id: true,
        name: true,
        code: true,
        location: true,
        measurementUnit: true,
        isActive: true,
      },
    });

    return successResponse(site, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/sites error:', error);
    return errorResponse('Failed to create site');
  }
}
