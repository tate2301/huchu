import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/accounting/ledger";

type StatementLine = {
  date: string;
  type: string;
  reference: string;
  description?: string | null;
  debit: number;
  credit: number;
};

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildDateFilter(startDate: Date | null, endDate: Date | null) {
  if (!startDate && !endDate) return undefined;
  const filter: { gte?: Date; lte?: Date } = {};
  if (startDate) filter.gte = startDate;
  if (endDate) filter.lte = endDate;
  return filter;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get("vendorId");
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    if (!vendorId) {
      return errorResponse("Vendor is required", 400);
    }

    const startDate = parseDateParam(startParam);
    const endDate = parseDateParam(endParam);

    if ((startParam && !startDate) || (endParam && !endDate)) {
      return errorResponse("Invalid date range", 400);
    }

    if (startDate && endDate && startDate > endDate) {
      return errorResponse("Start date must be before end date", 400);
    }

    const vendor = await prisma.vendor.findUnique({
      where: { id: vendorId },
      select: { companyId: true },
    });
    if (!vendor || vendor.companyId !== session.user.companyId) {
      return errorResponse("Vendor not found", 404);
    }

    let openingBalance = 0;
    if (startDate) {
      const [billTotals, paymentTotals, debitTotals, writeOffTotals] = await Promise.all([
        prisma.purchaseBill.aggregate({
          where: {
            companyId: session.user.companyId,
            vendorId,
            status: { in: ["RECEIVED", "PAID"] },
            billDate: { lt: startDate },
          },
          _sum: { total: true },
        }),
        prisma.purchasePayment.aggregate({
          where: {
            bill: { vendorId, companyId: session.user.companyId },
            paidAt: { lt: startDate },
          },
          _sum: { amount: true },
        }),
        prisma.debitNote.aggregate({
          where: {
            bill: { vendorId, companyId: session.user.companyId },
            status: "ISSUED",
            noteDate: { lt: startDate },
          },
          _sum: { total: true },
        }),
        prisma.purchaseWriteOff.aggregate({
          where: {
            bill: { vendorId, companyId: session.user.companyId },
            status: "POSTED",
            createdAt: { lt: startDate },
          },
          _sum: { amount: true },
        }),
      ]);

      openingBalance =
        toMoney(billTotals._sum.total) -
        toMoney(paymentTotals._sum.amount) -
        toMoney(debitTotals._sum.total) -
        toMoney(writeOffTotals._sum.amount);
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    const [bills, payments, debitNotes, writeOffs] = await Promise.all([
      prisma.purchaseBill.findMany({
        where: {
          companyId: session.user.companyId,
          vendorId,
          status: { in: ["RECEIVED", "PAID"] },
          ...(dateFilter ? { billDate: dateFilter } : {}),
        },
        select: { billDate: true, billNumber: true, total: true },
      }),
      prisma.purchasePayment.findMany({
        where: {
          bill: { vendorId, companyId: session.user.companyId },
          ...(dateFilter ? { paidAt: dateFilter } : {}),
        },
        select: { paidAt: true, paymentNumber: true, amount: true, method: true },
      }),
      prisma.debitNote.findMany({
        where: {
          bill: { vendorId, companyId: session.user.companyId },
          status: "ISSUED",
          ...(dateFilter ? { noteDate: dateFilter } : {}),
        },
        select: { noteDate: true, noteNumber: true, total: true, reason: true },
      }),
      prisma.purchaseWriteOff.findMany({
        where: {
          bill: { vendorId, companyId: session.user.companyId },
          status: "POSTED",
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        select: { createdAt: true, amount: true, reason: true },
      }),
    ]);

    const lines: StatementLine[] = [
      ...bills.map((bill) => ({
        date: bill.billDate.toISOString(),
        type: "Bill",
        reference: bill.billNumber,
        description: "Purchase bill",
        debit: 0,
        credit: toMoney(bill.total),
      })),
      ...payments.map((payment) => ({
        date: payment.paidAt.toISOString(),
        type: "Payment",
        reference: payment.paymentNumber,
        description: payment.method,
        debit: toMoney(payment.amount),
        credit: 0,
      })),
      ...debitNotes.map((note) => ({
        date: note.noteDate.toISOString(),
        type: "Debit Note",
        reference: note.noteNumber,
        description: note.reason,
        debit: toMoney(note.total),
        credit: 0,
      })),
      ...writeOffs.map((writeOff) => ({
        date: writeOff.createdAt.toISOString(),
        type: "Write-off",
        reference: "Write-off",
        description: writeOff.reason,
        debit: toMoney(writeOff.amount),
        credit: 0,
      })),
    ];

    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = openingBalance;
    const detailedLines = lines.map((line) => {
      runningBalance += line.credit - line.debit;
      return { ...line, balance: runningBalance };
    });

    return successResponse({
      openingBalance,
      closingBalance: runningBalance,
      lines: detailedLines,
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/vendor-statement error:", error);
    return errorResponse("Failed to fetch vendor statement");
  }
}
