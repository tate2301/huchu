import { NextRequest, NextResponse } from 'next/server';
import { validateSession, successResponse, errorResponse, getPaginationParams, paginationResponse } from '@corelithzw/platform/api-utils';
import { prisma } from '@corelithzw/db/client';
import { createJournalEntryFromSource } from '@corelithzw/module-books/posting';
import { Prisma } from '@corelithzw/db';
import { z } from 'zod';
import { normalizeProvidedId } from '@corelithzw/platform/id-generator';
import { recordStockMovement } from '@corelithzw/module-stock/stock-movements';
import { multiplyMoney, ZERO } from '@corelithzw/platform/money';

const stockMovementSchema = z.object({
  referenceId: z.string().min(1).max(50).optional(),
  itemId: z.string().uuid(),
  movementType: z.enum(['RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER']),
  toLocationId: z.string().uuid().optional(),
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
).refine(
  (data) => data.movementType !== 'TRANSFER' || Boolean(data.toLocationId),
  { message: 'toLocationId is required for transfers', path: ['toLocationId'] }
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
    if (siteId) {
      const itemWhere = (where.item as Record<string, unknown> | undefined) ?? {};
      where.item = { ...itemWhere, siteId };
    }
    if (movementType) where.movementType = movementType;
    if (category) {
      const itemWhere = (where.item as Record<string, unknown> | undefined) ?? {};
      where.item = { ...itemWhere, category };
    }

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
          toLocation: { select: { name: true } },
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
    const providedReferenceId = validated.referenceId
      ? normalizeProvidedId(validated.referenceId, "STOCK_MOVEMENT")
      : null;

    // Tenancy is the route's business, and it answers 403 rather than 400. The
    // item is also needed below for the accounting description and its fallback
    // unit cost, so it is read here regardless.
    const item = await prisma.inventoryItem.findUnique({
      where: { id: validated.itemId },
      include: { site: { select: { companyId: true } } },
    });

    if (!item || item.site.companyId !== session.user.companyId) {
      return errorResponse('Invalid item', 403);
    }

    // S-2. Everything this handler used to hand-roll — the unit check, the
    // transfer destination rules, the insufficient-stock and negative-result
    // guards, the movement row and the item update in one transaction — now
    // lives in `recordStockMovement`, which retail has posted through all along.
    // Two writers meant two sets of rules, and this was the worse copy: it never
    // moved `locationId` on a transfer, so a transfer here changed nothing at all.
    const movementDate = validated.movementDate ? new Date(validated.movementDate) : undefined;
    const quantity =
      validated.movementType === 'ADJUSTMENT' ? validated.quantity : Math.abs(validated.quantity);
    const sourceType =
      validated.movementType === 'RECEIPT'
        ? 'STOCK_RECEIPT'
        : validated.movementType === 'ISSUE'
          ? 'STOCK_ISSUE'
          : validated.movementType === 'TRANSFER'
            ? 'STOCK_TRANSFER'
            : 'STOCK_ADJUSTMENT';

    let result: Awaited<ReturnType<typeof recordStockMovement>> | null = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        result = await recordStockMovement({
          companyId: session.user.companyId,
          userId: session.user.id,
          itemId: validated.itemId,
          movementType: validated.movementType,
          quantity: validated.quantity,
          unit: validated.unit,
          // Only a receipt restates what the stock cost; an issue quoting a unit
          // cost must not rewrite the item's.
          unitCost: validated.movementType === 'RECEIPT' ? (validated.unitCost ?? null) : null,
          toLocationId: validated.toLocationId ?? null,
          // A caller-chosen reference is honoured once. If it collides, the next
          // attempt reserves one from the sequence, which is what this handler
          // has always done.
          referenceId: attempt === 0 ? providedReferenceId : null,
          issuedTo: validated.issuedTo ?? null,
          requestedBy: validated.requestedBy ?? null,
          approvedBy: validated.approvedBy ?? null,
          notes: validated.notes ?? null,
          photoUrl: validated.photoUrl ?? null,
          sourceType,
          // A movement posted by hand has no upstream document: it is the document.
          sourceId: null,
          entryDate: movementDate,
        });
        break;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          continue;
        }
        // `recordStockMovement` refuses a bad movement by throwing: wrong unit,
        // insufficient stock, a transfer across sites or of part of a line. Those
        // are the caller's mistake, and they carry their own message.
        if (error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError)) {
          return errorResponse(error.message, 400);
        }
        throw error;
      }
    }

    if (!result) {
      return errorResponse('Unable to generate stock movement reference', 409);
    }

    const { movement, nextStock } = result;
    const resolvedUnitCost = validated.unitCost ?? item.unitCost ?? 0;
    // S-1. `unitCost` is `Decimal(14,2)` now, and this product is what the
    // journal entry is posted for.
    const movementAmount = multiplyMoney(Math.abs(quantity), resolvedUnitCost);

    if (movementAmount.greaterThan(ZERO)) {
      try {
        await createJournalEntryFromSource({
          companyId: session.user.companyId,
          sourceType,
          sourceId: movement.id,
          entryDate: movementDate ?? new Date(),
          description: `Stock ${validated.movementType.toLowerCase()} - ${item.name}`,
          createdById: session.user.id,
          amount: movementAmount,
          netAmount: movementAmount,
          taxAmount: 0,
          grossAmount: movementAmount,
        });
      } catch (error) {
        console.error('[Accounting] Stock movement auto-post failed:', error);
      }
    }

    return successResponse({ movement, updatedStock: nextStock }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse('Validation failed', 400, error.issues);
    }
    console.error('[API] POST /api/inventory/movements error:', error);
    return errorResponse('Failed to record stock movement');
  }
}
