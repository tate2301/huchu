import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { emitSchoolFeeAccountingEvent, refreshFeeInvoiceBalance } from "../../../_helpers";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  issueDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.schoolFeeInvoice.findFirst({
        where: { id, companyId },
        include: { feeStructure: { select: { currency: true } } },
      });
      if (!existing) return null;
      if (existing.status === "VOIDED" || existing.status === "WRITEOFF") {
        throw new Error("Cannot issue a voided or written-off invoice");
      }
      if (existing.status === "ISSUED" || existing.status === "PART_PAID" || existing.status === "PAID") {
        return existing;
      }

      const issueDate = validated.issueDate ? new Date(validated.issueDate) : existing.issueDate;
      if (Number.isNaN(issueDate.getTime())) {
        throw new Error("Invalid issue date");
      }

      const refreshed = await refreshFeeInvoiceBalance(tx, {
        companyId,
        invoiceId: existing.id,
      });
      if (!refreshed) throw new Error("Failed to refresh fee invoice totals");
      if (refreshed.totalAmount <= 0) {
        throw new Error("Cannot issue an invoice with zero amount");
      }

      return tx.schoolFeeInvoice.update({
        where: { id: existing.id },
        data: {
          issueDate,
          status: refreshed.balanceAmount <= 0 ? "PAID" : "ISSUED",
          issuedById: session.user.id,
          issuedAt: new Date(),
        },
        include: {
          feeStructure: { select: { currency: true } },
        },
      });
    });

    if (!updated) return errorResponse("Fee invoice not found", 404);

    if (updated.status === "ISSUED") {
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_INVOICE_ISSUED",
        sourceId: updated.id,
        sourceRef: updated.invoiceNo,
        entryDate: updated.issueDate,
        amount: updated.totalAmount,
        netAmount: updated.subTotal,
        taxAmount: updated.taxTotal,
        grossAmount: updated.totalAmount,
        currency: updated.feeStructure?.currency ?? "USD",
        payload: {
          invoiceNo: updated.invoiceNo,
          studentId: updated.studentId,
          termId: updated.termId,
          status: updated.status,
        },
      }).catch((error) => {
        console.error("[Accounting] School fee invoice issue event capture failed:", error);
      });
    }

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    const message = error instanceof Error ? error.message : "Failed to issue fee invoice";
    if (
      message === "Cannot issue a voided or written-off invoice" ||
      message === "Cannot issue an invoice with zero amount" ||
      message === "Invalid issue date"
    ) {
      return errorResponse(message, 400);
    }
    console.error("[API] POST /api/v2/schools/fees/invoices/[id]/issue error:", error);
    return errorResponse("Failed to issue fee invoice");
  }
}
