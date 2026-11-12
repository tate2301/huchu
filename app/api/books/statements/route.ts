import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { readCustomer, mainCurrency } from "@/lib/books/customers";
import { dayOf } from "@/lib/books/format";
import { invoiceBalance } from "@/lib/books/invoice-state";
import { getDocumentBranding } from "@/lib/documents/branding-snapshot";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;

    const searchParams = new URL(request.url).searchParams;
    const rawCustomers = searchParams.get("customers") || searchParams.get("id");
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    const customerIds = (rawCustomers ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 50);

    const [branding, currency] = await Promise.all([
      getDocumentBranding(companyId),
      mainCurrency(prisma, companyId),
    ]);

    // If specific customers requested, return their rich statements
    if (customerIds.length > 0) {
      const statements = await Promise.all(
        customerIds.map(async (id) => {
          const detail = await readCustomer(prisma, companyId, id, { from, to });
          if (!detail) return null;
          const customerDoc = await prisma.customer.findUnique({
            where: { id },
            select: { code: true, whatsapp: true },
          });

          // Fetch open invoices with detailed balances for this customer
          const openInvoices = await prisma.salesInvoice.findMany({
            where: { companyId, customerId: id, status: "ISSUED" },
            select: {
              id: true,
              invoiceNumber: true,
              invoiceDate: true,
              dueDate: true,
              total: true,
              amountPaid: true,
              creditTotal: true,
              writeOffTotal: true,
              currency: true,
            },
            orderBy: { invoiceDate: "asc" },
          });

          const outstandingLines = openInvoices
            .map((inv) => ({
              id: inv.id,
              number: inv.invoiceNumber,
              date: inv.invoiceDate.toISOString().slice(0, 10),
              dueDate: inv.dueDate ? inv.dueDate.toISOString().slice(0, 10) : null,
              total: inv.total,
              balance: invoiceBalance(inv),
              currency: inv.currency,
            }))
            .filter((inv) => inv.balance > 0.005);

          return {
            id: detail.id,
            name: detail.name,
            code: customerDoc?.code ?? detail.id.slice(0, 8).toUpperCase(),
            contact: detail.contact,
            tax: detail.tax,
            whatsapp: customerDoc?.whatsapp ?? detail.contact.phone,
            currency: detail.currency,
            statement: detail.statement,
            ages: detail.ages,
            tiles: detail.tiles,
            outstandingLines,
          };
        }),
      );

      const valid = statements.filter((s): s is NonNullable<typeof s> => Boolean(s));

      return successResponse({
        mode: "statement",
        branding: {
          displayName: branding.displayName,
          legalName: branding.legalName,
          tradingName: branding.tradingName,
          registrationNumber: branding.registrationNumber,
          taxNumber: branding.taxNumber,
          vatNumber: branding.vatNumber,
          email: branding.email,
          phone: branding.phone,
          physicalAddress: branding.physicalAddress,
          logoUrl: branding.logoUrl,
          primaryColor: branding.primaryColor,
          bankAccounts: branding.bankAccounts,
        },
        asOf: dayOf(new Date()),
        statements: valid,
      });
    }

    // No customer selected: Return customers overview with balances
    const [customers, invoices, receipts] = await Promise.all([
      prisma.customer.findMany({
        where: { companyId, isActive: true, mergedIntoId: null },
        select: {
          id: true,
          name: true,
          code: true,
          contactName: true,
          email: true,
          phone: true,
          whatsapp: true,
          address: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.salesInvoice.findMany({
        where: { companyId, status: "ISSUED" },
        select: {
          customerId: true,
          invoiceDate: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          creditTotal: true,
          writeOffTotal: true,
          currency: true,
        },
      }),
      prisma.salesReceipt.groupBy({
        by: ["customerId"],
        where: { companyId, voidedAt: null, customerId: { not: null } },
        _max: { receivedAt: true },
      }),
    ]);

    const receiptMap = new Map<string, Date>();
    for (const r of receipts) {
      if (r.customerId && r._max.receivedAt) {
        receiptMap.set(r.customerId, r._max.receivedAt);
      }
    }

    const todayStr = dayOf(new Date());
    const customerMap = new Map<
      string,
      {
        balance: number;
        overdue: number;
        openCount: number;
        oldestDate: string | null;
      }
    >();

    for (const inv of invoices) {
      const bal = invoiceBalance(inv);
      if (bal <= 0.005) continue;

      const existing = customerMap.get(inv.customerId) ?? {
        balance: 0,
        overdue: 0,
        openCount: 0,
        oldestDate: null,
      };

      existing.balance += bal;
      existing.openCount += 1;

      const invDate = inv.invoiceDate.toISOString().slice(0, 10);
      if (!existing.oldestDate || invDate < existing.oldestDate) {
        existing.oldestDate = invDate;
      }

      if (inv.dueDate) {
        const dueDateStr = inv.dueDate.toISOString().slice(0, 10);
        if (dueDateStr < todayStr) {
          existing.overdue += bal;
        }
      }

      customerMap.set(inv.customerId, existing);
    }

    let totalReceivables = 0;
    let totalOverdue = 0;
    let customersWithBalanceCount = 0;

    const rows = customers.map((c) => {
      const pos = customerMap.get(c.id) ?? {
        balance: 0,
        overdue: 0,
        openCount: 0,
        oldestDate: null,
      };

      if (pos.balance > 0.005) {
        totalReceivables += pos.balance;
        customersWithBalanceCount += 1;
      }
      if (pos.overdue > 0.005) {
        totalOverdue += pos.overdue;
      }

      return {
        id: c.id,
        name: c.name,
        code: c.code ?? c.id.slice(0, 8).toUpperCase(),
        contactName: c.contactName,
        email: c.email,
        phone: c.phone,
        whatsapp: c.whatsapp ?? c.phone,
        address: c.address,
        balance: Math.round(pos.balance * 100) / 100,
        overdue: Math.round(pos.overdue * 100) / 100,
        openCount: pos.openCount,
        oldestDate: pos.oldestDate,
        lastPaid: receiptMap.get(c.id)?.toISOString().slice(0, 10) ?? null,
      };
    });

    return successResponse({
      mode: "overview",
      currency,
      asOf: todayStr,
      summary: {
        totalReceivables: Math.round(totalReceivables * 100) / 100,
        totalOverdue: Math.round(totalOverdue * 100) / 100,
        customersWithBalance: customersWithBalanceCount,
        totalCustomers: customers.length,
      },
      customers: rows,
    });
  } catch (error) {
    console.error("[API] GET /api/books/statements error:", error);
    return errorResponse("Failed to load statements", 500);
  }
}
