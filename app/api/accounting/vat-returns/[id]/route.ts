import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { createOrRefreshVatReturnDraft, parseVatReturnPayload } from "@/lib/accounting/vat-return";

const patchSchema = z.object({
  notes: z.string().max(2000).optional(),
  adjustmentsTax: z.number().optional(),
  filingCategory: z.string().max(80).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const vatReturn = await prisma.vatReturn.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!vatReturn || vatReturn.companyId !== session.user.companyId) {
      return errorResponse("VAT return not found", 404);
    }

    return successResponse(parseVatReturnPayload(vatReturn));
  } catch (error) {
    console.error("[API] GET /api/accounting/vat-returns/[id] error:", error);
    return errorResponse("Failed to fetch VAT return");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    const body = await request.json();
    const validated = patchSchema.parse(body);

    const existing = await prisma.vatReturn.findUnique({
      where: { id },
      select: { id: true, companyId: true, status: true, periodStart: true, periodEnd: true },
    });
    if (!existing || existing.companyId !== session.user.companyId) {
      return errorResponse("VAT return not found", 404);
    }
    if (!["DRAFT", "REVIEWED"].includes(existing.status)) {
      return errorResponse("Only draft/reviewed VAT returns can be edited", 400);
    }

    const refreshed = await createOrRefreshVatReturnDraft({
      companyId: session.user.companyId,
      periodStart: existing.periodStart,
      periodEnd: existing.periodEnd,
      preparedById: session.user.id,
      notes: validated.notes,
      adjustmentsTax: validated.adjustmentsTax,
      filingCategory: validated.filingCategory,
    });

    return successResponse(parseVatReturnPayload(refreshed));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/accounting/vat-returns/[id] error:", error);
    return errorResponse(error instanceof Error ? error.message : "Failed to update VAT return");
  }
}
