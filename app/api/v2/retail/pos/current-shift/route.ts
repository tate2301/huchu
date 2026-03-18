import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { requireRetailSession } from "../../_helpers";

export async function GET(request: NextRequest) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const shift = await prisma.retailShift.findFirst({
    where: {
      companyId: session.user.companyId,
      cashierId: session.user.id,
      status: "OPEN",
    },
    orderBy: { openedAt: "desc" },
  });

  if (!shift) {
    return successResponse({ data: null });
  }

  const site = await prisma.site.findUnique({
    where: { id: shift.siteId },
    select: { id: true, name: true, code: true },
  });

  const sales = await prisma.retailSale.findMany({
    where: { shiftId: shift.id },
    include: { payments: true, lines: true },
  });

  const saleTickets = sales.filter((sale) => sale.saleType === "SALE" && sale.status === "POSTED");
  const refundTickets = sales.filter((sale) => sale.saleType === "REFUND" && sale.status === "POSTED");
  const voidTickets = sales.filter((sale) => sale.saleType === "VOID" && sale.status === "POSTED");
  const cashSales = sales
    .flatMap((sale) => sale.payments)
    .filter((payment) => payment.tenderType === "CASH")
    .reduce((total, payment) => total + payment.amount, 0);

  return successResponse({
    data: {
      ...shift,
      actorRole: session.user.role,
      site,
      saleCount: saleTickets.length,
      refundCount: refundTickets.length,
      voidCount: voidTickets.length,
      salesValue: saleTickets.reduce((total, sale) => total + sale.totalAmount, 0),
      refundValue: Math.abs(refundTickets.reduce((total, sale) => total + sale.totalAmount, 0)),
      netSalesValue: sales.reduce((total, sale) => total + sale.totalAmount, 0),
      itemCount: saleTickets.reduce(
        (total, sale) => total + sale.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
        0,
      ),
      cashSales,
      nonCashSales: sales
        .flatMap((sale) => sale.payments)
        .filter((payment) => payment.tenderType !== "CASH")
        .reduce((total, payment) => total + payment.amount, 0),
    },
  });
}
