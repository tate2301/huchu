import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const stockMovementSchema = z.object({
  itemId: z.string().uuid(),
  movementType: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER']),
  quantity: z.number(),
  unit: z.string().min(1).max(20),
  issuedTo: z.string().max(200).optional(),
  requestedBy: z.string().max(100).optional(),
  approvedBy: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
  photoUrl: z.string().max(2048).optional(),
  unitCost: z.number().min(0).optional(),
  movementDate: z
    .string()
    .optional()
    .refine((value) => !value || !Number.isNaN(new Date(value).getTime()), {
      message: 'Invalid movementDate',
    }),
}).refine(
  (data) => data.movementType === 'ADJUSTMENT' || data.quantity > 0,
  { message: 'Quantity must be positive for this movement type', path: ['quantity'] }
);

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('itemId');
    const siteId = searchParams.get('siteId');
    const movementType = searchParams.get('movementType');
    const category = searchParams.get('category');
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = {
      item: {
        site: {
          companyId: session.user.companyId,
        },
      },
    };

    if (itemId) where.itemId = itemId;
    if (siteId) where.item = { ...(where.item as Record<string, unknown>), siteId };
    if (movementType) where.movementType = movementType;
    if (category) where.item = { ...(where.item as Record<string, unknown>), category };

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: {
            select: {
              name: true,
              itemCode: true,
              unit: true,
              site: { select: { name: true, code: true } },
              location: { select: { name: true } },
            },
          },
          issuedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return successResponse(paginationResponse(movements, total, page, limit));
  } catch (error) {
    console.error('[API] GET /api/inventory/movements error:', error);
    return errorResponse('Failed to fetch stock movements');
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const body = await request.json();
    const validated = stockMovementSchema.parse(body);

    // Get item and verify access
    const item = await prisma.inventoryItem.findUnique({
      where: { id: validated.itemId },
      include: { site: { select: { companyId: true } } },
    });

    if (!item || item.site.companyId !== session.user.companyId) {
      return errorResponse('Invalid item', 403);
    }

    if (validated.unit !== item.unit) {
      return errorResponse('Unit does not match inventory item unit', 400);
    }

    // Validate stock availability for issue
    if (validated.movementType === 'ISSUE' && item.currentStock < Math.abs(validated.quantity)) {
      return errorResponse('Insufficient stock', 400);
    }

    // Calculate new stock based on movement type
    let newStock = item.currentStock;
    const quantity = validated.movementType === 'ADJUSTMENT'
      ? validated.quantity
      : Math.abs(validated.quantity);

    if (validated.movementType === 'RECEIPT') {
      newStock += quantity;
    } else if (validated.movementType === 'ISSUE') {
      newStock -= quantity;
    } else if (validated.movementType === 'TRANSFER') {
      newStock -= quantity;
    } else if (validated.movementType === 'ADJUSTMENT') {
      newStock += quantity;
    }

    if (newStock < 0) {
      return errorResponse('Stock cannot be negative', 400);
    }

    // Create movement and update item in transaction
    const movementDate = validated.movementDate
      ? new Date(validated.movementDate)
      : undefined;
    const itemUpdateData: Record<string, unknown> = { currentStock: newStock };
    if (validated.movementType === 'RECEIPT' && validated.unitCost !== undefined) {
      itemUpdateData.unitCost = validated.unitCost;
    }

    const [movement] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          itemId: validated.itemId,
          movementType: validated.movementType,
          quantity: validated.movementType === 'ADJUSTMENT' ? validated.quantity : Math.abs(validated.quantity),
          unit: validated.unit,
          issuedTo: validated.issuedTo,
          requestedBy: validated.requestedBy,
          approvedBy: validated.approvedBy,
          notes: validated.notes,
          photoUrl: validated.photoUrl,
          issuedById: session.user.id,
          createdAt: movementDate,
        },
      }),
      prisma.inventoryItem.update({
        where: { id: validated.itemId },
        data: itemUpdateData,
      }),
    ]);

    return successResponse({ movement, updatedStock: newStock }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/inventory/movements error:', error);
    return errorResponse('Failed to record stock movement');
  }
}
