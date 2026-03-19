import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { getCashNetFromPayments, requireRetailSession } from "../../_helpers";

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
  const postedSales = sales.filter((sale) => sale.status === "POSTED");
  const recentCashierSales = await prisma.retailSale.findMany({
    where: { companyId: session.user.companyId, cashierId: session.user.id, status: "POSTED" },
    include: { payments: true, lines: true },
    orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
    take: 30,
  });

  const saleTickets = postedSales.filter((sale) => sale.saleType === "SALE");
  const refundTickets = postedSales.filter((sale) => sale.saleType === "REFUND");
  const voidTickets = postedSales.filter((sale) => sale.saleType === "VOID");
  const cashBySale = postedSales.map((sale) => ({
    saleId: sale.id,
    saleType: sale.saleType,
    cashNet: getCashNetFromPayments(
      sale.payments.map((payment) => ({
        tenderType: payment.tenderType,
        amount: payment.amount,
      })),
      sale.changeAmount ?? 0,
    ),
  }));
  const cashIn = cashBySale
    .filter((entry) => entry.cashNet > 0)
    .reduce((total, entry) => total + entry.cashNet, 0);
  const cashOut = Math.abs(
    cashBySale.filter((entry) => entry.cashNet < 0).reduce((total, entry) => total + entry.cashNet, 0),
  );
  const nonCashNet = postedSales
    .flatMap((sale) => sale.payments)
    .filter((payment) => payment.tenderType !== "CASH")
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
      voidValue: Math.abs(voidTickets.reduce((total, sale) => total + sale.totalAmount, 0)),
      netSalesValue: postedSales.reduce((total, sale) => total + sale.totalAmount, 0),
      itemCount: saleTickets.reduce(
        (total, sale) => total + sale.lines.reduce((lineTotal, line) => lineTotal + line.quantity, 0),
        0,
      ),
      transactionCount: postedSales.length,
      cashSales: cashIn,
      cashIn,
      cashOut,
      cashNet: cashIn - cashOut,
      nonCashSales: nonCashNet,
      recentTransactions: recentCashierSales.map((sale) => ({
        id: sale.id,
        saleNo: sale.saleNo,
        saleType: sale.saleType,
        status: sale.status,
        shiftId: sale.shiftId,
        totalAmount: sale.totalAmount,
        postedAt: sale.postedAt ?? sale.createdAt,
        itemCount: sale.lines.reduce((total, line) => total + Math.abs(line.quantity), 0),
        tenderTypes: [...new Set(sale.payments.map((payment) => payment.tenderType))],
      })),
    },
  });
}
