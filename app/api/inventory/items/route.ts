import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const inventoryItemSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(['FUEL', 'SPARES', 'CONSUMABLES', 'PPE', 'REAGENTS', 'OTHER']),
  siteId: z.string().uuid(),
  locationId: z.string().uuid(),
  unit: z.string().min(1).max(20),
  currentStock: z.number().min(0).optional(),
  minStock: z.number().min(0).optional(),
  maxStock: z.number().min(0).optional(),
  unitCost: z.number().min(0).optional(),
}).refine(
  (data) =>
    data.minStock === undefined ||
    data.maxStock === undefined ||
    data.minStock <= data.maxStock,
  {
    message: 'minStock must be less than or equal to maxStock',
    path: ['minStock'],
  }
);

const CATEGORY_CODE_PREFIX: Record<string, string> = {
  FUEL: 'FUEL',
  SPARES: 'SPARE',
  CONSUMABLES: 'CONS',
  PPE: 'PPE',
  REAGENTS: 'REAG',
  OTHER: 'OTHER',
};

async function generateItemCode(siteId: string, category: string) {
  const prefix = CATEGORY_CODE_PREFIX[category] ?? 'ITEM';
  const latest = await prisma.inventoryItem.findFirst({
    where: {
      siteId,
      itemCode: { startsWith: `${prefix}-` },
    },
    orderBy: { createdAt: 'desc' },
    select: { itemCode: true },
  });

  let nextNumber = 1;
  if (latest?.itemCode) {
    const match = latest.itemCode.match(/-(\d+)$/);
    if (match) {
      const parsed = Number.parseInt(match[1], 10);
      if (Number.isFinite(parsed)) {
        nextNumber = parsed + 1;
      }
    }
  }

  return `${prefix}-${String(nextNumber).padStart(3, '0')}`;
}

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

    const where: Record<string, unknown> = {
      site: { companyId: session.user.companyId },
    };

    if (siteId) where.siteId = siteId;
    if (category) where.category = category;
    if (lowStock) {
      const items = await prisma.inventoryItem.findMany({
        where,
        include: {
          site: { select: { name: true, code: true } },
          location: { select: { name: true } },
        },
        orderBy: { name: 'asc' },
      });

      const filtered = items.filter(
        (item) => item.minStock !== null && item.currentStock <= (item.minStock ?? 0)
      );
      const paged = filtered.slice(skip, skip + limit);

      return successResponse(paginationResponse(paged, filtered.length, page, limit));
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

    if (!site.isActive) {
      return errorResponse('Site is not active', 400);
    }

    const location = await prisma.stockLocation.findUnique({
      where: { id: validated.locationId },
      select: { siteId: true, isActive: true },
    });

    if (!location || location.siteId !== validated.siteId || !location.isActive) {
      return errorResponse('Invalid stock location for site', 400);
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const itemCode = await generateItemCode(validated.siteId, validated.category);
      try {
        const item = await prisma.inventoryItem.create({
          data: {
            itemCode,
            name: validated.name,
            category: validated.category,
            siteId: validated.siteId,
            locationId: validated.locationId,
            unit: validated.unit,
            currentStock: validated.currentStock ?? 0,
            minStock: validated.minStock,
            maxStock: validated.maxStock,
            unitCost: validated.unitCost,
          },
          include: {
            site: { select: { name: true, code: true } },
            location: { select: { name: true } },
          },
        });

        return successResponse(item, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }
        throw error;
      }
    }

    return errorResponse('Unable to generate item code', 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/inventory/items error:', error);
    return errorResponse('Failed to create inventory item');
  }
}
