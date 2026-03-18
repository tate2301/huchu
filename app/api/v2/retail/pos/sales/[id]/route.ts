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

  const [sourceSale, relatedSales] = await Promise.all([
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
  ]);

  return successResponse({
    data: {
      ...sale,
      sourceSale,
      reversals: relatedSales,
    },
  });
}
