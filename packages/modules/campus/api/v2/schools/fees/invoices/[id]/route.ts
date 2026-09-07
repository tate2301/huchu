import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "../../../../../../audit";
import { schoolPermissionDenial } from "../../../../../../permissions";
import {
  money,
  multiplyMoney,
  percent,
  rate,
  taxOn,
  toNumberOrZero,
} from "../../../../../../money";
import { refreshFeeInvoiceBalance } from "../../../../../../fees-posting";

/**
 * One invoice: read it, correct it, or throw a draft away.
 *
 * The list route could raise a bill and the two sibling routes could issue or
 * write one off, but nothing anywhere could fix a typo in the due date, and a
 * draft raised against the wrong pupil was permanent. That is the half of CRUD
 * the ledger was missing.
 *
 * What may be changed narrows as the bill hardens, because an invoice is a
 * statement to a family and not a scratch pad:
 *
 *   - a DRAFT is still the school talking to itself, so its dates, its notes
 *     and — when it carries the single line the quick-create makes — its
 *     description and amount are all editable;
 *   - once ISSUED or PART_PAID the family has seen it, so only the due date and
 *     the notes move. Changing what is owed after the fact is a waiver or a
 *     write-off, both of which leave a trail this would not;
 *   - PAID, VOIDED and WRITEOFF are closed, and nothing here reopens them.
 *
 * DELETE is a draft-only door for the same reason. An issued invoice is
 * withdrawn with a write-off, which keeps the number in the sequence and says
 * who gave up on the money; deleting it would leave a hole in the invoice
 * numbering that an auditor reads as a missing document.
 */

type RouteParams = { params: Promise<{ id: string }> };

const dateInputSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const patchSchema = z
  .object({
    issueDate: dateInputSchema.optional(),
    dueDate: dateInputSchema.optional(),
    description: z.string().trim().min(1).max(240).optional(),
    amount: z.number().finite().positive().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    "Nothing to change",
  );

const invoiceInclude = {
  student: {
    select: {
      id: true,
      studentNo: true,
      firstName: true,
      lastName: true,
      status: true,
    },
  },
  term: { select: { id: true, code: true, name: true } },
  feeStructure: { select: { id: true, name: true, currency: true } },
  lines: { orderBy: [{ createdAt: "asc" as const }] },
  _count: { select: { lines: true, receiptAllocations: true, waivers: true } },
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const { id } = await params;

    const invoice = await prisma.schoolFeeInvoice.findFirst({
      where: { id, companyId: session.user.companyId },
      include: invoiceInclude,
    });
    if (!invoice) return errorResponse("Fee invoice not found", 404);

    return successResponse(invoice);
  } catch (error) {
    console.error("[API] GET /api/v2/schools/fees/invoices/[id] error:", error);
    return errorResponse("Failed to fetch fee invoice");
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "edit");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const body = await request.json();
    const validated = patchSchema.parse(body);

    const existing = await prisma.schoolFeeInvoice.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!existing) return errorResponse("Fee invoice not found", 404);

    if (
      existing.status === "PAID" ||
      existing.status === "VOIDED" ||
      existing.status === "WRITEOFF"
    ) {
      return errorResponse(
        "A settled, voided or written-off invoice cannot be edited",
        400,
      );
    }

    const isDraft = existing.status === "DRAFT";
    const wantsMoneyChange =
      validated.amount !== undefined || validated.description !== undefined;

    if (wantsMoneyChange && !isDraft) {
      return errorResponse(
        "What an issued invoice charges is changed with a waiver or a write-off, not an edit",
        400,
      );
    }
    // The quick-create writes exactly one MANUAL line. A bill built from a fee
    // structure has six of them and a single "amount" box cannot say which one
    // moved, so those are edited by replacing the invoice rather than here.
    if (wantsMoneyChange && existing.lines.length !== 1) {
      return errorResponse(
        "This invoice has itemised lines; edit them on the fee structure it came from",
        400,
      );
    }

    const issueDate = validated.issueDate ? new Date(validated.issueDate) : existing.issueDate;
    const dueDate = validated.dueDate ? new Date(validated.dueDate) : existing.dueDate;
    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      return errorResponse("Invalid issue or due date", 400);
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      return errorResponse("Due date cannot be earlier than issue date", 400);
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.schoolFeeInvoice.update({
        where: { id: existing.id },
        data: {
          issueDate,
          dueDate,
          ...(validated.notes !== undefined ? { notes: validated.notes } : {}),
        },
      });

      if (wantsMoneyChange) {
        const line = existing.lines[0];
        const quantity = rate(line.quantity);
        const unitAmount =
          validated.amount !== undefined ? money(validated.amount) : money(line.unitAmount);
        const taxRate = percent(line.taxRate);
        const net = multiplyMoney(quantity, unitAmount);
        const taxAmount = taxOn(net, taxRate);
        await tx.schoolFeeInvoiceLine.update({
          where: { id: line.id },
          data: {
            description: validated.description ?? line.description,
            unitAmount,
            taxAmount,
            lineTotal: net.plus(taxAmount),
          },
        });
      }

      const refreshed = await refreshFeeInvoiceBalance(tx, {
        companyId,
        invoiceId: existing.id,
      });
      if (!refreshed) throw new Error("Failed to refresh invoice balances");

      // S-2.8. A bill that changed shape between one statement and the next is
      // precisely what a parent queries, so the before and after are both on
      // the row rather than only the survivor.
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.invoice.edited",
        entityType: "SchoolFeeInvoice",
        entityId: existing.id,
        payload: {
          invoiceNo: existing.invoiceNo,
          studentId: existing.studentId,
          termId: existing.termId,
          status: refreshed.status,
          currency: refreshed.currency,
          // Decimal columns, coerced at the JSON boundary on purpose.
          totalBefore: toNumberOrZero(existing.totalAmount),
          totalAfter: toNumberOrZero(refreshed.totalAmount),
          dueDateBefore: existing.dueDate.toISOString(),
          dueDateAfter: dueDate.toISOString(),
        },
      });

      return tx.schoolFeeInvoice.findUnique({
        where: { id: existing.id },
        include: invoiceInclude,
      });
    });

    return successResponse(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] PATCH /api/v2/schools/fees/invoices/[id] error:", error);
    return errorResponse("Failed to update fee invoice");
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // Discarding a draft is the bursar's `void` — the same verb that withdraws
    // a receipt. It is deliberately not `archive`, which no persona holds on
    // `schools.fees` and which would lock the bursar out of their own drafts.
    const denied = schoolPermissionDenial(session, "schools.fees", "void");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;
    const { id } = await params;

    const existing = await prisma.schoolFeeInvoice.findFirst({
      where: { id, companyId },
      include: {
        _count: { select: { receiptAllocations: true, waivers: true } },
      },
    });
    if (!existing) return errorResponse("Fee invoice not found", 404);
    if (existing.status !== "DRAFT") {
      return errorResponse(
        "Only a draft can be discarded. Write off an issued invoice instead, so the number keeps its place in the sequence.",
        400,
      );
    }
    if (existing._count.receiptAllocations > 0 || existing._count.waivers > 0) {
      return errorResponse(
        "This draft already has money or a waiver against it and cannot be discarded",
        400,
      );
    }

    await prisma.$transaction(async (tx) => {
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.invoice.discarded",
        entityType: "SchoolFeeInvoice",
        entityId: existing.id,
        payload: {
          invoiceNo: existing.invoiceNo,
          studentId: existing.studentId,
          termId: existing.termId,
          currency: existing.currency,
          totalAmount: toNumberOrZero(existing.totalAmount),
        },
      });
      await tx.schoolFeeInvoice.delete({ where: { id: existing.id } });
    });

    return successResponse({ id: existing.id, deleted: true });
  } catch (error) {
    console.error("[API] DELETE /api/v2/schools/fees/invoices/[id] error:", error);
    return errorResponse("Failed to discard fee invoice");
  }
}
