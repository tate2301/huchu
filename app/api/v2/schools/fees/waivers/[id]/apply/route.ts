import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import {
  emitSchoolFeeAccountingEvent,
  refreshFeeInvoiceBalance,
} from "../../../_helpers";

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
              },
            });

      if (!invoice) {
        throw new Error("No eligible invoice found to apply waiver");
      }
      if (waiver.amount - invoice.balanceAmount > 0.009) {
        throw new Error("Waiver amount exceeds invoice outstanding balance");
      }

      const updatedWaiver = await tx.schoolFeeWaiver.update({
        where: { id: waiver.id },
        data: {
          invoiceId: invoice.id,
          status: "APPLIED",
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

    await emitSchoolFeeAccountingEvent({
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_WAIVER_APPLIED",
      sourceId: applied.id,
      sourceRef: applied.invoice?.invoiceNo ?? applied.id,
      entryDate: applied.appliedAt ?? new Date(),
      amount: applied.amount,
      netAmount: applied.amount,
      taxAmount: 0,
      grossAmount: applied.amount,
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
      message === "Failed to refresh invoice after waiver application"
    ) {
      return errorResponse(message, 400);
    }
    console.error("[API] POST /api/v2/schools/fees/waivers/[id]/apply error:", error);
    return errorResponse("Failed to apply fee waiver");
  }
}
