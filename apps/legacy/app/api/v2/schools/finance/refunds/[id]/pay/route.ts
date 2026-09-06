import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { resolveBaseCurrency, toNumberOrZero } from "@/lib/schools/money";
import {
  emitSchoolFeeAccountingEvent,
  FeeCreditError,
} from "../../../../fees/_helpers";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * S-2.6 — hand the money over.
 *
 * The credit was held when the refund was requested, so this step takes nothing
 * further from the family's account: it records that the money left, and posts
 * the ledger entry for it.
 *
 * The posting is the receipt's entry backwards — cash out, the family's credit
 * balance extinguished — which is why `invertDirection` is set. See the seam
 * note on `toPostingSourceType` in `app/api/v2/schools/fees/_helpers.ts`: the
 * accounts are right, the source *type* is borrowed from `SALES_RECEIPT` until
 * S-2.3 gives school money its own.
 */
const schema = z.object({
  paidOn: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
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

    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body ?? {});
    const paidAt = validated.paidOn ? new Date(validated.paidOn) : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return errorResponse("Invalid payment date", 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const refund = await tx.schoolFeeRefund.findFirst({
        where: { id, companyId },
        select: { id: true, refundNo: true, status: true },
      });
      if (!refund) throw new FeeCreditError("Refund not found", 404);
      if (refund.status === "PAID") {
        throw new FeeCreditError(
          `Refund ${refund.refundNo} has already been paid`,
          409,
        );
      }
      if (refund.status !== "REQUESTED") {
        throw new FeeCreditError(
          `Refund ${refund.refundNo} was cancelled and cannot be paid`,
          409,
        );
      }

      const paid = await tx.schoolFeeRefund.update({
        where: { id },
        data: {
          status: "PAID",
          paidAt,
          paidById: session.user.id,
          ...(validated.reference !== undefined
            ? { reference: validated.reference }
            : {}),
          ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
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
        eventType: "schools.fee.refund.paid",
        entityType: "SchoolFeeRefund",
        entityId: paid.id,
        reason: paid.reason,
        payload: {
          refundNo: paid.refundNo,
          studentId: paid.studentId,
          currency: paid.currency,
          amount: toNumberOrZero(paid.amount),
          baseAmount: toNumberOrZero(paid.baseAmount),
          method: paid.method,
          reference: paid.reference,
          sourceReceiptNo: paid.receipt?.receiptNo ?? null,
          sourceInvoiceNo: paid.invoice?.invoiceNo ?? null,
        },
      });

      return paid;
    });

    const baseCurrency = await resolveBaseCurrency(companyId);
    const accounting = await emitSchoolFeeAccountingEvent({
      actorRole: session.user.role,
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_REFUND_PAID",
      sourceId: result.id,
      sourceRef: result.refundNo,
      entryDate: result.paidAt ?? paidAt,
      // S-2.2: the ledger takes the base-currency figure, converted at the rate
      // the source document carried rather than today's.
      amount: result.baseAmount,
      netAmount: result.baseAmount,
      taxAmount: 0,
      grossAmount: result.baseAmount,
      currency: baseCurrency,
      documentCurrency: result.currency,
      documentAmount: result.amount,
      exchangeRate: result.exchangeRate,
      // S-2.3. `SCHOOL_FEE_REFUND` is its own kind now, with a rule written in
      // the direction a refund actually runs — CR bank, DR whichever account
      // was holding the credit. It is no longer a receipt inverted, so nothing
      // is inverted here. Which account that is depends on where the credit
      // came from: a receipt surplus sits in Fees Received In Advance, an
      // over-settled invoice sits as a credit balance in the receivable.
      creditSource: result.receiptId ? "RECEIPT" : "INVOICE",
      payload: {
        refundNo: result.refundNo,
        studentId: result.studentId,
        reason: result.reason,
        method: result.method,
        sourceReceiptId: result.receiptId,
        sourceInvoiceId: result.invoiceId,
      },
    }).catch((error) => {
      console.error("[Accounting] School fee refund posting failed:", error);
      return {
        accountingStatus: "FAILED" as const,
        journalEntryId: null,
        accountingError:
          error instanceof Error ? error.message : "Accounting posting failed",
      };
    });

    return successResponse({ ...result, accounting });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FeeCreditError) {
      return errorResponse(error.message, error.status);
    }
    console.error("[API] POST /api/v2/schools/finance/refunds/[id]/pay error:", error);
    return errorResponse("Failed to settle refund request");
  }
}
