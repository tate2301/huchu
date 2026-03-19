import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import { calculateRetailCheckout } from "@/lib/retail/checkout";
import {
  canManageRetailTransactions,
  ensureSiteAccess,
  getPosSupportedPromotionTypes,
  getCashNetFromPayments,
  isPosSupportedPromotionType,
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

const managerOverrideSchema = z
  .object({
    managerUserId: z.string().uuid().optional(),
    managerEmail: z.string().email().optional(),
    managerPassword: z.string().min(1).max(200),
    reason: z.string().max(240).optional().nullable(),
  })
  .refine((value) => Boolean(value.managerUserId || value.managerEmail), {
    message: "Manager approver is required",
    path: ["managerUserId"],
  });

const saleSchema = z.object({
  saleNo: z.string().min(1).max(50).optional(),
  shiftId: z.string().uuid(),
  siteId: z.string().uuid(),
  customerName: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  discountAmount: z.number().min(0).optional(),
  overrideReason: z.string().max(240).optional().nullable(),
  managerOverride: managerOverrideSchema.optional(),
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

function mapSales(
  sales: SaleListItem[],
  sourceSaleMap: Map<string, string>,
  shiftMap: Map<string, { id: string; shiftNo: string; registerName: string; status: string; closedAt: Date | null }>,
  siteMap: Map<string, { id: string; name: string; code: string }>,
) {
  return sales.map((sale) => {
    const shift = sale.shiftId ? shiftMap.get(sale.shiftId) ?? null : null;
    const site = siteMap.get(sale.siteId) ?? null;
    return {
    id: sale.id,
    saleNo: sale.saleNo,
    saleType: sale.saleType,
    status: sale.status,
    shiftId: sale.shiftId,
    shiftNo: shift?.shiftNo ?? null,
    shiftStatus: shift?.status ?? null,
    shiftClosedAt: shift?.closedAt ?? null,
    registerName: shift?.registerName ?? null,
    siteId: sale.siteId,
    site,
    cashierId: sale.cashierId,
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
    lineCount: sale.lines.length,
    tenderTypes: sale.payments.map((payment) => payment.tenderType),
    payments: sale.payments,
    lines: sale.lines,
    notes: sale.notes,
    };
  });
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
  const scope = searchParams.get("scope")?.trim();
  const cashierId = searchParams.get("cashierId")?.trim();
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? "60"), 1), 200);
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  if (fromDate && Number.isNaN(fromDate.getTime())) {
    return errorResponse("Invalid from date", 400);
  }
  if (toDate && Number.isNaN(toDate.getTime())) {
    return errorResponse("Invalid to date", 400);
  }
  if (fromDate && toDate && fromDate > toDate) {
    return errorResponse("From date must be before to date", 400);
  }

  const effectiveCashierId =
    scope === "mine"
      ? session.user.id
      : cashierId && cashierId !== "all"
        ? cashierId === "me"
          ? session.user.id
          : cashierId
        : undefined;

  const where: Prisma.RetailSaleWhereInput = {
    companyId: session.user.companyId,
    ...(shiftId ? { shiftId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(saleType && saleType !== "all" ? { saleType } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(effectiveCashierId ? { cashierId: effectiveCashierId } : {}),
    ...(fromDate || toDate
      ? {
          postedAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
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
  const shiftIds = [...new Set(sales.map((sale) => sale.shiftId).filter((value): value is string => Boolean(value)))];
  const [shifts, sites] = await Promise.all([
    shiftIds.length
      ? prisma.retailShift.findMany({
          where: { id: { in: shiftIds }, companyId: session.user.companyId },
          select: { id: true, shiftNo: true, registerName: true, status: true, closedAt: true },
        })
      : Promise.resolve([]),
    prisma.site.findMany({
      where: { id: { in: [...new Set(sales.map((sale) => sale.siteId))] } },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  const siteMap = new Map(sites.map((site) => [site.id, site]));

  const mapped = mapSales(sales, sourceSaleMap, shiftMap, siteMap);
  const postedMapped = mapped.filter((sale) => sale.status === "POSTED");

  return successResponse({
    data: mapped,
    filters: {
      shiftId: shiftId ?? null,
      siteId: siteId ?? null,
      saleType: saleType ?? null,
      status: status ?? null,
      scope: scope ?? null,
      cashierId: effectiveCashierId ?? null,
      from: fromDate?.toISOString() ?? null,
      to: toDate?.toISOString() ?? null,
      limit,
    },
    summary: {
      grossSales: round(
        postedMapped
          .filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED")
          .reduce((total, sale) => total + sale.totalAmount, 0),
      ),
      refundValue: round(
        Math.abs(
          postedMapped
            .filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED")
            .reduce((total, sale) => total + sale.totalAmount, 0),
        ),
      ),
      voidValue: round(
        Math.abs(
          postedMapped
            .filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED")
            .reduce((total, sale) => total + sale.totalAmount, 0),
        ),
      ),
      netSales: round(postedMapped.reduce((total, sale) => total + sale.totalAmount, 0)),
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
    if (shift.siteId !== site.id) {
      return errorResponse("Shift site does not match the selected site", 409);
    }

    const promotion = input.promotionId
      ? await prisma.retailPromotion.findFirst({
          where: {
            id: input.promotionId,
            companyId: session.user.companyId,
            status: "ACTIVE",
            type: { in: getPosSupportedPromotionTypes() },
          },
        })
      : null;

    if (input.promotionId && !promotion) {
      const existingPromotion = await prisma.retailPromotion.findFirst({
        where: { id: input.promotionId, companyId: session.user.companyId },
        select: { id: true, type: true, status: true },
      });
      if (
        existingPromotion &&
        existingPromotion.status === "ACTIVE" &&
        !isPosSupportedPromotionType(existingPromotion.type)
      ) {
        return errorResponse("This promotion type is not supported in POS checkout yet", 400);
      }
      return errorResponse("Promotion is not active", 400);
    }

    if (promotion && !inPromotionWindow(promotion)) {
      return errorResponse("Promotion is not active", 400);
    }

    const catalogItems = await prisma.retailCatalogItem.findMany({
      where: {
        companyId: session.user.companyId,
        id: { in: input.items.map((item) => item.catalogItemId) },
        status: "ACTIVE",
      },
    });

    const uniqueCatalogItemCount = new Set(input.items.map((item) => item.catalogItemId)).size;
    if (catalogItems.length !== uniqueCatalogItemCount) {
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

    const preNormalizedLines = input.items.map((item, index) => {
      const catalogItem = catalogMap.get(item.catalogItemId)!;
      if (catalogItem.siteId !== site.id) {
        throw new Error(`${catalogItem.name} does not belong to the selected site.`);
      }
      const inventoryItem = inventoryMap.get(catalogItem.inventoryItemId);
      if (!inventoryItem) {
        throw new Error(`Inventory item missing for ${catalogItem.name}.`);
      }

      const unitPrice = item.unitPrice ?? catalogItem.unitPrice;
      const lineDiscount = item.discountAmount ?? 0;
      if (lineDiscount > round(unitPrice * item.quantity)) {
        throw new Error(`Line discount exceeds line amount for ${catalogItem.name}.`);
      }

      return {
        lineKey: `${catalogItem.id}:${index}`,
        catalogItem,
        inventoryItem,
        quantity: item.quantity,
        unitPrice,
        baseDiscountAmount: lineDiscount,
      };
    });
    const requestedInventoryQuantities = preNormalizedLines.reduce<Map<string, number>>(
      (accumulator, line) => {
        accumulator.set(
          line.inventoryItem.id,
          round((accumulator.get(line.inventoryItem.id) ?? 0) + line.quantity),
        );
        return accumulator;
      },
      new Map(),
    );
    for (const line of preNormalizedLines) {
      const requestedQty = requestedInventoryQuantities.get(line.inventoryItem.id) ?? 0;
      if (line.inventoryItem.currentStock < requestedQty) {
        throw new Error(`Insufficient stock for ${line.catalogItem.name}.`);
      }
    }
    const hasOverride =
      round(input.discountAmount ?? 0) > 0 ||
      preNormalizedLines.some(
        (line) =>
          line.baseDiscountAmount > 0 ||
          Math.abs(line.unitPrice - line.catalogItem.unitPrice) > 0.009,
      );

    let overrideReason = input.overrideReason?.trim() || input.managerOverride?.reason?.trim() || null;

    if (hasOverride && !canManageRetailTransactions(session.user.role)) {
      if (!input.managerOverride) {
        return errorResponse("Manager approval is required for price or discount overrides", 403);
      }

      const manager = await prisma.user.findFirst({
        where: {
          companyId: session.user.companyId,
          isActive: true,
          ...(input.managerOverride.managerUserId
            ? { id: input.managerOverride.managerUserId }
            : {
                email: {
                  equals: input.managerOverride.managerEmail ?? "",
                  mode: "insensitive",
                },
              }),
        },
        select: { id: true, name: true, email: true, password: true, role: true },
      });
      if (!manager || !canManageRetailTransactions(manager.role)) {
        return errorResponse("Manager approval is invalid", 403);
      }
      if (!manager.password) {
        return errorResponse("Manager approval is invalid", 403);
      }

      const validPassword = await bcrypt.compare(input.managerOverride.managerPassword, manager.password);
      if (!validPassword) {
        return errorResponse("Manager approval is invalid", 403);
      }
      if (!overrideReason) {
        return errorResponse("Add an override reason before posting this sale", 400);
      }
      overrideReason = `${overrideReason} (approved by ${manager.name || manager.email})`;
    }

    if (hasOverride && !overrideReason) {
      return errorResponse("Add an override reason before posting this sale", 400);
    }

    const checkout = calculateRetailCheckout({
      lines: preNormalizedLines.map((line) => ({
        id: line.lineKey,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxPercent: line.catalogItem.taxPercent,
        lineDiscountAmount: line.baseDiscountAmount,
      })),
      orderDiscountAmount: input.discountAmount ?? 0,
      promotion: promotion
        ? {
            id: promotion.id,
            type: promotion.type as "PERCENT" | "AMOUNT" | "BUY_X_GET_Y" | "BUNDLE",
            value: promotion.value,
          }
        : null,
    });
    const normalizedLineMap = new Map(checkout.lines.map((line) => [line.id, line]));
    const normalizedLines = preNormalizedLines.map((line) => {
      const calculated = normalizedLineMap.get(line.lineKey);
      if (!calculated) {
        throw new Error(`Unable to price ${line.catalogItem.name}.`);
      }
      return {
        ...line,
        discountAmount: calculated.discountAmount,
        taxAmount: calculated.taxAmount,
        lineTotal: calculated.lineTotal,
      };
    });

    const subtotal = checkout.subtotal;
    const totalDiscount = checkout.discountAmount;
    const taxAmount = checkout.taxAmount;
    const totalAmount = checkout.total;
    const normalizedPayments = input.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: round(payment.amount),
      reference: payment.reference?.trim() || null,
    }));
    const tenderedAmount = round(
      normalizedPayments.reduce((total, payment) => total + payment.amount, 0),
    );
    const nonCashTotal = round(
      normalizedPayments
        .filter((payment) => payment.tenderType !== "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    );
    const cashTotal = round(
      normalizedPayments
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
    const netCash = getCashNetFromPayments(normalizedPayments, changeAmount);
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
        const sale = await prisma.$transaction(async (tx) => {
          const created = await tx.retailSale.create({
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
              overrideReason: overrideReason ?? null,
              status: "POSTED",
              notes: input.notes?.trim() || null,
              postedAt: new Date(),
              tenderSummary: normalizedPayments,
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
                create: normalizedPayments.map((payment) => ({
                  tenderType: payment.tenderType,
                  amount: payment.amount,
                  reference: payment.reference,
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
              notes: `Retail sale ${created.saleNo}`,
              sourceType: "RETAIL_SALE",
              sourceId: `${created.id}:${line.inventoryItem.id}`,
              entryDate: created.postedAt ?? new Date(),
              tx,
              postAccounting: false,
            });
          }

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

          return created;
        });

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
          shiftId: sale.shiftId,
          siteId: sale.siteId,
          cashierId: sale.cashierId,
          cashierName: sale.cashierName,
          customerName: sale.customerName,
          subtotal: sale.subtotal,
          discountAmount: sale.discountAmount,
          taxAmount: sale.taxAmount,
          totalAmount: sale.totalAmount,
          tenderedAmount: sale.tenderedAmount,
          changeAmount: sale.changeAmount,
          payments: sale.payments,
          lines: sale.lines,
          promotionCode: sale.promotionCode,
          overrideReason: sale.overrideReason,
          notes: sale.notes,
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
