import { NextRequest, NextResponse } from "next/server";
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const DAY_MS = 1000 * 60 * 60 * 24;

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const asOfParam = searchParams.get("asOf");
    const asOf = asOfParam ? new Date(asOfParam) : new Date();

    const entries = await prisma.paymentLedgerEntry.findMany({
      where: {
        companyId: session.user.companyId,
        accountType: "RECEIVABLE",
        status: "POSTED",
        entryDate: { lte: asOf },
      },
      orderBy: [{ entryDate: "desc" }],
    });

    if (entries.length === 0) {
      const invoices = await prisma.salesInvoice.findMany({
        where: {
          companyId: session.user.companyId,
          status: { in: ["ISSUED", "PAID"] },
        },
        include: { customer: true },
        orderBy: [{ invoiceDate: "desc" }],
      });

      const rowsByCustomer = new Map<
        string,
        { id: string; name: string; current: number; days30: number; days60: number; days90: number; days90Plus: number; total: number }
      >();

      invoices.forEach((invoice) => {
        const balance =
          invoice.total - (invoice.amountPaid ?? 0) - (invoice.creditTotal ?? 0) - (invoice.writeOffTotal ?? 0);
        if (balance <= 0) return;

        const dueDate = invoice.dueDate ?? invoice.invoiceDate;
        const daysPastDue = Math.floor((asOf.getTime() - dueDate.getTime()) / DAY_MS);

        const row =
          rowsByCustomer.get(invoice.customerId) ?? {
            id: invoice.customerId,
            name: invoice.customer?.name ?? "Unknown",
            current: 0,
            days30: 0,
            days60: 0,
            days90: 0,
            days90Plus: 0,
            total: 0,
          };

        if (daysPastDue <= 0) row.current += balance;
        else if (daysPastDue <= 30) row.days30 += balance;
        else if (daysPastDue <= 60) row.days60 += balance;
        else if (daysPastDue <= 90) row.days90 += balance;
        else row.days90Plus += balance;

        row.total += balance;
        rowsByCustomer.set(invoice.customerId, row);
      });

      return successResponse({
        asOf: asOf.toISOString(),
        rows: Array.from(rowsByCustomer.values()),
      });
    }

    const rowsByCustomer = new Map<
      string,
      { id: string; name: string; current: number; days30: number; days60: number; days90: number; days90Plus: number; total: number }
    >();

    const customerIds = Array.from(
      new Set(entries.map((entry) => entry.partyId).filter((value): value is string => Boolean(value))),
    );
    const customers = customerIds.length
      ? await prisma.customer.findMany({
          where: { id: { in: customerIds } },
          select: { id: true, name: true },
        })
      : [];
    const customerNameMap = new Map(customers.map((customer) => [customer.id, customer.name]));

    entries.forEach((entry) => {
      const customerId = entry.partyId;
      if (!customerId) return;
      const signedAmount = entry.debit - entry.credit;
      if (signedAmount === 0) return;
      const daysPastDue = Math.floor((asOf.getTime() - entry.entryDate.getTime()) / DAY_MS);

      const row =
        rowsByCustomer.get(customerId) ?? {
          id: customerId,
          name: customerNameMap.get(customerId) ?? "Unknown",
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          days90Plus: 0,
          total: 0,
        };

      if (daysPastDue <= 0) row.current += signedAmount;
      else if (daysPastDue <= 30) row.days30 += signedAmount;
      else if (daysPastDue <= 60) row.days60 += signedAmount;
      else if (daysPastDue <= 90) row.days90 += signedAmount;
      else row.days90Plus += signedAmount;

      row.total += signedAmount;
      rowsByCustomer.set(customerId, row);
    });

    return successResponse({
      asOf: asOf.toISOString(),
      rows: Array.from(rowsByCustomer.values()),
    });
  } catch (error) {
    console.error("[API] GET /api/accounting/reports/ar-aging error:", error);
    return errorResponse("Failed to fetch AR aging");
  }
}
