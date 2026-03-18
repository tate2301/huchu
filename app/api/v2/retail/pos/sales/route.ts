import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  canManageRetailTransactions,
  ensureSiteAccess,
  getCashNetFromPayments,
  recordRetailInventoryMovement,
  requireRetailSession,
} from "../../_helpers";

const saleLineSchema = z.object({
  catalogItemId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().min(0).optional(),
  discountAmount: z.number().min(0).optional(),
});

const salePaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const saleSchema = z.object({
  saleNo: z.string().min(1).max(50).optional(),
  shiftId: z.string().uuid(),
  siteId: z.string().uuid(),
  customerName: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  overrideReason: z.string().max(240).optional().nullable(),
  promotionId: z.string().uuid().optional().nullable(),
  items: z.array(saleLineSchema).min(1),
  payments: z.array(salePaymentSchema).min(1),
});

type SaleListItem = Prisma.RetailSaleGetPayload<{
  include: { lines: true; payments: true };
}>;

function round(value: number) {
  return Number(value.toFixed(2));
}

function inPromotionWindow(promotion: {
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  const now = new Date();
  if (promotion.startsAt && promotion.startsAt > now) return false;
  if (promotion.endsAt && promotion.endsAt < now) return false;
  return true;
}

function calculatePromotionDiscount(
  promotion: { type: string; value: number } | null,
  subtotal: number,
) {
  if (!promotion) return 0;
  if (promotion.type === "PERCENT") {
    return round((subtotal * promotion.value) / 100);
  }
  if (promotion.type === "AMOUNT") {
    return round(Math.min(promotion.value, subtotal));
  }
  return 0;
}

function mapSales(sales: SaleListItem[], sourceSaleMap: Map<string, string>) {
  return sales.map((sale) => ({
    id: sale.id,
    saleNo: sale.saleNo,
    saleType: sale.saleType,
    status: sale.status,
    shiftId: sale.shiftId,
    siteId: sale.siteId,
    cashierName: sale.cashierName,
    customerName: sale.customerName,
    postedAt: sale.postedAt ?? sale.createdAt,
    subtotal: sale.subtotal,
    discountAmount: sale.discountAmount,
    taxAmount: sale.taxAmount,
    totalAmount: sale.totalAmount,
    tenderedAmount: sale.tenderedAmount,
    changeAmount: sale.changeAmount,
    promotionCode: sale.promotionCode,
    overrideReason: sale.overrideReason,
    voidReason: sale.voidReason,
    sourceSaleId: sale.sourceSaleId,
    sourceSaleNo: sale.sourceSaleId ? sourceSaleMap.get(sale.sourceSaleId) ?? null : null,
    itemCount: sale.lines.reduce((total, line) => total + Math.abs(line.quantity), 0),
    tenderTypes: sale.payments.map((payment) => payment.tenderType),
    payments: sale.payments,
    lines: sale.lines,
    notes: sale.notes,
  }));
}

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { searchParams } = new URL(request.url);
  const shiftId = searchParams.get("shiftId")?.trim();
  const siteId = searchParams.get("siteId")?.trim();
  const search = searchParams.get("search")?.trim();
  const saleType = searchParams.get("saleType")?.trim();
  const status = searchParams.get("status")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "60"), 1), 200);

  const where: Prisma.RetailSaleWhereInput = {
    companyId: session.user.companyId,
    ...(shiftId ? { shiftId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(saleType && saleType !== "all" ? { saleType } : {}),
    ...(status && status !== "all" ? { status } : {}),
  };

  if (search) {
    where.OR = [
      { saleNo: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { cashierName: { contains: search, mode: "insensitive" } },
      { lines: { some: { itemName: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const sales = await prisma.retailSale.findMany({
    where,
    include: { lines: true, payments: true },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
  });

  const sourceIds = [...new Set(sales.map((sale) => sale.sourceSaleId).filter((value): value is string => Boolean(value)))];
  const sourceSales = sourceIds.length
    ? await prisma.retailSale.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, saleNo: true },
      })
    : [];
  const sourceSaleMap = new Map(sourceSales.map((sale) => [sale.id, sale.saleNo]));

  const mapped = mapSales(sales, sourceSaleMap);

  return successResponse({
    data: mapped,
    summary: {
      grossSales: round(
        mapped
          .filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED")
          .reduce((total, sale) => total + sale.totalAmount, 0),
      ),
      refundValue: round(
        Math.abs(
          mapped
            .filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED")
            .reduce((total, sale) => total + sale.totalAmount, 0),
        ),
      ),
      voidValue: round(
        Math.abs(
          mapped
            .filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED")
            .reduce((total, sale) => total + sale.totalAmount, 0),
        ),
      ),
      netSales: round(mapped.reduce((total, sale) => total + sale.totalAmount, 0)),
    },
  });
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

    const shift = await prisma.retailShift.findFirst({
      where: {
        id: input.shiftId,
        companyId: session.user.companyId,
        status: "OPEN",
        cashierId: session.user.id,
      },
    });
    if (!shift) {
      return errorResponse("Open shift not found for this cashier", 409);
    }

    const promotion = input.promotionId
      ? await prisma.retailPromotion.findFirst({
          where: {
            id: input.promotionId,
            companyId: session.user.companyId,
            status: "ACTIVE",
          },
        })
      : null;

    if (input.promotionId && (!promotion || !inPromotionWindow(promotion))) {
      return errorResponse("Promotion is not active", 400);
    }

    if (promotion && !["PERCENT", "AMOUNT"].includes(promotion.type)) {
      return errorResponse("This promotion type is not supported in POS checkout yet", 400);
    }

    const catalogItems = await prisma.retailCatalogItem.findMany({
      where: {
        companyId: session.user.companyId,
        id: { in: input.items.map((item) => item.catalogItemId) },
        status: "ACTIVE",
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

    const preNormalizedLines = input.items.map((item) => {
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
      const baseAmount = round(unitPrice * item.quantity);
      const taxableBeforeHeader = round(Math.max(baseAmount - lineDiscount, 0));

      return {
        catalogItem,
        inventoryItem,
        quantity: item.quantity,
        unitPrice,
        baseDiscountAmount: lineDiscount,
        baseAmount,
        taxableBeforeHeader,
      };
    });

    const subtotal = round(preNormalizedLines.reduce((total, line) => total + line.baseAmount, 0));
    const manualHeaderDiscount = round(input.discountAmount ?? 0);
    const promotionDiscount = calculatePromotionDiscount(promotion, subtotal);
    const extraDiscountPool = round(manualHeaderDiscount + promotionDiscount);
    const hasOverride =
      manualHeaderDiscount > 0 ||
      preNormalizedLines.some(
        (line) =>
          line.baseDiscountAmount > 0 ||
          Math.abs(line.unitPrice - line.catalogItem.unitPrice) > 0.009,
      );

    if (hasOverride && !canManageRetailTransactions(session.user.role)) {
      return errorResponse("Only retail managers can override prices or discounts", 403);
    }

    if (hasOverride && !input.overrideReason?.trim()) {
      return errorResponse("Add an override reason before posting this sale", 400);
    }

    const totalTaxableBeforeHeader = preNormalizedLines.reduce(
      (total, line) => total + line.taxableBeforeHeader,
      0,
    );

    const normalizedLines = preNormalizedLines.map((line, index) => {
      const allocatedExtraDiscount =
        extraDiscountPool <= 0 || totalTaxableBeforeHeader <= 0
          ? 0
          : index === preNormalizedLines.length - 1
            ? round(
                extraDiscountPool -
                  preNormalizedLines
                    .slice(0, index)
                    .reduce((total, entry) => {
                      const share = round(
                        (entry.taxableBeforeHeader / totalTaxableBeforeHeader) * extraDiscountPool,
                      );
                      return total + share;
                    }, 0),
              )
            : round((line.taxableBeforeHeader / totalTaxableBeforeHeader) * extraDiscountPool);

      const discountAmount = round(line.baseDiscountAmount + allocatedExtraDiscount);
      const taxableAmount = round(Math.max(line.baseAmount - discountAmount, 0));
      const taxAmount = round((taxableAmount * line.catalogItem.taxPercent) / 100);
      const lineTotal = round(taxableAmount + taxAmount);

      return {
        ...line,
        discountAmount,
        taxAmount,
        lineTotal,
      };
    });

    const totalDiscount = round(
      normalizedLines.reduce((total, line) => total + line.discountAmount, 0),
    );
    const taxAmount = round(normalizedLines.reduce((total, line) => total + line.taxAmount, 0));
    const totalAmount = round(normalizedLines.reduce((total, line) => total + line.lineTotal, 0));
    const tenderedAmount = round(
      input.payments.reduce((total, payment) => total + payment.amount, 0),
    );
    const nonCashTotal = round(
      input.payments
        .filter((payment) => payment.tenderType !== "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    );
    const cashTotal = round(
      input.payments
        .filter((payment) => payment.tenderType === "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    );

    if (nonCashTotal > totalAmount) {
      return errorResponse("Non-cash tenders cannot exceed the sale total", 400);
    }

    if (tenderedAmount < totalAmount) {
      return errorResponse("Tendered amount is below the sale total", 400);
    }

    const cashDue = round(Math.max(totalAmount - nonCashTotal, 0));
    const changeAmount = round(Math.max(cashTotal - cashDue, 0));
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
            shiftId: shift.id,
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
            promotionCode: promotion?.promoCode ?? null,
            overrideReason: input.overrideReason?.trim() || null,
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

        const netCash = getCashNetFromPayments(input.payments, changeAmount);
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

        return successResponse({
          id: sale.id,
          saleNo: sale.saleNo,
          saleType: sale.saleType,
          status: sale.status,
          postedAt: sale.postedAt ?? sale.createdAt,
          totalAmount: sale.totalAmount,
          changeAmount: sale.changeAmount,
        }, 201);
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          if (providedCode) {
            return errorResponse("Sale number already exists", 409);
          }
          continue;
        }
        throw error;
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
