import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  canManageRetailTransactions,
  getCashNetFromPayments,
  recordRetailInventoryMovement,
  requireRetailSession,
} from "../../../../_helpers";

const voidSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  notes: z.string().max(500).optional().nullable(),
});

function round(value: number) {
  return Number(value.toFixed(2));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  if (!canManageRetailTransactions(session.user.role)) {
    return errorResponse("Only retail managers can void sales", 403);
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const input = voidSchema.parse(body);

    const [sourceSale, shift, existingReversals] = await Promise.all([
      prisma.retailSale.findFirst({
        where: { id, companyId: session.user.companyId },
        include: { lines: true, payments: true },
      }),
      prisma.retailShift.findFirst({
        where: {
          id: input.shiftId,
          companyId: session.user.companyId,
          status: "OPEN",
          cashierId: session.user.id,
        },
      }),
      prisma.retailSale.findMany({
        where: { companyId: session.user.companyId, sourceSaleId: id },
        select: { id: true, saleType: true },
      }),
    ]);

    if (!sourceSale) {
      return errorResponse("Sale not found", 404);
    }
    if (!shift) {
      return errorResponse("Open shift not found for this cashier", 409);
    }
    if (sourceSale.saleType !== "SALE" || sourceSale.status !== "POSTED") {
      return errorResponse("Only posted sales can be voided", 409);
    }
    if (existingReversals.length > 0) {
      return errorResponse("Sales with refunds or existing reversals cannot be voided", 409);
    }

    const voidNo = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "RETAIL_SALE",
      siteId: sourceSale.siteId,
    });

    const negativePayments = sourceSale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: -round(Math.abs(payment.amount)),
      reference: payment.reference,
    }));

    const reversal = await prisma.$transaction(async (tx) => {
      const created = await tx.retailSale.create({
        data: {
          companyId: session.user.companyId,
          saleNo: voidNo,
          shiftId: shift.id,
          sourceSaleId: sourceSale.id,
          siteId: sourceSale.siteId,
          cashierId: session.user.id,
          cashierName: session.user.name || session.user.email || "Cashier",
          customerName: sourceSale.customerName,
          saleType: "VOID",
          subtotal: -round(Math.abs(sourceSale.subtotal)),
          discountAmount: -round(Math.abs(sourceSale.discountAmount)),
          taxAmount: -round(Math.abs(sourceSale.taxAmount)),
          totalAmount: -round(Math.abs(sourceSale.totalAmount)),
          tenderedAmount: -round(Math.abs(sourceSale.tenderedAmount ?? sourceSale.totalAmount)),
          changeAmount: 0,
          promotionCode: sourceSale.promotionCode,
          overrideReason: input.reason.trim(),
          status: "POSTED",
          notes: input.notes?.trim() || null,
          postedAt: new Date(),
          tenderSummary: negativePayments,
          lines: {
            create: sourceSale.lines.map((line) => ({
              sourceLineId: line.id,
              inventoryItemId: line.inventoryItemId,
              catalogItemId: line.catalogItemId,
              itemName: line.itemName,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: -round(Math.abs(line.discountAmount)),
              taxAmount: -round(Math.abs(line.taxAmount)),
              lineTotal: -round(Math.abs(line.lineTotal)),
            })),
          },
          payments: {
            create: negativePayments,
          },
        },
        include: { lines: true, payments: true },
      });

      await tx.retailSale.update({
        where: { id: sourceSale.id },
        data: {
          status: "VOIDED",
          voidReason: input.reason.trim(),
        },
      });

      return created;
    });

    for (const line of sourceSale.lines) {
      const item = await prisma.inventoryItem.findUnique({
        where: { id: line.inventoryItemId },
        select: { id: true, unit: true, unitCost: true },
      });
      if (!item) {
        throw new Error(`Inventory item missing for ${line.itemName}.`);
      }
      await recordRetailInventoryMovement({
        companyId: session.user.companyId,
        userId: session.user.id,
        itemId: item.id,
        movementType: "RECEIPT",
        quantity: line.quantity,
        unit: item.unit,
        unitCost: item.unitCost ?? 0,
        notes: `Retail sale void ${reversal.saleNo}`,
        sourceType: "RETAIL_REFUND",
        sourceId: `${reversal.id}:${item.id}`,
        entryDate: reversal.postedAt ?? new Date(),
      });
    }

    const netCash = getCashNetFromPayments(negativePayments, 0);
    if (netCash !== 0) {
      await prisma.retailShift.update({
        where: { id: shift.id },
        data: {
          expectedCash: {
            increment: netCash,
          },
        },
      });
    }

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "RETAIL_REFUND",
        sourceId: reversal.id,
        entryDate: reversal.postedAt ?? new Date(),
        description: `Retail sale void ${reversal.saleNo}`,
        createdById: session.user.id,
        amount: Math.abs(reversal.totalAmount),
        netAmount: Math.abs(reversal.subtotal - reversal.discountAmount),
        taxAmount: Math.abs(reversal.taxAmount),
        grossAmount: Math.abs(reversal.totalAmount),
        invertDirection: true,
      });
    } catch (error) {
      console.error("[Accounting] Retail sale void posting failed:", error);
    }

    return successResponse({
      id: reversal.id,
      saleNo: reversal.saleNo,
      saleType: reversal.saleType,
      totalAmount: reversal.totalAmount,
      postedAt: reversal.postedAt ?? reversal.createdAt,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to void sale", 400);
  }
}
