import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { moneyLimits } from "@/lib/books/core/approvals";
import { readFormOptions } from "@/lib/books/form-options";
import { openBillsFor } from "@/lib/books/payment-out-create";
import { openInvoicesFor } from "@/lib/books/payment-create";
import { prisma } from "@/lib/prisma";

const FORMS = {
  invoice: { parties: "customers", series: "invoice" },
  payment: { parties: "customers", series: "receipt" },
  bill: { parties: "suppliers", series: "bill" },
  "payment-out": { parties: "suppliers", series: "payment" },
  claim: { parties: "suppliers", series: "claim" },
} as const;

/**
 * What a Books form chooses from: `for=invoice|payment|bill|payment-out`.
 * `quote=<id>` adds the quotation an invoice is being made from, with its lines;
 * `customer=<id>` adds that customer's open invoices (Record a payment).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const companyId = sessionResult.session.user.companyId;
    const params = new URL(request.url).searchParams;
    const form = FORMS[(params.get("for") ?? "") as keyof typeof FORMS];
    if (!form) return errorResponse("Say which form: invoice, payment, bill or payment-out.", 400);
    const options = await readFormOptions(prisma, companyId, form.parties, form.series);
    const quoteId = params.get("quote");
    const quote = quoteId
      ? await prisma.salesQuotation.findFirst({
          where: { id: quoteId, companyId },
          select: { id: true, quotationNumber: true, customerId: true, currency: true, notes: true, lines: { select: { description: true, quantity: true, unitPrice: true, taxCodeId: true } } },
        })
      : null;
    // Record a payment: the customer's open invoices, to put the money on.
    const customerId = params.get("customer");
    const openInvoices = customerId && /^[0-9a-f-]{36}$/i.test(customerId) ? await openInvoicesFor(companyId, customerId) : [];
    // Pay a supplier: the supplier's open bills.
    const vendorId = params.get("supplier");
    const openBills = vendorId && /^[0-9a-f-]{36}$/i.test(vendorId) ? await openBillsFor(companyId, vendorId) : [];
    // Bills and supplier payments over this wait for the owner (books-final §2.4): the forms say so before it is pressed.
    const limits = form.parties === "suppliers" ? await moneyLimits(companyId) : null;
    const approval = limits ? { limit: limits.paymentOwnerOver, orderLimit: limits.requisitionOwnerOver, owner: limits.ownerApprover?.name ?? null } : null;
    // Snap a slip: the floats it can be spent from, and the jobs it can be for.
    const claim =
      params.get("for") === "claim"
        ? {
            floats: await prisma.bankAccount.findMany({ where: { companyId, isFloat: true, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, currency: true, holderId: true } }),
            projects: await prisma.crmProject.findMany({ where: { companyId, status: { in: ["ACTIVE", "PLANNING"] } }, orderBy: { name: "asc" }, take: 200, select: { id: true, name: true } }).catch(() => []),
          }
        : null;
    return successResponse({ ...options, quote, openInvoices, openBills, approval, ...(claim ?? {}) });
  } catch (error) {
    console.error("[API] GET /api/books/forms error:", error);
    return errorResponse("Could not read what the form needs");
  }
}
