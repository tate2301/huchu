import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { schoolPermissionDenial } from "../../../../../permissions";
import { toNumberOrZero } from "../../../../../money";
import { availableInvoiceCredit, availableReceiptCredit } from "../../../../../fees-posting";

/**
 * S-2.5 — what the school is holding on families' behalf.
 *
 * A credit nobody can see is indistinguishable from money that vanished, so
 * this is the surface that makes the two different. It answers one question —
 * whose money is here, where did it come from, and how much of it is still
 * free — and it is what both the allocation dialog and the refund dialog pick
 * a source from.
 *
 * Two sources, and they are genuinely different things rather than two views of
 * one:
 *
 *   * `RECEIPT` — a payment larger than what it settled. The parent overpaid.
 *   * `INVOICE` — a bill settled beyond its total, which is what a bursary
 *     granted after the family had already paid produces.
 *
 * `available` is net of anything a requested refund is already holding, so a
 * credit cannot be spent and refunded at once.
 */

const querySchema = z.object({
  studentId: z.string().uuid().optional(),
  /**
   * The pupil's current year group. Filtered through the student, because the
   * class belongs to the child; a copy held here would give two answers the
   * moment they move up.
   */
  classId: z.string().uuid().optional(),
  search: z.string().trim().min(1).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "view");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const { page, limit, skip } = getPaginationParams(request);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      studentId: searchParams.get("studentId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    const student = {
      select: { id: true, studentNo: true, firstName: true, lastName: true },
    } as const;

    // The search and the year group narrow the same relation, so they are
    // built as one object rather than two `student:` keys that would overwrite
    // each other in the spread below.
    const studentFilter: Prisma.SchoolStudentWhereInput | undefined =
      query.search || query.classId
        ? {
            ...(query.classId ? { currentClassId: query.classId } : {}),
            ...(query.search
              ? {
                  OR: [
                    { studentNo: { contains: query.search, mode: "insensitive" } },
                    { firstName: { contains: query.search, mode: "insensitive" } },
                    { lastName: { contains: query.search, mode: "insensitive" } },
                  ],
                }
              : {}),
          }
        : undefined;

    const [receipts, invoices] = await Promise.all([
      prisma.schoolFeeReceipt.findMany({
        where: {
          companyId,
          status: "POSTED",
          amountUnallocated: { gt: 0 },
          ...(query.studentId ? { studentId: query.studentId } : {}),
          ...(studentFilter ? { student: studentFilter } : {}),
        },
        select: {
          id: true,
          receiptNo: true,
          receiptDate: true,
          currency: true,
          amountUnallocated: true,
          refundedAmount: true,
          student,
        },
        orderBy: [{ receiptDate: "desc" }],
      }),
      prisma.schoolFeeInvoice.findMany({
        where: {
          companyId,
          status: { notIn: ["VOIDED"] },
          creditAmount: { gt: 0 },
          ...(query.studentId ? { studentId: query.studentId } : {}),
          ...(studentFilter ? { student: studentFilter } : {}),
        },
        select: {
          id: true,
          invoiceNo: true,
          issueDate: true,
          currency: true,
          creditAmount: true,
          refundedAmount: true,
          student,
        },
        orderBy: [{ issueDate: "desc" }],
      }),
    ]);

    const rows = [
      ...receipts.map((receipt) => ({
        kind: "RECEIPT" as const,
        sourceId: receipt.id,
        reference: receipt.receiptNo,
        date: receipt.receiptDate,
        currency: receipt.currency,
        credit: toNumberOrZero(receipt.amountUnallocated),
        heldForRefund: toNumberOrZero(receipt.refundedAmount),
        available: toNumberOrZero(availableReceiptCredit(receipt)),
        student: receipt.student,
      })),
      ...invoices.map((invoice) => ({
        kind: "INVOICE" as const,
        sourceId: invoice.id,
        reference: invoice.invoiceNo,
        date: invoice.issueDate,
        currency: invoice.currency,
        credit: toNumberOrZero(invoice.creditAmount),
        heldForRefund: toNumberOrZero(invoice.refundedAmount),
        available: toNumberOrZero(availableInvoiceCredit(invoice)),
        student: invoice.student,
      })),
    ].sort((a, b) => b.date.getTime() - a.date.getTime());

    // Paginated in memory rather than in SQL: the two halves come from
    // different tables with different date columns, and a school's live credits
    // are counted in dozens, not thousands. A UNION view is the answer if that
    // ever stops being true.
    return successResponse(
      paginationResponse(rows.slice(skip, skip + limit), rows.length, page, limit),
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/fees/credits error:", error);
    return errorResponse("Failed to fetch fee credits");
  }
}
