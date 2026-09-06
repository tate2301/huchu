import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { toNumberOrZero } from "@/lib/schools/money";
import {
  FeeCreditError,
  isFeeCreditCheckViolation,
  lockFeeInvoices,
  lockFeeReceipt,
} from "../../../../fees/_helpers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * S-2.6 — call off a refund that has not been paid.
 *
 * Requesting a refund holds the credit, so without this a bursar who typed the
 * wrong figure would have locked that money out of use permanently: it could
 * not be allocated to the next invoice, and it could not be refunded properly
 * either. Cancelling releases the hold and puts the credit back where it was.
 *
 * A paid refund is not cancellable. The money is gone; the correction for that
 * is a fresh receipt, not an edit to the record of it leaving.
 */
const schema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "refund");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const body = await request.json();
    const validated = schema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const refund = await tx.schoolFeeRefund.findFirst({
        where: { id, companyId },
        select: {
          id: true,
          refundNo: true,
          status: true,
          amount: true,
          currency: true,
          studentId: true,
          receiptId: true,
          invoiceId: true,
          notes: true,
        },
      });
      if (!refund) throw new FeeCreditError("Refund not found", 404);
      if (refund.status === "PAID") {
        throw new FeeCreditError(
          `Refund ${refund.refundNo} has been paid and cannot be cancelled`,
          409,
        );
      }
      if (refund.status === "CANCELLED") {
        throw new FeeCreditError(
          `Refund ${refund.refundNo} is already cancelled`,
          409,
        );
      }

      // Release the hold on whichever source it was taken from. The CHECK
      // constraints bound `refundedAmount` from above; `decrement` past zero is
      // caught by the same constraints from below.
      if (refund.receiptId) {
        await lockFeeReceipt(tx, { companyId, receiptId: refund.receiptId });
        await tx.schoolFeeReceipt.update({
          where: { id: refund.receiptId },
          data: { refundedAmount: { decrement: refund.amount } },
        });
      } else if (refund.invoiceId) {
        await lockFeeInvoices(tx, { companyId, invoiceIds: [refund.invoiceId] });
        await tx.schoolFeeInvoice.update({
          where: { id: refund.invoiceId },
          data: { refundedAmount: { decrement: refund.amount } },
        });
      }

      const cancelled = await tx.schoolFeeRefund.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledById: session.user.id,
          notes: refund.notes
            ? `${refund.notes}\nCancelled: ${validated.reason}`
            : `Cancelled: ${validated.reason}`,
        },
        include: {
          student: {
            select: { id: true, studentNo: true, firstName: true, lastName: true },
          },
          receipt: { select: { id: true, receiptNo: true } },
          invoice: { select: { id: true, invoiceNo: true } },
        },
      });

      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.refund.cancelled",
        entityType: "SchoolFeeRefund",
        entityId: cancelled.id,
        reason: validated.reason,
        payload: {
          refundNo: cancelled.refundNo,
          studentId: cancelled.studentId,
          currency: cancelled.currency,
          amountReleased: toNumberOrZero(cancelled.amount),
          sourceReceiptId: cancelled.receiptId,
          sourceInvoiceId: cancelled.invoiceId,
        },
      });

      return cancelled;
    });

    return successResponse(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FeeCreditError) {
      return errorResponse(error.message, error.status);
    }
    if (isFeeCreditCheckViolation(error)) {
      return errorResponse("That refund's credit no longer adds up", 409);
    }
    console.error(
      "[API] POST /api/v2/schools/finance/refunds/[id]/cancel error:",
      error,
    );
    return errorResponse("Failed to cancel the refund");
  }
}
