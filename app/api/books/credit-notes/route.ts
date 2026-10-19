import { NextRequest, NextResponse } from "next/server";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { booksActor, canDo } from "@/lib/books/core";
import { readCreditNotes } from "@/lib/books/credit-notes";
import { readCreditQuery } from "@/lib/books/credit-notes-view";
import { invoiceBalance } from "@/lib/books/invoice-state";
import { prisma } from "@/lib/prisma";

/**
 * Books → Credit notes and write-offs, with what this person may do here and
 * the invoices a new one can be against (issued, with something left on them).
 */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const [view, actor, open] = await Promise.all([
      readCreditNotes(prisma, companyId, readCreditQuery(new URL(request.url).searchParams)),
      booksActor(session),
      prisma.salesInvoice.findMany({
        where: { companyId, status: { in: ["ISSUED", "PAID"] } },
        orderBy: { invoiceDate: "desc" },
        take: 300,
        select: { id: true, invoiceNumber: true, currency: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, status: true, customer: { select: { name: true } }, lines: { take: 1, select: { taxRate: true } }, fiscalReceipt: { select: { status: true } } },
      }),
    ]);
    const targets = open
      .map((invoice) => ({
        id: invoice.id,
        number: invoice.invoiceNumber ?? "Draft",
        customer: invoice.customer.name,
        currency: invoice.currency,
        creditLeft: Math.round((invoice.total - invoice.creditTotal - invoice.writeOffTotal) * 100) / 100,
        balance: invoice.status === "ISSUED" ? invoiceBalance(invoice) : 0,
        taxRate: invoice.lines[0]?.taxRate ?? 0,
        fiscalised: invoice.fiscalReceipt?.status === "SUCCESS",
      }))
      .filter((invoice) => invoice.creditLeft > 0.005);
    return successResponse({
      ...view,
      targets,
      can: {
        credit: canDo(actor, "note.issue", { kind: "credit-note" }).allowed,
        writeOff: canDo(actor, "write-off", { kind: "write-off" }).allowed,
        voidWriteOff: canDo(actor, "void", { kind: "write-off" }).allowed,
      },
    });
  } catch (error) {
    console.error("[API] GET /api/books/credit-notes error:", error);
    return errorResponse("Could not read the credit notes");
  }
}
