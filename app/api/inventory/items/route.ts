import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const inventoryItemSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: z.enum(['FUEL', 'SPARES', 'CONSUMABLES', 'PPE', 'REAGENTS', 'OTHER']),
  siteId: z.string().uuid(),
  currentStock: z.number().min(0),
  minimumStock: z.number().min(0),
  unit: z.string().min(1).max(20),
  unitCost: z.number().min(0).optional(),
  locationId: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const siteId = searchParams.get('siteId');
    const category = searchParams.get('category');
    const lowStock = searchParams.get('lowStock') === 'true';
    const { page, limit, skip } = getPaginationParams(request);

    const where: any = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (category) where.category = category;
    if (lowStock) {
      where.OR = [
        { currentStock: { lte: prisma.inventoryItem.fields.minimumStock } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          location: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    return successResponse(paginationResponse(items, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/inventory/items error:', error);
    return errorResponse('Failed to fetch inventory items');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = inventoryItemSchema.parse(body);

    // Verify site
    const site = await prisma.site.findUnique({
      where: { id: validated.siteId },
      select: { companyId: true, isActive: true },
    });

    if (!site || site.companyId !== session.user.companyId) {
      return errorResponse('Invalid site', 403);
    }

    // Check for duplicate code
    const existing = await prisma.inventoryItem.findFirst({
      where: {
        code: validated.code,
        siteId: validated.siteId,
      },
    });

    if (existing) {
      return errorResponse('Item code already exists for this site', 409);
    }

    const item = await prisma.inventoryItem.create({
      data: validated,
      include: {
        site: { select: { name: true, code: true } },
        location: { select: { name: true } },
      },
    });

    return successResponse(item, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/inventory/items error:', error);
    return errorResponse('Failed to create inventory item');
  }
}
