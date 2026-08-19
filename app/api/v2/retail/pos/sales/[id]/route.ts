import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { parseRetailParams, retailIdParams } from "@/lib/retail/request";
import { money, toNumberOrZero } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { canSeeRetailCostPrice } from "@/lib/retail/permissions";
import { requireRetailPermission } from "@/lib/retail/permissions";
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

  const showCost = canSeeRetailCostPrice(session.user.role);

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
    where: { id, companyId: session.user.companyId },
    include: {
      lines: true,
      payments: true,
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
    prisma.retailSale.findMany({
      where: { sourceSaleId: sale.id, companyId: session.user.companyId },
      select: {
        id: true,
        saleNo: true,
        saleType: true,
        status: true,
        totalAmount: true,
        postedAt: true,
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
  const reversalLineRows = relatedSales.length
    ? await prisma.retailSaleLine.findMany({
        where: {
          saleId: { in: relatedSales.map((relatedSale) => relatedSale.id) },
          sourceLineId: { not: null },
        },
        select: { sourceLineId: true, quantity: true },
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

  return successResponse({
    data: {
      ...sale,
      shift,
      site,
      sourceSale,
      reversals: relatedSales,
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
          refundableQuantity: Math.max(toNumberOrZero(line.quantity) - refundedQuantity, 0),
        };
      }),
    },
  });
}
