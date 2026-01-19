import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const equipmentSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.enum(['CRUSHER', 'MILL', 'PUMP', 'GENERATOR', 'VEHICLE', 'OTHER']),
  siteId: z.string().uuid(),
  lastServiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  nextServiceDue: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  serviceHours: z.number().int().min(0).optional(),
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

    const [equipment, total] = await Promise.all([
      prisma.equipment.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.equipment.count({ where }),
    ]);

    return successResponse(paginationResponse(equipment, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/equipment error:', error);
    return errorResponse('Failed to fetch equipment');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = equipmentSchema.parse(body);

    // Verify site
    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    });

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    // Check for duplicate code
    const existing = await prisma.equipment.findFirst({
      where: {
        code: validated.code,
        siteId: validated.siteId,
      },
    });

    if (existing) {
      return errorResponse('Equipment code already exists for this site', 409);
    }

    const equipment = await prisma.equipment.create({
      data: {
        ...validated,
        lastServiceDate: validated.lastServiceDate ? new Date(validated.lastServiceDate) : undefined,
        nextServiceDue: validated.nextServiceDue ? new Date(validated.nextServiceDue) : undefined,
        status: 'OPERATIONAL',
      },
      include: {
        site: { select: { name: true, code: true } },
      },
    });

    return successResponse(equipment, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/equipment error:', error);
    return errorResponse('Failed to create equipment');
  }
}
