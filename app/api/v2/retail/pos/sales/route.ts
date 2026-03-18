import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { ensureSiteAccess, recordRetailInventoryMovement, requireRetailSession } from "../../_helpers";

const saleLineSchema = z.object({
  catalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

const salePaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().min(0),
  reference: z.string().max(120).optional().nullable(),
});

const saleSchema = z.object({
  saleNo: z.string().min(1).max(50).optional(),
  shiftId: z.string().uuid().optional().nullable(),
  siteId: z.string().uuid(),
  customerName: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  items: z.array(saleLineSchema).min(1),
  payments: z.array(salePaymentSchema).min(1),
});

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const shiftId = searchParams.get("shiftId")?.trim();

  const sales = await prisma.retailSale.findMany({
    where: {
      companyId: session.user.companyId,
      ...(shiftId ? { shiftId } : {}),
    },
    include: { lines: true, payments: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return successResponse({ data: sales });
}

export async function POST(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const body = await request.json();
    const input = saleSchema.parse(body);
    const site = await ensureSiteAccess(session.user.companyId, input.siteId);
    if (!site) {
      return errorResponse("Invalid site", 400);
    }

    const shift = input.shiftId
      ? await prisma.retailShift.findFirst({
          where: {
            id: input.shiftId,
            companyId: session.user.companyId,
            status: "OPEN",
          },
        })
      : null;

    const catalogItems = await prisma.retailCatalogItem.findMany({
      where: {
        companyId: session.user.companyId,
        id: { in: input.items.map((item) => item.catalogItemId) },
      },
    });

    if (catalogItems.length !== input.items.length) {
      return errorResponse("One or more catalog items are invalid", 400);
    }

    const inventoryItems = await prisma.inventoryItem.findMany({
      where: { id: { in: catalogItems.map((item) => item.inventoryItemId) } },
      select: {
        id: true,
        itemCode: true,
        name: true,
        currentStock: true,
        unit: true,
        unitCost: true,
        locationId: true,
      },
    });
    const inventoryMap = new Map(inventoryItems.map((item) => [item.id, item]));
    const catalogMap = new Map(catalogItems.map((item) => [item.id, item]));

    const normalizedLines = input.items.map((item) => {
      const catalogItem = catalogMap.get(item.catalogItemId)!;
      const inventoryItem = inventoryMap.get(catalogItem.inventoryItemId);
      if (!inventoryItem) {
        throw new Error(`Inventory item missing for ${catalogItem.name}.`);
      }
      if (inventoryItem.currentStock < item.quantity) {
        throw new Error(`Insufficient stock for ${catalogItem.name}.`);
      }

      const unitPrice = item.unitPrice ?? catalogItem.unitPrice;
      const lineDiscount = item.discountAmount ?? 0;
      const baseAmount = unitPrice * item.quantity;
      const taxableAmount = Math.max(baseAmount - lineDiscount, 0);
      const lineTax = Number(((taxableAmount * catalogItem.taxPercent) / 100).toFixed(2));
      const lineTotal = Number((taxableAmount + lineTax).toFixed(2));

      return {
        catalogItem,
        inventoryItem,
        quantity: item.quantity,
        unitPrice,
        discountAmount: lineDiscount,
        taxAmount: lineTax,
        lineTotal,
      };
    });

    const subtotal = Number(
      normalizedLines.reduce((total, line) => total + line.unitPrice * line.quantity, 0).toFixed(2),
    );
    const lineDiscountTotal = Number(
      normalizedLines.reduce((total, line) => total + line.discountAmount, 0).toFixed(2),
    );
    const headerDiscount = input.discountAmount ?? 0;
    const totalDiscount = Number((lineDiscountTotal + headerDiscount).toFixed(2));
    const taxAmount = Number(
      normalizedLines.reduce((total, line) => total + line.taxAmount, 0).toFixed(2),
    );
    const totalAmount = Number((subtotal - totalDiscount + taxAmount).toFixed(2));
    const tenderedAmount = Number(
      input.payments.reduce((total, payment) => total + payment.amount, 0).toFixed(2),
    );

    if (tenderedAmount < totalAmount) {
      return errorResponse("Tendered amount is below the sale total", 400);
    }

    const changeAmount = Number((tenderedAmount - totalAmount).toFixed(2));
    const providedCode = input.saleNo
      ? normalizeProvidedId(input.saleNo, "RETAIL_SALE")
      : null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const saleNo =
        providedCode ??
        (await reserveIdentifier(prisma, {
          companyId: session.user.companyId,
          entity: "RETAIL_SALE",
          siteId: site.id,
        }));

      try {
        const sale = await prisma.retailSale.create({
          data: {
            companyId: session.user.companyId,
            saleNo,
            shiftId: shift?.id ?? null,
            siteId: site.id,
            cashierId: session.user.id,
            cashierName: session.user.name || session.user.email || "Cashier",
            customerName: input.customerName?.trim() || null,
            subtotal,
            discountAmount: totalDiscount,
            taxAmount,
            totalAmount,
            tenderedAmount,
            changeAmount,
            status: "POSTED",
            notes: input.notes?.trim() || null,
            postedAt: new Date(),
            tenderSummary: input.payments,
            lines: {
              create: normalizedLines.map((line) => ({
                inventoryItemId: line.inventoryItem.id,
                catalogItemId: line.catalogItem.id,
                itemName: line.catalogItem.name,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxAmount: line.taxAmount,
                lineTotal: line.lineTotal,
              })),
            },
            payments: {
              create: input.payments.map((payment) => ({
                tenderType: payment.tenderType,
                amount: payment.amount,
                reference: payment.reference?.trim() || null,
              })),
            },
          },
          include: { lines: true, payments: true },
        });

        for (const line of normalizedLines) {
          await recordRetailInventoryMovement({
            companyId: session.user.companyId,
            userId: session.user.id,
            itemId: line.inventoryItem.id,
            movementType: "ISSUE",
            quantity: line.quantity,
            unit: line.inventoryItem.unit,
            unitCost: line.inventoryItem.unitCost ?? 0,
            notes: `Retail sale ${sale.saleNo}`,
            sourceType: "RETAIL_SALE",
            sourceId: `${sale.id}:${line.inventoryItem.id}`,
            entryDate: sale.postedAt ?? new Date(),
          });
        }

        if (shift) {
          const cashPayment = input.payments
            .filter((payment) => payment.tenderType === "CASH")
            .reduce((total, payment) => total + payment.amount, 0);
          if (cashPayment > 0) {
            await prisma.retailShift.update({
              where: { id: shift.id },
              data: {
                expectedCash: {
                  increment: cashPayment - changeAmount,
                },
              },
            });
          }
        }

        try {
          await createJournalEntryFromSource({
            companyId: session.user.companyId,
            sourceType: "RETAIL_SALE",
            sourceId: sale.id,
            entryDate: sale.postedAt ?? new Date(),
            description: `Retail sale ${sale.saleNo}`,
            createdById: session.user.id,
            amount: totalAmount,
            netAmount: Math.max(totalAmount - taxAmount, 0),
            taxAmount,
            grossAmount: totalAmount,
          });
        } catch (error) {
          console.error("[Accounting] Retail sale posting failed:", error);
        }

        return successResponse(sale, 201);
      } catch (error) {
        if (providedCode) {
          return errorResponse("Sale number already exists", 409);
        }
      }
    }

    return errorResponse("Unable to generate sale number", 409);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to post sale", 400);
  }
}
