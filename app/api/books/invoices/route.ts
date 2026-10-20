import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { ReceiptRefused } from "@/lib/accounting/payments";
import { booksActor, canDo, guardBooks } from "@/lib/books/core";
import { InvoiceRefused } from "@/lib/books/create-invoice";
import { booksInvoiceSchema, createBooksInvoice } from "@/lib/books/invoice-create";
import { invoicesCsv, readInvoiceQuery, readInvoices } from "@/lib/books/invoices";
import { isWorkspaceOwner } from "@/lib/books/owner";
import { prisma } from "@/lib/prisma";

/** Books → Invoices, filtered and paged; `format=csv` is Export, every page. */
export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const params = new URL(request.url).searchParams;
    const query = readInvoiceQuery(params);
    if (params.get("format") === "csv") {
      return new NextResponse(await invoicesCsv(prisma, companyId, query), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="invoices.csv"',
        },
      });
    }
    // What the selection bar offers this person, from the one matrix (books-final §2.2).
    const actor = await booksActor(session);
    const can = {
      deleteDrafts: canDo(actor, "draft.delete", { kind: "invoice" }).allowed,
      issue: canDo(actor, "issue", { kind: "invoice" }).allowed,
      owner: isWorkspaceOwner(session.user.role),
    };
    return successResponse({ ...(await readInvoices(prisma, companyId, query)), can });
  } catch (error) {
    console.error("[API] GET /api/books/invoices error:", error);
    return errorResponse("Could not read the invoices");
  }
}

/** Books' New invoice: a draft, or issued through the core; paid now records the payment with it. */
export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const input = booksInvoiceSchema.parse(await request.json());
    const { actor, refused } = await guardBooks(session, input.issueNow ? "issue" : "draft.create", { kind: "invoice" });
    if (refused) return refused;
    return successResponse(await createBooksInvoice(actor, input), 201);
  } catch (error) {
    if (error instanceof z.ZodError) return errorResponse("Check the invoice: something in it is not filled in right.", 400, error.issues);
    if (error instanceof InvoiceRefused) return errorResponse(error.message, 400, error.details);
    if (error instanceof ReceiptRefused) return errorResponse(error.message, error.status);
    console.error("[API] POST /api/books/invoices error:", error);
    return errorResponse("Could not save the invoice");
  }
}
