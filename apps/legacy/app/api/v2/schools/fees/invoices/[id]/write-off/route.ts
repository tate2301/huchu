import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  isZeroOrLess,
  money,
  resolveBaseCurrency,
  toBaseAmount,
  toNumberOrZero,
} from "@/lib/schools/money";
import { emitSchoolFeeAccountingEvent } from "../../../_helpers";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "write-off");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;
    const body = await request.json();
    const validated = schema.parse(body);

    const invoice = await prisma.schoolFeeInvoice.findFirst({
      where: { id, companyId },
      include: { feeStructure: { select: { currency: true } } },
    });
    if (!invoice) return errorResponse("Fee invoice not found", 404);
    if (invoice.status === "VOIDED") return errorResponse("Cannot write off a voided invoice", 400);
    if (invoice.status === "WRITEOFF") return errorResponse("Invoice is already written off", 400);
    // Post S-2.1 Float→Decimal: `<= 0` on a Decimal compares strings.
    if (isZeroOrLess(invoice.balanceAmount)) {
      return errorResponse("Invoice has no outstanding balance", 400);
    }

    // S-2.8. This update used to stand on its own, with nothing anywhere
    // recording who gave up on the money. The transaction exists so the
    // write-off and the row that names its author commit together: an audit
    // event that survives a rolled-back write is a lie, and one skipped by a
    // failed commit is a hole.
    const updated = await prisma.$transaction(async (tx) => {
      const written = await tx.schoolFeeInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "WRITEOFF",
          writeOffAmount: money(invoice.balanceAmount),
          balanceAmount: money(0),
          notes: invoice.notes
            ? `${invoice.notes}\nWrite-off: ${validated.reason}`
            : `Write-off: ${validated.reason}`,
        },
        include: { feeStructure: { select: { currency: true } } },
      });

      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.invoice.written-off",
        entityType: "SchoolFeeInvoice",
        entityId: written.id,
        reason: validated.reason,
        payload: {
          invoiceNo: written.invoiceNo,
          studentId: written.studentId,
          termId: written.termId,
          currency: written.currency,
          // Decimal columns, coerced at the JSON boundary on purpose.
          writtenOff: toNumberOrZero(written.writeOffAmount),
          totalAmount: toNumberOrZero(written.totalAmount),
          paidAmount: toNumberOrZero(written.paidAmount),
          statusBefore: invoice.status,
        },
      });

      return written;
    });

    const baseCurrency = await resolveBaseCurrency(companyId);
    const writtenOffInBase = toBaseAmount(updated.writeOffAmount, updated.exchangeRate);

    await emitSchoolFeeAccountingEvent({
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_WRITEOFF_POSTED",
      sourceId: updated.id,
      sourceRef: updated.invoiceNo,
      entryDate: new Date(),
      amount: writtenOffInBase,
      netAmount: writtenOffInBase,
      taxAmount: 0,
      grossAmount: writtenOffInBase,
      currency: baseCurrency,
      documentCurrency: updated.currency,
      documentAmount: updated.writeOffAmount,
      exchangeRate: updated.exchangeRate,
      payload: {
        invoiceNo: updated.invoiceNo,
        reason: validated.reason,
        studentId: updated.studentId,
        termId: updated.termId,
      },
    }).catch((error) => {
      console.error("[Accounting] School fee write-off event capture failed:", error);
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/fees/invoices/[id]/write-off error:", error);
    return errorResponse("Failed to write off fee invoice");
  }
}
