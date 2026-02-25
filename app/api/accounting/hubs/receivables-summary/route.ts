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

    const invoiceDateFilter = buildDateFilter(startDate, endDate);
    const receiptDateFilter = buildDateFilter(startDate, endDate);
    const creditNoteDateFilter = buildDateFilter(startDate, endDate);

    const [invoices, receipts, creditNotes] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          companyId: session.user.companyId,
          status: { in: ["DRAFT", "ISSUED", "PAID"] },
          ...(invoiceDateFilter ? { invoiceDate: invoiceDateFilter } : {}),
        },
        select: {
          id: true,
          status: true,
          invoiceDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
        },
        orderBy: [{ invoiceDate: "asc" }],
      }),
      prisma.salesReceipt.findMany({
        where: {
          companyId: session.user.companyId,
          ...(receiptDateFilter ? { receivedAt: receiptDateFilter } : {}),
        },
        select: {
          amount: true,
          receivedAt: true,
        },
        orderBy: [{ receivedAt: "asc" }],
      }),
      prisma.creditNote.findMany({
        where: {
          companyId: session.user.companyId,
          status: "ISSUED",
          ...(creditNoteDateFilter ? { noteDate: creditNoteDateFilter } : {}),
        },
        select: {
          total: true,
        },
      }),
    ]);

    const asOf = endDate ?? new Date();
    let openBalance = 0;
    let overdueBalance = 0;
    let issuedInvoiceCount = 0;
    let issuedInvoiceValue = 0;
    const aging = { current: 0, days30: 0, days60: 0, days90: 0, days90Plus: 0 };
    const statusMap = new Map<string, number>();
    const trendMap = new Map<string, { date: string; invoiced: number; collected: number }>();

    for (const invoice of invoices) {
      statusMap.set(invoice.status, (statusMap.get(invoice.status) ?? 0) + 1);

      if (invoice.status === "ISSUED" || invoice.status === "PAID") {
        issuedInvoiceCount += 1;
        issuedInvoiceValue += invoice.total;
      }

      const balance =
        invoice.total - (invoice.amountPaid ?? 0) - (invoice.creditTotal ?? 0) - (invoice.writeOffTotal ?? 0);
      if (balance > 0 && (invoice.status === "ISSUED" || invoice.status === "PAID")) {
        openBalance += balance;
        const dueDate = invoice.dueDate ?? invoice.invoiceDate;
        const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);
        if (daysPastDue > 0) overdueBalance += balance;

        if (daysPastDue <= 0) aging.current += balance;
        else if (daysPastDue <= 30) aging.days30 += balance;
        else if (daysPastDue <= 60) aging.days60 += balance;
        else if (daysPastDue <= 90) aging.days90 += balance;
        else aging.days90Plus += balance;
      }

      const key = dateKey(invoice.invoiceDate);
      const trend = trendMap.get(key) ?? { date: key, invoiced: 0, collected: 0 };
      if (invoice.status === "ISSUED" || invoice.status === "PAID") {
        trend.invoiced += invoice.total;
      }
      trendMap.set(key, trend);
    }

    let collectedAmount = 0;
    for (const receipt of receipts) {
      collectedAmount += receipt.amount;
      const key = dateKey(receipt.receivedAt);
      const trend = trendMap.get(key) ?? { date: key, invoiced: 0, collected: 0 };
      trend.collected += receipt.amount;
      trendMap.set(key, trend);
    }

    const creditNoteAmount = creditNotes.reduce((sum, note) => sum + note.total, 0);

    return successResponse({
      kpis: {
        openBalance,
        overdueBalance,
        issuedInvoiceCount,
        issuedInvoiceValue,
        collectedAmount,
        creditNoteAmount,
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
        collectionsTrend: Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      },
      meta: {
        startDate: startDate ? startDate.toISOString() : null,
        endDate: endDate ? endDate.toISOString() : null,
        branchId: branchId || null,
        branchMode: "company-wide",
      },
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/hubs/receivables-summary error:", error);
    return errorResponse("Failed to fetch receivables summary");
  }
}
