import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import {
  apportionBase,
  money,
  resolveBaseCurrency,
  toNumberOrZero,
} from "@/lib/schools/money";
import {
  emitSchoolFeeAccountingEvent,
  refreshFeeInvoiceBalance,
} from "../../../_helpers";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "void");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;
    const body = await request.json();
    const validated = schema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const receipt = await tx.schoolFeeReceipt.findFirst({
        where: { id, companyId },
        include: {
          allocations: {
            select: { invoiceId: true, allocatedAmount: true },
          },
        },
      });
      if (!receipt) return null;
      if (receipt.status === "VOIDED") return receipt;
      if (receipt.status !== "POSTED") {
        throw new Error("Only posted receipts can be voided");
      }
      // S-2.6. Voiding reverses the whole receipt in the ledger. If part of it
      // has already gone back to the parent as a refund, that reversal would
      // count the same money out twice — so the refund has to be dealt with
      // first, one way or the other.
      if (money(receipt.refundedAmount).greaterThan(0)) {
        throw new Error("REFUND_ON_RECEIPT");
      }

      const updated = await tx.schoolFeeReceipt.update({
        where: { id: receipt.id },
        data: {
          status: "VOIDED",
          notes: receipt.notes
            ? `${receipt.notes}\nVoid reason: ${validated.reason}`
            : `Void reason: ${validated.reason}`,
          voidedById: session.user.id,
          voidedAt: new Date(),
        },
        include: {
          allocations: {
            select: { invoiceId: true, allocatedAmount: true },
          },
        },
      });

      for (const allocation of updated.allocations) {
        await refreshFeeInvoiceBalance(tx, {
          companyId,
          invoiceId: allocation.invoiceId,
        });
      }

      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.receipt.voided",
        entityType: "SchoolFeeReceipt",
        entityId: updated.id,
        reason: validated.reason,
        payload: {
          receiptNo: updated.receiptNo,
          studentId: updated.studentId,
          currency: updated.currency,
          amountReceived: toNumberOrZero(updated.amountReceived),
          allocationCount: updated.allocations.length,
        },
      });

      return updated;
    });

    if (!result) return errorResponse("Fee receipt not found", 404);

    // The reversal must undo exactly what the receipt posted, so it uses the
    // rate stamped on the receipt rather than today's.
    const baseCurrency = await resolveBaseCurrency(companyId);

    // The split is read *now*, not as it stood when the receipt was written.
    // Credit allocated since then has already moved from Fees Received In
    // Advance into the receivable under its own entry, so reversing today's
    // split is what returns every account to where it started.
    const receivedInBase = apportionBase({
      amount: result.amountReceived,
      part: result.amountAllocated,
      exchangeRate: result.exchangeRate,
    });

    const accounting = await emitSchoolFeeAccountingEvent({
      actorRole: session.user.role,
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_RECEIPT_VOIDED",
      sourceId: result.id,
      sourceRef: result.receiptNo,
      entryDate: new Date(),
      amount: result.baseAmount,
      netAmount: result.baseAmount,
      taxAmount: 0,
      grossAmount: result.baseAmount,
      allocatedAmount: receivedInBase.basePart,
      currency: baseCurrency,
      documentCurrency: result.currency,
      documentAmount: result.amountReceived,
      exchangeRate: result.exchangeRate,
      invertDirection: true,
      payload: {
        receiptNo: result.receiptNo,
        reason: validated.reason,
        studentId: result.studentId,
        allocations: result.allocations.map((allocation) => ({
          invoiceId: allocation.invoiceId,
          // Post S-2.1 Float→Decimal: coerced explicitly, or JSON.stringify
          // would store a Decimal as a string in the event payload.
          allocatedAmount: toNumberOrZero(allocation.allocatedAmount),
        })),
      },
    }).catch((error) => {
      console.error("[Accounting] School fee receipt void posting failed:", error);
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
    const message = error instanceof Error ? error.message : "Failed to void fee receipt";
    if (message === "Only posted receipts can be voided") {
      return errorResponse(message, 400);
    }
    if (message === "REFUND_ON_RECEIPT") {
      return errorResponse(
        "Part of this receipt has been refunded; cancel or reverse the refund before voiding it",
        409,
      );
    }
    console.error("[API] POST /api/v2/schools/fees/receipts/[id]/void error:", error);
    return errorResponse("Failed to void fee receipt");
  }
}
