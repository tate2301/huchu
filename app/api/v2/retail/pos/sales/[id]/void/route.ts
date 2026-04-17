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

    const [sourceSale, shift] = await Promise.all([
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
    if (shift.siteId !== sourceSale.siteId) {
      return errorResponse("Void shift site does not match sale site", 409);
    }

    const voidNo = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "RETAIL_SALE",
      siteId: sourceSale.siteId,
    });

    const reversal = await prisma.$transaction(async (tx) => {
      const currentSourceSale = await tx.retailSale.findFirst({
        where: { id, companyId: session.user.companyId },
        include: { lines: true, payments: true },
      });
      if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
        throw new Error("Only posted sales can be voided");
      }

      const existingReversals = await tx.retailSale.findMany({
        where: {
          companyId: session.user.companyId,
          sourceSaleId: id,
          saleType: { in: ["REFUND", "VOID"] },
        },
        select: { id: true },
      });
      if (existingReversals.length > 0) {
        throw new Error("Sales with refunds or existing reversals cannot be voided");
      }

      const negativePayments = currentSourceSale.payments.map((payment) => ({
        tenderType: payment.tenderType,
        amount: -round(Math.abs(payment.amount)),
        reference: payment.reference?.trim() || null,
      }));

      const created = await tx.retailSale.create({
        data: {
          companyId: session.user.companyId,
          saleNo: voidNo,
          shiftId: shift.id,
          sourceSaleId: currentSourceSale.id,
          siteId: currentSourceSale.siteId,
          cashierId: session.user.id,
          cashierName: session.user.name || session.user.email || "Cashier",
          customerName: currentSourceSale.customerName,
          saleType: "VOID",
          subtotal: -round(Math.abs(currentSourceSale.subtotal)),
          discountAmount: -round(Math.abs(currentSourceSale.discountAmount)),
          taxAmount: -round(Math.abs(currentSourceSale.taxAmount)),
          totalAmount: -round(Math.abs(currentSourceSale.totalAmount)),
          tenderedAmount: -round(Math.abs(currentSourceSale.tenderedAmount ?? currentSourceSale.totalAmount)),
          changeAmount: 0,
          promotionCode: currentSourceSale.promotionCode,
          overrideReason: input.reason.trim(),
          status: "POSTED",
          notes: input.notes?.trim() || null,
          postedAt: new Date(),
          tenderSummary: negativePayments,
          lines: {
            create: currentSourceSale.lines.map((line) => ({
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

      for (const line of currentSourceSale.lines) {
        const item = await tx.inventoryItem.findUnique({
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
          notes: `Retail sale void ${created.saleNo}`,
          sourceType: "RETAIL_VOID",
          sourceId: `${created.id}:${item.id}`,
          entryDate: created.postedAt ?? new Date(),
          tx,
          postAccounting: false,
        });
      }

      const netCash = getCashNetFromPayments(negativePayments, 0);
      if (netCash !== 0) {
        const updatedShift = await tx.retailShift.updateMany({
          where: {
            id: shift.id,
            companyId: session.user.companyId,
            status: "OPEN",
          },
          data: {
            expectedCash: {
              increment: netCash,
            },
          },
        });
        if (updatedShift.count !== 1) {
          throw new Error("Shift is no longer open.");
        }
      }

      await tx.retailSale.update({
        where: { id: currentSourceSale.id },
        data: {
          status: "VOIDED",
          voidReason: input.reason.trim(),
        },
      });

      return created;
    });

    const voidInventoryItems = await prisma.inventoryItem.findMany({
      where: {
        id: {
          in: reversal.lines.map((line) => line.inventoryItemId),
        },
      },
      select: { id: true, unitCost: true },
    });
    const voidUnitCostByItemId = new Map(
      voidInventoryItems.map((item) => [item.id, item.unitCost ?? 0]),
    );

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "RETAIL_VOID",
        sourceId: reversal.id,
        sourceSubtype: reversal.saleType,
        siteId: reversal.siteId,
        registerCode: shift.registerCode,
        entryDate: reversal.postedAt ?? new Date(),
        description: `Retail sale void ${reversal.saleNo}`,
        createdById: session.user.id,
        amount: Math.abs(reversal.totalAmount),
        netAmount: Math.abs(reversal.subtotal - reversal.discountAmount),
        taxAmount: Math.abs(reversal.taxAmount),
        grossAmount: Math.abs(reversal.totalAmount),
        invertDirection: true,
        payments: reversal.payments.map((payment) => ({
          tenderType: payment.tenderType,
          amount: Math.abs(payment.amount),
          reference: payment.reference,
        })),
        inventory: {
          lines: reversal.lines.map((line) => {
            const unitCost = voidUnitCostByItemId.get(line.inventoryItemId) ?? 0;
            return {
              inventoryItemId: line.inventoryItemId,
              itemName: line.itemName,
              quantity: Math.abs(line.quantity),
              unitCost,
              totalCost: Math.abs(line.quantity) * unitCost,
            };
          }),
        },
      });
    } catch (error) {
      console.error("[Accounting] Retail sale void posting failed:", error);
    }

    return successResponse({
      id: reversal.id,
      saleNo: reversal.saleNo,
      saleType: reversal.saleType,
      status: reversal.status,
      shiftId: reversal.shiftId,
      siteId: reversal.siteId,
      sourceSaleId: reversal.sourceSaleId,
      totalAmount: reversal.totalAmount,
      tenderedAmount: reversal.tenderedAmount,
      postedAt: reversal.postedAt ?? reversal.createdAt,
      lines: reversal.lines,
      payments: reversal.payments,
      overrideReason: reversal.overrideReason,
      notes: reversal.notes,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to void sale", 400);
  }
}
