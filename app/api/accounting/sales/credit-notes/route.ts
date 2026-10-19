import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { creditNoteSchema, CreditNoteRefused, createSalesCreditNote } from "@/lib/accounting/credit-notes";
import { guardBooks } from "@/lib/books/core";

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get("invoiceId");
    const status = searchParams.get("status");
    const { page, limit, skip } = getPaginationParams(request);

    const where: Record<string, unknown> = { companyId: session.user.companyId };
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;

    const [notes, total] = await Promise.all([
      prisma.creditNote.findMany({
        where,
        include: {
          invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
          lines: true,
        },
        orderBy: [{ noteDate: "desc" }],
        skip,
        take: limit,
      }),
      prisma.creditNote.count({ where }),
    ]);

    return successResponse(paginationResponse(notes, total, page, limit));
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/credit-notes error:", error);
    return errorResponse("Failed to fetch credit notes");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const validated = creditNoteSchema.parse(await request.json());
    const { refused } = await guardBooks(session, "note.issue", { kind: "credit-note" });
    if (refused) return refused;
    const creditNote = await createSalesCreditNote({ companyId: session.user.companyId, userId: session.user.id }, validated);
    return successResponse(creditNote, 201);
  } catch (error) {
    if (error instanceof CreditNoteRefused) return errorResponse(error.message, error.status, error.details);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/accounting/sales/credit-notes error:", error);
    return errorResponse("Failed to create credit note");
  }
}
