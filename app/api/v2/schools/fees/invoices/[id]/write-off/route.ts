import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
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
    if (invoice.balanceAmount <= 0) return errorResponse("Invoice has no outstanding balance", 400);

    const updated = await prisma.schoolFeeInvoice.update({
      where: { id: invoice.id },
      data: {
        status: "WRITEOFF",
        writeOffAmount: invoice.balanceAmount,
        balanceAmount: 0,
        notes: invoice.notes
          ? `${invoice.notes}\nWrite-off: ${validated.reason}`
          : `Write-off: ${validated.reason}`,
      },
      include: { feeStructure: { select: { currency: true } } },
    });

    await emitSchoolFeeAccountingEvent({
      companyId,
      actorId: session.user.id,
      eventType: "SCHOOL_FEE_WRITEOFF_POSTED",
      sourceId: updated.id,
      sourceRef: updated.invoiceNo,
      entryDate: new Date(),
      amount: updated.writeOffAmount,
      netAmount: updated.writeOffAmount,
      taxAmount: 0,
      grossAmount: updated.writeOffAmount,
      currency: updated.feeStructure?.currency ?? "USD",
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
