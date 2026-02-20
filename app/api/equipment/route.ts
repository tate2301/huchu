import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';
import { normalizeProvidedId, reserveIdentifier } from '@/lib/id-generator';

const equipmentSchema = z.object({
  equipmentCode: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200),
  category: z.enum(['CRUSHER', 'MILL', 'PUMP', 'GENERATOR', 'VEHICLE', 'OTHER']),
  siteId: z.string().uuid(),
  locationId: z.string().uuid(),
  numberOfItems: z.number().int().min(1).optional().default(1),
  lastServiceDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  nextServiceDue: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  serviceHours: z.number().int().min(0).optional(),
  serviceDays: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    const [equipment, total] = await Promise.all([
      prisma.equipment.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          location: { select: { id: true, code: true, name: true } },
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
    const equipmentCode = validated.equipmentCode
      ? normalizeProvidedId(validated.equipmentCode, "EQUIPMENT")
      : await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "EQUIPMENT",
          siteId: validated.siteId,
        });

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

    const location = await prisma.stockLocation.findUnique({
      where: { id: validated.locationId },
      select: { siteId: true, isActive: true },
    });

    if (!location || location.siteId !== validated.siteId || !location.isActive) {
      return errorResponse("Invalid stock location for site", 400);
    }

    // Check for duplicate code
    const existing = await prisma.equipment.findFirst({
      where: {
        equipmentCode,
        siteId: validated.siteId,
      },
    });

    if (existing) {
      return errorResponse('Equipment code already exists for this site', 409);
    }

    const equipment = await prisma.equipment.create({
      data: {
        equipmentCode,
        name: validated.name,
        category: validated.category,
        siteId: validated.siteId,
        locationId: validated.locationId,
        numberOfItems: validated.numberOfItems,
        serviceHours: validated.serviceHours,
        serviceDays: validated.serviceDays,
        isActive: validated.isActive ?? true,
        lastServiceDate: validated.lastServiceDate ? new Date(validated.lastServiceDate) : undefined,
        nextServiceDue: validated.nextServiceDue ? new Date(validated.nextServiceDue) : undefined,
      },
      include: {
        site: { select: { name: true, code: true } },
        location: { select: { id: true, code: true, name: true } },
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
