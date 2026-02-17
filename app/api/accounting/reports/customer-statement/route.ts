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
    const customerId = searchParams.get("customerId");
    const startParam = searchParams.get("startDate");
    const endParam = searchParams.get("endDate");

    if (!customerId) {
      return errorResponse("Customer is required", 400);
    }

    const startDate = parseDateParam(startParam);
    const endDate = parseDateParam(endParam);

    if ((startParam && !startDate) || (endParam && !endDate)) {
      return errorResponse("Invalid date range", 400);
    }

    if (startDate && endDate && startDate > endDate) {
      return errorResponse("Start date must be before end date", 400);
    }

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { companyId: true },
    });
    if (!customer || customer.companyId !== session.user.companyId) {
      return errorResponse("Customer not found", 404);
    }

    let openingBalance = 0;
    if (startDate) {
      const [invoiceTotals, receiptTotals, creditTotals, writeOffTotals] = await Promise.all([
        prisma.salesInvoice.aggregate({
          where: {
            companyId: session.user.companyId,
            customerId,
            status: { in: ["ISSUED", "PAID"] },
            invoiceDate: { lt: startDate },
          },
          _sum: { total: true },
        }),
        prisma.salesReceipt.aggregate({
          where: {
            invoice: { customerId, companyId: session.user.companyId },
            receivedAt: { lt: startDate },
          },
          _sum: { amount: true },
        }),
        prisma.creditNote.aggregate({
          where: {
            invoice: { customerId, companyId: session.user.companyId },
            status: "ISSUED",
            noteDate: { lt: startDate },
          },
          _sum: { total: true },
        }),
        prisma.salesWriteOff.aggregate({
          where: {
            invoice: { customerId, companyId: session.user.companyId },
            status: "POSTED",
            createdAt: { lt: startDate },
          },
          _sum: { amount: true },
        }),
      ]);

      openingBalance =
        toMoney(invoiceTotals._sum.total) -
        toMoney(receiptTotals._sum.amount) -
        toMoney(creditTotals._sum.total) -
        toMoney(writeOffTotals._sum.amount);
    }

    const dateFilter = buildDateFilter(startDate, endDate);

    const [invoices, receipts, creditNotes, writeOffs] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: {
          companyId: session.user.companyId,
          customerId,
          status: { in: ["ISSUED", "PAID"] },
          ...(dateFilter ? { invoiceDate: dateFilter } : {}),
        },
        select: { invoiceDate: true, invoiceNumber: true, total: true },
      }),
      prisma.salesReceipt.findMany({
        where: {
          invoice: { customerId, companyId: session.user.companyId },
          ...(dateFilter ? { receivedAt: dateFilter } : {}),
        },
        select: { receivedAt: true, receiptNumber: true, amount: true, method: true },
      }),
      prisma.creditNote.findMany({
        where: {
          invoice: { customerId, companyId: session.user.companyId },
          status: "ISSUED",
          ...(dateFilter ? { noteDate: dateFilter } : {}),
        },
        select: { noteDate: true, noteNumber: true, total: true, reason: true },
      }),
      prisma.salesWriteOff.findMany({
        where: {
          invoice: { customerId, companyId: session.user.companyId },
          status: "POSTED",
          ...(dateFilter ? { createdAt: dateFilter } : {}),
        },
        select: { createdAt: true, amount: true, reason: true },
      }),
    ]);

    const lines: StatementLine[] = [
      ...invoices.map((invoice) => ({
        date: invoice.invoiceDate.toISOString(),
        type: "Invoice",
        reference: invoice.invoiceNumber,
        description: "Sales invoice",
        debit: toMoney(invoice.total),
        credit: 0,
      })),
      ...receipts.map((receipt) => ({
        date: receipt.receivedAt.toISOString(),
        type: "Receipt",
        reference: receipt.receiptNumber,
        description: receipt.method,
        debit: 0,
        credit: toMoney(receipt.amount),
      })),
      ...creditNotes.map((note) => ({
        date: note.noteDate.toISOString(),
        type: "Credit Note",
        reference: note.noteNumber,
        description: note.reason,
        debit: 0,
        credit: toMoney(note.total),
      })),
      ...writeOffs.map((writeOff) => ({
        date: writeOff.createdAt.toISOString(),
        type: "Write-off",
        reference: "Write-off",
        description: writeOff.reason,
        debit: 0,
        credit: toMoney(writeOff.amount),
      })),
    ];

    lines.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBalance = openingBalance;
    const detailedLines = lines.map((line) => {
      runningBalance += line.debit - line.credit;
      return { ...line, balance: runningBalance };
    });

    return successResponse({
      openingBalance,
      closingBalance: runningBalance,
      lines: detailedLines,
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/customer-statement error:", error);
    return errorResponse("Failed to fetch customer statement");
  }
}
