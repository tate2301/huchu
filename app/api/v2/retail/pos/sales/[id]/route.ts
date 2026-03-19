import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../../_helpers";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const { id } = await params;
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
      ? prisma.retailSale.findUnique({
          where: { id: sale.sourceSaleId },
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
      (accumulator.get(line.sourceLineId) ?? 0) + Math.abs(line.quantity),
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
        return {
          ...line,
          refundedQuantity,
          refundableQuantity: Math.max(line.quantity - refundedQuantity, 0),
        };
      }),
    },
  });
}
