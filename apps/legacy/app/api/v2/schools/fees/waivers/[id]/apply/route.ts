import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@corelithzw/module-campus/audit";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import {
  exceeds,
  resolveBaseCurrency,
  toBaseAmount,
  toNumberOrZero,
} from "@corelithzw/module-campus/money";
import {
  emitSchoolFeeAccountingEvent,
  refreshFeeInvoiceBalance,
} from "@corelithzw/module-campus/fees-posting";

type RouteParams = { params: Promise<{ id: string }> };

const schema = z.object({
  invoiceId: z.string().uuid().optional(),
  reason: z.string().trim().max(500).optional(),
});

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "waive");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const validated = schema.parse(body);

    const applied = await prisma.$transaction(async (tx) => {
      const waiver = await tx.schoolFeeWaiver.findFirst({
        where: { id, companyId },
      });
      if (!waiver) return null;
      if (waiver.status === "APPLIED") {
        return tx.schoolFeeWaiver.findUnique({
          where: { id: waiver.id },
          include: {
            student: {
              select: {
                id: true,
                studentNo: true,
                firstName: true,
                lastName: true,
              },
            },
            term: { select: { id: true, code: true, name: true } },
            invoice: {
              select: {
                id: true,
                invoiceNo: true,
                status: true,
                balanceAmount: true,
              },
            },
          },
        });
      }
      if (waiver.status === "REJECTED" || waiver.status === "REVERSED") {
        throw new Error("Cannot apply a rejected or reversed waiver");
      }

      const invoice =
        waiver.invoiceId || validated.invoiceId
          ? await tx.schoolFeeInvoice.findFirst({
              where: {
                id: waiver.invoiceId ?? validated.invoiceId,
                companyId,
                studentId: waiver.studentId,
                termId: waiver.termId,
                status: { in: ["ISSUED", "PART_PAID", "DRAFT"] },
              },
              select: {
                id: true,
                invoiceNo: true,
                balanceAmount: true,
                status: true,
                totalAmount: true,
                subTotal: true,
                taxTotal: true,
                currency: true,
                exchangeRate: true,
              },
            })
          : await tx.schoolFeeInvoice.findFirst({
              where: {
                companyId,
                studentId: waiver.studentId,
                termId: waiver.termId,
                status: { in: ["ISSUED", "PART_PAID", "DRAFT"] },
                balanceAmount: { gt: 0 },
              },
              orderBy: [{ dueDate: "asc" }, { issueDate: "asc" }],
              select: {
                id: true,
                invoiceNo: true,
                balanceAmount: true,
                status: true,
                totalAmount: true,
                subTotal: true,
                taxTotal: true,
                currency: true,
                exchangeRate: true,
              },
            });

      if (!invoice) {
        throw new Error("No eligible invoice found to apply waiver");
      }
      // Post S-2.1 Float→Decimal: exact, not `> 0.009`.
      if (exceeds(waiver.amount, invoice.balanceAmount)) {
        throw new Error("Waiver amount exceeds invoice outstanding balance");
      }
      // S-2.2. A waiver may only discount a bill in the same currency; the
      // waiver was created before the invoice was chosen in the derived path,
      // so this is the first point at which the pair is known.
      if (waiver.currency !== invoice.currency) {
        throw new Error("Waiver currency does not match the invoice currency");
      }

      const updatedWaiver = await tx.schoolFeeWaiver.update({
        where: { id: waiver.id },
        data: {
          invoiceId: invoice.id,
          status: "APPLIED",
          // The invoice's rate is the one that governs, so the discount and
          // the bill reach the ledger through the same conversion.
          exchangeRate: invoice.exchangeRate,
          baseAmount: toBaseAmount(waiver.amount, invoice.exchangeRate),
          approvedById: waiver.approvedById ?? session.user.id,
          approvedAt: waiver.approvedAt ?? new Date(),
          appliedById: session.user.id,
          appliedAt: new Date(),
          reason: validated.reason
            ? waiver.reason
              ? `${waiver.reason}\nApply note: ${validated.reason}`
              : `Apply note: ${validated.reason}`
            : waiver.reason,
        },
      });

      const refreshedInvoice = await refreshFeeInvoiceBalance(tx, {
        companyId,
        invoiceId: invoice.id,
      });
      if (!refreshedInvoice) {
        throw new Error("Failed to refresh invoice after waiver application");
      }

      // S-2.8. Applying is the moment the discount actually comes off a bill,
      // and it is written on `tx` alongside the update that did it. The
      // balance before and after is on the row because the whole question is
      // how much the family stopped owing.
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.waiver.applied",
        entityType: "SchoolFeeWaiver",
        entityId: updatedWaiver.id,
        reason: validated.reason ?? waiver.reason ?? undefined,
        payload: {
          studentId: updatedWaiver.studentId,
          termId: updatedWaiver.termId,
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          waiverType: updatedWaiver.waiverType,
          currency: updatedWaiver.currency,
          // Every one of these is a `Decimal` column. Coerced here rather
          // than left to be stringified on the way into `payloadJson`.
          amount: toNumberOrZero(updatedWaiver.amount),
          baseAmount: toNumberOrZero(updatedWaiver.baseAmount),
          balanceBefore: toNumberOrZero(invoice.balanceAmount),
          balanceAfter: toNumberOrZero(refreshedInvoice.balanceAmount),
          statusWhenApproved: waiver.status,
        },
      });

      return tx.schoolFeeWaiver.findUnique({
        where: { id: updatedWaiver.id },
        include: {
          student: {
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
            },
          },
          term: { select: { id: true, code: true, name: true } },
          invoice: {
            select: {
              id: true,
              invoiceNo: true,
              status: true,
              balanceAmount: true,
            },
          },
        },
      });
    });

    if (!applied) return errorResponse("Fee waiver not found", 404);

    const baseCurrency = await resolveBaseCurrency(companyId);

    await emitSchoolFeeAccountingEvent({
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_WAIVER_APPLIED",
      sourceId: applied.id,
      sourceRef: applied.invoice?.invoiceNo ?? applied.id,
      entryDate: applied.appliedAt ?? new Date(),
      amount: applied.baseAmount,
      netAmount: applied.baseAmount,
      taxAmount: 0,
      grossAmount: applied.baseAmount,
      currency: baseCurrency,
      documentCurrency: applied.currency,
      documentAmount: applied.amount,
      exchangeRate: applied.exchangeRate,
      payload: {
        waiverType: applied.waiverType,
        studentId: applied.studentId,
        termId: applied.termId,
        invoiceId: applied.invoiceId,
      },
    }).catch((error) => {
      console.error("[Accounting] School fee waiver event capture failed:", error);
    });

    return successResponse(applied);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    const message = error instanceof Error ? error.message : "Failed to apply fee waiver";
    if (
      message === "Cannot apply a rejected or reversed waiver" ||
      message === "No eligible invoice found to apply waiver" ||
      message === "Waiver amount exceeds invoice outstanding balance" ||
      message === "Waiver currency does not match the invoice currency" ||
      message === "Failed to refresh invoice after waiver application"
    ) {
      return errorResponse(message, 400);
    }
    console.error("[API] POST /api/v2/schools/fees/waivers/[id]/apply error:", error);
    return errorResponse("Failed to apply fee waiver");
  }
}
