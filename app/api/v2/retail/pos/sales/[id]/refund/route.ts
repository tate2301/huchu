import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse } from "@/lib/api-utils";
import {
  requireRetailSession,
} from "../../../../_helpers";
import { refundRetailSaleTransaction } from "../../../../_services";

const refundLineSchema = z.object({
  saleLineId: z.string().uuid(),
  quantity: z.number().positive(),
});

const refundPaymentSchema = z.object({
  tenderType: z.enum(["CASH", "CARD", "MOBILE_MONEY", "TRANSFER", "VOUCHER"]),
  amount: z.number().positive(),
  reference: z.string().max(120).optional().nullable(),
});

const refundSchema = z.object({
  shiftId: z.string().uuid(),
  reason: z.string().min(3).max(240),
  periodOverrideReason: z.string().max(500).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  lines: z.array(refundLineSchema).min(1),
  payments: z.array(refundPaymentSchema).min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { response, session } = await requireRetailSession(request);
  if (response || !session) {
    return response as NextResponse;
  }

  try {
    const { id } = await params;
    const body = await request.json();
    const input = refundSchema.parse(body);
    const { sale, accounting } = await refundRetailSaleTransaction({
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
      lines: input.lines,
      payments: input.payments,
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
    return errorResponse(error instanceof Error ? error.message : "Failed to post refund", 400);
  }
}
