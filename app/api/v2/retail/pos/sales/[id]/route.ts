import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-response";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canSeeRetailCostPrice, requireRetailPermission, retailRoleKey } from "@/lib/retail/permissions";
import { RETAIL_AUDIT_EVENTS } from "@/lib/retail/audit";
import { readsEveryCashier } from "@/lib/retail/own-rows";
import { requireRetailSession } from "../../../_helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  // R-2.3. One posted receipt, with its lines and tenders.
  const gate = requireRetailPermission(session, "retail.sell", "view");
  if (gate) return gate;

  const showCost = canSeeRetailCostPrice(retailRoleKey(session));

  /*
    R-3.1. The segment, through a schema.

    Prisma is not injectable, so this is not a security fix. It is the
    difference between a 400 naming the parameter and a 404 that reads, to a
    shopkeeper, as "the receipt you are holding is not in the system".
  */
  const path = await parseRetailParams(params, retailIdParams);
  if (path.response) return path.response;
  const { id } = path.data;
  const sale = await prisma.retailSale.findFirst({
    // A cashier reads the receipts they rang up; anyone else's answers as
    // missing rather than confirming it exists (00-foundations 5.3.4, "own").
    where: {
      id,
      companyId: session.user.companyId,
      ...(readsEveryCashier(session.user.role) ? {} : { cashierId: session.user.id }),
    },
    include: {
      lines: true,
      payments: true,
      // Whether ZIMRA has this sale, and under what number — the fact a
      // manager holding a customer's slip asks first.
      fiscalReceipt: { select: { status: true, fiscalNumber: true, lastError: true } },
    },
  });

  if (!sale) {
    return errorResponse("Sale not found", 404);
  }

  const [sourceSale, relatedSales, shift, site] = await Promise.all([
    sale.sourceSaleId
      ? prisma.retailSale.findFirst({
          where: { id: sale.sourceSaleId, companyId: session.user.companyId },
          select: { id: true, saleNo: true, saleType: true, totalAmount: true },
        })
      : Promise.resolve(null),
    // Every refund and void of it, whoever did them: a cashier sees a
    // manager's refund of their own sale.
    prisma.retailSale.findMany({
      where: { sourceSaleId: sale.id, companyId: session.user.companyId },
      select: {
        id: true,
        saleNo: true,
        saleType: true,
        status: true,
        totalAmount: true,
        depositAmount: true,
        postedAt: true,
        cashierName: true,
        overrideReason: true,
        lines: { select: { id: true, itemName: true, quantity: true, lineTotal: true } },
        payments: { select: { tenderType: true, currency: true } },
      },
      orderBy: { postedAt: "desc" },
    }),
    sale.shiftId
      ? prisma.retailShift.findFirst({
          where: { id: sale.shiftId, companyId: session.user.companyId },
          select: {
            id: true,
            shiftNo: true,
            registerName: true,
            siteId: true,
            status: true,
            openedAt: true,
            closedAt: true,
          },
        })
      : Promise.resolve(null),
    prisma.site.findFirst({
      where: { id: sale.siteId, companyId: session.user.companyId },
      select: { id: true, name: true, code: true },
    }),
  ]);
  const [promotion, reversalEvents] = await Promise.all([
    // The promotion by its name, as the shop wrote it; the sale keeps only the code.
    sale.promotionCode
      ? prisma.retailPromotion.findFirst({
          where: { companyId: session.user.companyId, promoCode: sale.promotionCode },
          select: { name: true },
        })
      : Promise.resolve(null),
    // Who approved each reversal with their PIN lives on the audit chain, not the sale row.
    relatedSales.length
      ? prisma.platformAuditEvent.findMany({
          where: {
            companyId: session.user.companyId,
            entityType: "RetailSale",
            entityId: { in: relatedSales.map((relatedSale) => relatedSale.id) },
            eventType: { in: [RETAIL_AUDIT_EVENTS.saleRefunded, RETAIL_AUDIT_EVENTS.saleVoided] },
          },
          select: { entityId: true, payloadJson: true },
        })
      : Promise.resolve([]),
  ]);
  const approvedByReversal = new Map(
    reversalEvents.map((event) => [event.entityId, approverName(event.payloadJson)]),
  );
  const reversalLineRows = relatedSales.length
    ? await prisma.retailSaleLine.findMany({
        where: {
          saleId: { in: relatedSales.map((relatedSale) => relatedSale.id) },
          sourceLineId: { not: null },
        },
        select: { sourceLineId: true, quantity: true, depositAmount: true },
      })
    : [];
  const refundedBySourceLine = reversalLineRows.reduce<Map<string, number>>((accumulator, line) => {
    if (!line.sourceLineId) return accumulator;
    accumulator.set(
      line.sourceLineId,
      (accumulator.get(line.sourceLineId) ?? 0) + toNumberOrZero(money(line.quantity).abs()),
    );
    return accumulator;
  }, new Map());
  const depositRefundedBySourceLine = reversalLineRows.reduce<Map<string, number>>((accumulator, line) => {
    if (!line.sourceLineId) return accumulator;
    accumulator.set(
      line.sourceLineId,
      (accumulator.get(line.sourceLineId) ?? 0) + toNumberOrZero(money(line.depositAmount).abs()),
    );
    return accumulator;
  }, new Map());

  return successResponse({
    data: {
      ...sale,
      shift,
      site,
      sourceSale,
      promotion,
      reversals: relatedSales.map((reversal) => ({
        ...reversal,
        approvedBy: approvedByReversal.get(reversal.id) ?? null,
      })),
      lines: sale.lines.map((line) => {
        const refundedQuantity = refundedBySourceLine.get(line.id) ?? 0;
        // R-2.3. Opening a sale to refund it is a cashier's job; reading the
        // margin on it is not. Destructured out rather than deleted after the
        // spread, so a cost field added later is withheld by default.
        const { costUnit, costTotal, ...rest } = line;
        return {
          ...rest,
          ...(showCost ? { costUnit, costTotal } : {}),
          refundedQuantity,
          depositRefunded: depositRefundedBySourceLine.get(line.id) ?? 0,
          refundableQuantity: Math.max(toNumberOrZero(line.quantity) - refundedQuantity, 0),
        };
      }),
    },
  });
}

/** The approver's name on a refund or void's audit event, or null when nobody had to approve. */
function approverName(payloadJson: string | null): string | null {
  if (!payloadJson) return null;
  try {
    const payload = JSON.parse(payloadJson) as { approvedByName?: unknown };
    return typeof payload.approvedByName === "string" && payload.approvedByName ? payload.approvedByName : null;
  } catch {
    return null;
  }
}
