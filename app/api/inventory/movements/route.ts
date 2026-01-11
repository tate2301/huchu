import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse } from '@/lib/api-utils';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const stockMovementSchema = z.object({
  itemId: z.string().uuid(),
  type: z.enum(['ISSUE', 'RECEIVE', 'ADJUSTMENT']),
  quantity: z.number().int(),
  issuedTo: z.string().max(200).optional(),
  supplier: z.string().max(200).optional(),
  invoiceNumber: z.string().max(100).optional(),
  unitCost: z.number().min(0).optional(),
  requestedBy: z.string().max(100).optional(),
  approvedBy: z.string().max(100).optional(),
  notes: z.string().max(500).optional(),
});

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

    // Validate stock availability for issue
    if (validated.type === 'ISSUE' && item.currentStock < Math.abs(validated.quantity)) {
      return errorResponse('Insufficient stock', 400);
    }

    // Calculate new stock based on movement type
    let newStock = item.currentStock;
    if (validated.type === 'RECEIVE') {
      newStock += Math.abs(validated.quantity);
    } else if (validated.type === 'ISSUE') {
      newStock -= Math.abs(validated.quantity);
    } else if (validated.type === 'ADJUSTMENT') {
      newStock += validated.quantity; // Can be positive or negative
    }

    if (newStock < 0) {
      return errorResponse('Stock cannot be negative', 400);
    }

    // Create movement and update item in transaction
    const [movement, updatedItem] = await prisma.$transaction([
      prisma.stockMovement.create({
        data: {
          itemId: validated.itemId,
          type: validated.type,
          quantity: Math.abs(validated.quantity),
          openingBalance: item.currentStock,
          closingBalance: newStock,
          issuedTo: validated.issuedTo,
          supplier: validated.supplier,
          invoiceNumber: validated.invoiceNumber,
          unitCost: validated.unitCost,
          requestedBy: validated.requestedBy,
          approvedBy: validated.approvedBy,
          notes: validated.notes,
          recordedById: session.user.id,
        },
      }),
      prisma.inventoryItem.update({
        where: { id: validated.itemId },
        data: { currentStock: newStock },
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
