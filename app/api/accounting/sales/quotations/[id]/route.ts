import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { QuotationRefused, updateQuotation, updateQuotationSchema } from "@/lib/books/quotations";
import { prisma } from "@/lib/prisma";


export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = await context.params;

    const quotation = await prisma.salesQuotation.findUnique({
      where: { id: params.id },
      include: {
        customer: true,
        lines: true,
      },
    });

    if (!quotation || quotation.companyId !== session.user.companyId) {
      return errorResponse("Quotation not found", 404);
    }

    return successResponse(quotation);
  } catch (error) {
    console.error("[API] GET /api/accounting/sales/quotations/[id] error:", error);
    return errorResponse("Failed to fetch sales quotation");
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const params = await context.params;

    const validated = updateQuotationSchema.parse(await request.json());
    const updated = await updateQuotation({ companyId: session.user.companyId, userId: session.user.id }, params.id, validated);
    return successResponse(updated);
  } catch (error) {
    if (error instanceof QuotationRefused) return errorResponse(error.message, error.status);
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/sales/quotations/[id] error:", error);
    return errorResponse("Failed to update sales quotation");
  }
}
