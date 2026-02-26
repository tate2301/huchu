import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

const updateQuotationSchema = z.object({
  status: z.enum(["DRAFT", "SENT", "ACCEPTED", "EXPIRED", "VOIDED"]).optional(),
  validUntil: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

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

    const body = await request.json();
    const validated = updateQuotationSchema.parse(body);

    const existing = await prisma.salesQuotation.findUnique({
      where: { id: params.id },
      select: { id: true, companyId: true, status: true },
    });

    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("Quotation not found", 404);
    }

    const updated = await prisma.salesQuotation.update({
      where: { id: params.id },
      data: {
        ...(validated.status !== undefined ? { status: validated.status } : {}),
        ...(validated.validUntil !== undefined
          ? { validUntil: validated.validUntil ? new Date(validated.validUntil) : null }
          : {}),
        ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        ...(validated.status === "SENT" || validated.status === "ACCEPTED"
          ? { issuedById: session.user.id, issuedAt: new Date() }
          : {}),
      },
      include: {
        customer: true,
        lines: true,
      },
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/sales/quotations/[id] error:", error);
    return errorResponse("Failed to update sales quotation");
  }
}
