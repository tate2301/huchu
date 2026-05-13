import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  requireRetailPos,
  requireRetailSession,
} from "../../../../_helpers";
import { voidRetailSaleTransaction } from "../../../../_services";

const voidSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  const gate = requireRetailPos(session);
  if (gate) return gate;

  try {
    const { id } = await params;
    const body = await request.json();
    const input = voidSchema.parse(body);
    const { sale, accounting } = await voidRetailSaleTransaction({
      actor: {
        companyId: session.user.companyId,
        userId: session.user.id,
        userRole: session.user.role,
        userName: session.user.name,
        userEmail: session.user.email,
      },
      saleId: id,
      shiftId: input.shiftId,
      reason: input.reason,
      notes: input.notes ?? null,
      periodOverrideReason: input.periodOverrideReason ?? null,
    });

    return successResponse({
      id: sale.id,
      saleNo: sale.saleNo,
      saleType: sale.saleType,
      status: sale.status,
      shiftId: sale.shiftId,
      siteId: sale.siteId,
      sourceSaleId: sale.sourceSaleId,
      totalAmount: sale.totalAmount,
      tenderedAmount: sale.tenderedAmount,
      postedAt: sale.postedAt ?? sale.createdAt,
      lines: sale.lines,
      payments: sale.payments,
      overrideReason: sale.overrideReason,
      notes: sale.notes,
      accountingStatus: accounting.accountingStatus,
      accountingError: accounting.accountingError,
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    return errorResponse(error instanceof Error ? error.message : "Failed to void sale", 400);
  }
}
