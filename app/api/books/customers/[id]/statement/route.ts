import { NextRequest, NextResponse } from "next/server";

import { errorResponse, validateSession } from "@/lib/api-utils";
import { readCustomer } from "@/lib/books/customers";
import { customerStatementPdf, statementFileName } from "@/lib/books/statement-pdf";
import { attachmentDisposition } from "@/lib/documents/service";
import { prisma } from "@/lib/prisma";

/** The customer's statement for `from`–`to` as a PDF download. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { companyId } = sessionResult.session.user;
    const search = new URL(request.url).searchParams;
    const customer = await readCustomer(prisma, companyId, (await params).id, { from: search.get("from"), to: search.get("to") });
    if (!customer) return errorResponse("There is no such customer in this workspace", 404);
    const pdf = await customerStatementPdf(companyId, customer);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": attachmentDisposition(statementFileName(customer)), "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[API] GET /api/books/customers/[id]/statement error:", error);
    return errorResponse("Could not make the statement");
  }
}
