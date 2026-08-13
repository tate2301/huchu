import { NextRequest, NextResponse } from "next/server";
import { successResponse } from "@/lib/api-utils";
import {
  money,
  resolveBaseCurrency,
  sumMoney,
  toBaseAmount,
  toNumberOrZero,
} from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getCashNetFromPayments } from "@/lib/retail/cash-up";
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
    // Base currency on both halves. `payment.baseAmount` is stored; change is
    // handed back in the currency the sale was priced in, so it is converted at
    // the sale's own rate rather than today's — a rate that moved this
    // afternoon must not restate what went out of the drawer this morning.
    cashNet: getCashNetFromPayments(
      sale.payments.map((payment) => ({
        tenderType: payment.tenderType,
        baseAmount: payment.baseAmount,
      })),
      toBaseAmount(sale.changeAmount ?? 0, sale.exchangeRate),
    ),
  }));
  const cashIn = sumMoney(
    cashBySale.filter((entry) => entry.cashNet.gt(0)).map((entry) => entry.cashNet),
  );
  const cashOut = sumMoney(
    cashBySale.filter((entry) => entry.cashNet.lt(0)).map((entry) => entry.cashNet),
  ).abs();
  // `baseAmount` here too. A card or EcoCash tender in ZWG is the same face-value
  // trap as cash, and this figure sits beside the cash total on the same screen.
  const nonCashNet = sumMoney(
    postedSales
      .flatMap((sale) => sale.payments)
      .filter((payment) => payment.tenderType !== "CASH")
      .map((payment) => money(payment.baseAmount)),
  );

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
      cashNet: cashIn.minus(cashOut),
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
