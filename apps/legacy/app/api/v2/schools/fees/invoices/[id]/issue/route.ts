import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  apportionBase,
  isZeroOrLess,
  resolveBaseCurrency,
  toNumberOrZero,
} from "@/lib/schools/money";
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

    const denied = schoolPermissionDenial(session, "schools.fees", "issue");
    if (denied) return errorResponse(denied, 403);
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
      // Post S-2.1 Float→Decimal: `<= 0` on a Prisma.Decimal is a string
      // comparison, which is quietly wrong rather than a type error.
      if (isZeroOrLess(refreshed.totalAmount)) {
        throw new Error("Cannot issue an invoice with zero amount");
      }

      const issued = await tx.schoolFeeInvoice.update({
        where: { id: existing.id },
        data: {
          issueDate,
          status: isZeroOrLess(refreshed.balanceAmount) ? "PAID" : "ISSUED",
          issuedById: session.user.id,
          issuedAt: new Date(),
        },
        include: {
          feeStructure: { select: { currency: true } },
        },
      });

      // S-2.8. Inside the transaction that issued it. A draft is a school
      // talking to itself; an issued invoice is a demand on a family, and the
      // moment it becomes one is the thing an auditor asks about.
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.invoice.issued",
        entityType: "SchoolFeeInvoice",
        entityId: issued.id,
        payload: {
          invoiceNo: issued.invoiceNo,
          studentId: issued.studentId,
          termId: issued.termId,
          currency: issued.currency,
          // Money is `Decimal`. Coerced here rather than left to whatever
          // `JSON.stringify` makes of a Decimal on its way into `payloadJson`.
          totalAmount: toNumberOrZero(issued.totalAmount),
          balanceAmount: toNumberOrZero(issued.balanceAmount),
          issueDate: issued.issueDate.toISOString(),
          status: issued.status,
        },
      });

      return issued;
    });

    if (!updated) return errorResponse("Fee invoice not found", 404);

    if (updated.status === "ISSUED") {
      const baseCurrency = await resolveBaseCurrency(companyId);
      const issuedInBase = apportionBase({
        amount: updated.totalAmount,
        part: updated.taxTotal,
        exchangeRate: updated.exchangeRate,
      });
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_INVOICE_ISSUED",
        sourceId: updated.id,
        sourceRef: updated.invoiceNo,
        entryDate: updated.issueDate,
        // S-2.2: the ledger takes the base-currency figures, derived from the
        // rate stamped on the invoice when it was raised.
        amount: issuedInBase.base,
        // S-2.3: the tax is converted and the net is the remainder, so
        // net + tax is the amount to the cent and the entry balances. Two
        // separate conversions differ by one on a non-base currency, and the
        // posting engine refuses an entry whose sides do not agree.
        netAmount: issuedInBase.baseRest,
        taxAmount: issuedInBase.basePart,
        grossAmount: issuedInBase.base,
        currency: baseCurrency,
        documentCurrency: updated.currency,
        documentAmount: updated.totalAmount,
        exchangeRate: updated.exchangeRate,
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
