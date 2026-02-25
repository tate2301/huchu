import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const DAY_MS = 1000 * 60 * 60 * 24;

function parseDateParam(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildDateFilter(startDate: Date | null, endDate: Date | null) {
  if (!startDate && !endDate) return undefined;
  return {
    ...(startDate ? { gte: startDate } : {}),
    ...(endDate ? { lte: endDate } : {}),
  };
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const startDate = parseDateParam(searchParams.get("startDate"));
    const endDate = parseDateParam(searchParams.get("endDate"));
    const branchId = searchParams.get("branchId");

    if ((searchParams.get("startDate") && !startDate) || (searchParams.get("endDate") && !endDate)) {
      return errorResponse("Invalid date filter", 400);
    }

    const billDateFilter = buildDateFilter(startDate, endDate);
    const paymentDateFilter = buildDateFilter(startDate, endDate);
    const debitNoteDateFilter = buildDateFilter(startDate, endDate);

    const [bills, payments, debitNotes] = await Promise.all([
      prisma.purchaseBill.findMany({
        where: {
          companyId: session.user.companyId,
          status: { in: ["DRAFT", "RECEIVED", "PAID"] },
          ...(billDateFilter ? { billDate: billDateFilter } : {}),
        },
        select: {
          id: true,
          status: true,
          billDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          debitNoteTotal: true,
          writeOffTotal: true,
        },
        orderBy: [{ billDate: "asc" }],
      }),
      prisma.purchasePayment.findMany({
        where: {
          companyId: session.user.companyId,
          ...(paymentDateFilter ? { paidAt: paymentDateFilter } : {}),
        },
        select: {
          amount: true,
          paidAt: true,
        },
        orderBy: [{ paidAt: "asc" }],
      }),
      prisma.debitNote.findMany({
        where: {
          companyId: session.user.companyId,
          status: "ISSUED",
          ...(debitNoteDateFilter ? { noteDate: debitNoteDateFilter } : {}),
        },
        select: {
          total: true,
        },
      }),
    ]);

    const asOf = endDate ?? new Date();
    let openBalance = 0;
    let overdueBalance = 0;
    let receivedBillCount = 0;
    let receivedBillValue = 0;
    const aging = { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0 };
    const statusMap = new Map<string, number>();
    const trendMap = new Map<string, { date: string; billed: number; paid: number }>();

    for (const bill of bills) {
      statusMap.set(bill.status, (statusMap.get(bill.status) ?? 0) + 1);

      if (bill.status === "RECEIVED" || bill.status === "PAID") {
        receivedBillCount += 1;
        receivedBillValue += bill.total;
      }

      const balance =
        bill.total - (bill.amountPaid ?? 0) - (bill.debitNoteTotal ?? 0) - (bill.writeOffTotal ?? 0);
      if (balance > 0 && (bill.status === "RECEIVED" || bill.status === "PAID")) {
        openBalance += balance;
        const dueDate = bill.dueDate ?? bill.billDate;
        const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);
        if (daysPastDue > 0) overdueBalance += balance;

        if (daysPastDue <= 0) aging.current += balance;
        else if (daysPastDue <= 30) aging.days30 += balance;
        else if (daysPastDue <= 60) aging.days60 += balance;
        else if (daysPastDue <= 90) aging.days90 += balance;
        else aging.days90Plus += balance;
      }

      const key = dateKey(bill.billDate);
      const trend = trendMap.get(key) ?? { date: key, billed: 0, paid: 0 };
      if (bill.status === "RECEIVED" || bill.status === "PAID") {
        trend.billed += bill.total;
      }
      trendMap.set(key, trend);
    }

    let paidAmount = 0;
    for (const payment of payments) {
      paidAmount += payment.amount;
      const key = dateKey(payment.paidAt);
      const trend = trendMap.get(key) ?? { date: key, billed: 0, paid: 0 };
      trend.paid += payment.amount;
      trendMap.set(key, trend);
    }

    const debitNoteAmount = debitNotes.reduce((sum, note) => sum + note.total, 0);

    return successResponse({
      kpis: {
        openBalance,
        overdueBalance,
        receivedBillCount,
        receivedBillValue,
        paidAmount,
        debitNoteAmount,
      },
      charts: {
        aging: [
          { bucket: "Current", amount: aging.current },
          { bucket: "1-30", amount: aging.days30 },
          { bucket: "31-60", amount: aging.days60 },
          { bucket: "61-90", amount: aging.days90 },
          { bucket: "90+", amount: aging.days90Plus },
        ],
        statusBreakdown: Array.from(statusMap.entries()).map(([status, count]) => ({
          status,
          count,
        })),
        paymentsTrend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
      meta: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        branchId: branchId || null,
        branchMode: "company-wide",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/hubs/payables-summary error:", error);
    return errorResponse("Failed to fetch payables summary");
  }
}
