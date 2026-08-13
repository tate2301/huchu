import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import { money, resolveBaseCurrency, sumMoney, toNumberOrZero } from "@/lib/money";
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

  const site = await prisma.site.findFirst({
    where: { id: shift.siteId, companyId: session.user.companyId },
    select: { id: true, name: true, code: true },
  });

  /**
   * S-7.1 — the currency the drawer is counted in, so the cash drop screen can
   * offer the right denominations. `openingFloat`, `expectedCash` and `variance`
   * are all in the company's base currency; the till was assuming USD, which is
   * true of a Harare bottle store and is not a fact to hard-code.
   */
  const baseCurrency = await resolveBaseCurrency(session.user.companyId);

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
        amount: toNumberOrZero(payment.amount),
      })),
      toNumberOrZero(sale.changeAmount),
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
    .reduce((total, payment) => total + toNumberOrZero(payment.amount), 0);

  return successResponse({
    data: {
      ...shift,
      actorRole: session.user.role,
      baseCurrency,
      site,
      saleCount: saleTickets.length,
      refundCount: refundTickets.length,
      voidCount: voidTickets.length,
      salesValue: toNumberOrZero(sumMoney(saleTickets.map((sale) => sale.totalAmount))),
      refundValue: toNumberOrZero(
        sumMoney(refundTickets.map((sale) => sale.totalAmount)).abs(),
      ),
      voidValue: toNumberOrZero(sumMoney(voidTickets.map((sale) => sale.totalAmount)).abs()),
      netSalesValue: toNumberOrZero(sumMoney(postedSales.map((sale) => sale.totalAmount))),
      itemCount: toNumberOrZero(
        sumMoney(saleTickets.flatMap((sale) => sale.lines).map((line) => line.quantity)),
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
        totalAmount: toNumberOrZero(sale.totalAmount),
        postedAt: sale.postedAt ?? sale.createdAt,
        itemCount: toNumberOrZero(sumMoney(sale.lines.map((line) => money(line.quantity).abs()))),
        tenderTypes: [...new Set(sale.payments.map((payment) => payment.tenderType))],
      })),
    },
  });
}
