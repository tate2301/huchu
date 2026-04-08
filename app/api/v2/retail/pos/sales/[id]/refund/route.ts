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

const refundLineSchema = z.object({
  saleLineId: z.string().uuid(),
  quantity: z.number().positive(),
});

const refundPaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const refundSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(refundLineSchema).min(1),
  payments: z.array(refundPaymentSchema).min(1),
});

function round(value: number) {
  return Number(value.toFixed(2));
}

const TENDERS_REQUIRING_REFERENCE = new Set(["CARD", "MOBILE_MONEY"]);

function validateTenderReferences(
  payments: Array<{ tenderType: string; reference: string | null }>,
) {
  for (const payment of payments) {
    if (!TENDERS_REQUIRING_REFERENCE.has(payment.tenderType)) continue;
    const reference = payment.reference?.trim() ?? "";
    if (reference.length < 4) {
      return `${payment.tenderType.replaceAll("_", " ")} reference is required`;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9\-/_ ]*$/.test(reference)) {
      return `${payment.tenderType.replaceAll("_", " ")} reference format is invalid`;
    }
  }
  return null;
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
    return errorResponse("Only retail managers can process refunds", 403);
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const input = refundSchema.parse(body);

    const [sourceSale, shift] = await Promise.all([
      prisma.retailSale.findFirst({
        where: { id, companyId: session.user.companyId },
        include: { lines: true },
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
      return errorResponse("Only posted sales can be refunded", 409);
    }
    if (shift.siteId !== sourceSale.siteId) {
      return errorResponse("Refund shift site does not match sale site", 409);
    }

    const refundNo = await reserveIdentifier(prisma, {
      companyId: session.user.companyId,
      entity: "RETAIL_SALE",
      siteId: sourceSale.siteId,
    });
    const requestedByLine = input.lines.reduce<Map<string, number>>((accumulator, line) => {
      accumulator.set(line.saleLineId, round((accumulator.get(line.saleLineId) ?? 0) + line.quantity));
      return accumulator;
    }, new Map());
    const normalizedLineRequests = [...requestedByLine.entries()].map(([saleLineId, quantity]) => ({
      saleLineId,
      quantity,
    }));

    const refundPayments = input.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: round(payment.amount),
      reference: payment.reference?.trim() || null,
    }));
    const paymentReferenceError = validateTenderReferences(refundPayments);
    if (paymentReferenceError) {
      return errorResponse(paymentReferenceError, 400);
    }
    const negativePayments = refundPayments.map((payment) => ({
      ...payment,
      amount: -payment.amount,
    }));

    const refund = await prisma.$transaction(async (tx) => {
      const currentSourceSale = await tx.retailSale.findFirst({
        where: { id, companyId: session.user.companyId },
        include: { lines: true },
      });
      if (!currentSourceSale || currentSourceSale.saleType !== "SALE" || currentSourceSale.status !== "POSTED") {
        throw new Error("Only posted sales can be refunded");
      }

      const priorRefunds = await tx.retailSale.findMany({
        where: {
          companyId: session.user.companyId,
          sourceSaleId: currentSourceSale.id,
          saleType: { in: ["REFUND", "VOID"] },
        },
        include: { lines: true },
      });

      const refundedByLine = priorRefunds
        .flatMap((sale) => sale.lines)
        .reduce<Map<string, number>>((accumulator, line) => {
          if (!line.sourceLineId) return accumulator;
          accumulator.set(
            line.sourceLineId,
            round((accumulator.get(line.sourceLineId) ?? 0) + Math.abs(line.quantity)),
          );
          return accumulator;
        }, new Map());

      const requestedLines = normalizedLineRequests.map((line) => {
        const sourceLine = currentSourceSale.lines.find((entry) => entry.id === line.saleLineId);
        if (!sourceLine) {
          throw new Error("One or more refund lines are invalid.");
        }
        const alreadyRefunded = refundedByLine.get(sourceLine.id) ?? 0;
        const refundableQty = round(Math.max(sourceLine.quantity - alreadyRefunded, 0));
        if (line.quantity > refundableQty) {
          throw new Error(`Refund quantity exceeds remaining quantity for ${sourceLine.itemName}.`);
        }

        const ratio = sourceLine.quantity > 0 ? line.quantity / sourceLine.quantity : 0;
        return {
          sourceLine,
          quantity: line.quantity,
          baseAmount: round(sourceLine.unitPrice * line.quantity),
          discountAmount: -round(Math.abs(sourceLine.discountAmount) * ratio),
          taxAmount: -round(Math.abs(sourceLine.taxAmount) * ratio),
          lineTotal: -round(Math.abs(sourceLine.lineTotal) * ratio),
        };
      });

      const subtotal = -round(requestedLines.reduce((total, line) => total + line.baseAmount, 0));
      const discountAmount = round(requestedLines.reduce((total, line) => total + line.discountAmount, 0));
      const taxAmount = round(requestedLines.reduce((total, line) => total + line.taxAmount, 0));
      const totalAmount = round(requestedLines.reduce((total, line) => total + line.lineTotal, 0));
      const refundValue = round(Math.abs(totalAmount));
      const paymentTotal = round(refundPayments.reduce((total, payment) => total + payment.amount, 0));
      if (Math.abs(paymentTotal - refundValue) > 0.01) {
        throw new Error("Refund payments must match the refund value");
      }

      const created = await tx.retailSale.create({
        data: {
          companyId: session.user.companyId,
          saleNo: refundNo,
          shiftId: shift.id,
          sourceSaleId: currentSourceSale.id,
          siteId: currentSourceSale.siteId,
          cashierId: session.user.id,
          cashierName: session.user.name || session.user.email || "Cashier",
          customerName: currentSourceSale.customerName,
          saleType: "REFUND",
          subtotal,
          discountAmount,
          taxAmount,
          totalAmount,
          tenderedAmount: -paymentTotal,
          changeAmount: 0,
          overrideReason: input.reason.trim(),
          status: "POSTED",
          notes: input.notes?.trim() || null,
          postedAt: new Date(),
          tenderSummary: negativePayments,
          lines: {
            create: requestedLines.map((line) => ({
              sourceLineId: line.sourceLine.id,
              inventoryItemId: line.sourceLine.inventoryItemId,
              catalogItemId: line.sourceLine.catalogItemId,
              itemName: line.sourceLine.itemName,
              quantity: line.quantity,
              unitPrice: line.sourceLine.unitPrice,
              discountAmount: line.discountAmount,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
            })),
          },
          payments: {
            create: negativePayments.map((payment) => ({
              tenderType: payment.tenderType,
              amount: payment.amount,
              reference: payment.reference,
            })),
          },
        },
        include: { lines: true, payments: true },
      });

      for (const line of requestedLines) {
        const item = await tx.inventoryItem.findUnique({
          where: { id: line.sourceLine.inventoryItemId },
          select: { id: true, unit: true, unitCost: true },
        });
        if (!item) {
          throw new Error(`Inventory item missing for ${line.sourceLine.itemName}.`);
        }
        await recordRetailInventoryMovement({
          companyId: session.user.companyId,
          userId: session.user.id,
          itemId: item.id,
          movementType: "RECEIPT",
          quantity: line.quantity,
          unit: item.unit,
          unitCost: item.unitCost ?? 0,
          notes: `Retail refund ${created.saleNo}`,
          sourceType: "RETAIL_REFUND",
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

      return {
        created,
        subtotal,
        discountAmount,
        taxAmount,
        refundValue,
      };
    });

    try {
      await createJournalEntryFromSource({
        companyId: session.user.companyId,
        sourceType: "RETAIL_REFUND",
        sourceId: refund.created.id,
        entryDate: refund.created.postedAt ?? new Date(),
        description: `Retail refund ${refund.created.saleNo}`,
        createdById: session.user.id,
        amount: refund.refundValue,
        netAmount: Math.abs(refund.subtotal - refund.discountAmount),
        taxAmount: Math.abs(refund.taxAmount),
        grossAmount: refund.refundValue,
        invertDirection: true,
      });
    } catch (error) {
      console.error("[Accounting] Retail refund posting failed:", error);
    }

    return successResponse({
      id: refund.created.id,
      saleNo: refund.created.saleNo,
      saleType: refund.created.saleType,
      status: refund.created.status,
      shiftId: refund.created.shiftId,
      siteId: refund.created.siteId,
      sourceSaleId: refund.created.sourceSaleId,
      totalAmount: refund.created.totalAmount,
      tenderedAmount: refund.created.tenderedAmount,
      postedAt: refund.created.postedAt ?? refund.created.createdAt,
      lines: refund.created.lines,
      payments: refund.created.payments,
      overrideReason: refund.created.overrideReason,
      notes: refund.created.notes,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post refund", 400);
  }
}
