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
import { normalizeProvidedId, reserveIdentifier } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@corelithzw/module-campus/audit";
import { schoolPermissionDenial } from "@corelithzw/module-campus/permissions";
import {
  exceeds,
  money,
  toBaseAmount,
  toNumberOrZero,
} from "@corelithzw/module-campus/money";
import {
  availableInvoiceCredit,
  availableReceiptCredit,
  FeeCreditError,
  isFeeCreditCheckViolation,
  lockFeeInvoices,
  lockFeeReceipt,
} from "@corelithzw/module-campus/fees-posting";

/**
 * S-2.6 — money going back to a parent.
 *
 * This replaced a 501 that told bursars to use a waiver or a write-off instead.
 * Neither is a refund: a waiver reduces a bill, a write-off gives up on
 * collecting one, and both leave the family's money in the school's bank.
 *
 * A refund is drawn against a named credit and never against a student in the
 * abstract, because "where did this money come from" has to have an answer on
 * the row. The two sources are a receipt with an unallocated surplus and an
 * invoice settled beyond its total.
 *
 * Requesting holds the credit. It is not paid yet — that is `[id]/pay` — but
 * from this moment the same $50 cannot be requested again, allocated to next
 * term's invoice, or refunded a second time, and it is the database that says
 * so rather than this file.
 */

const dateInputSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z
  .object({
    refundNo: z.string().trim().min(1).max(40).optional(),
    receiptId: z.string().uuid().optional(),
    invoiceId: z.string().uuid().optional(),
    amount: z.number().finite().positive(),
    refundDate: dateInputSchema.optional(),
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY"]),
    reference: z.string().trim().max(120).nullable().optional(),
    reason: z.string().trim().min(1).max(500),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine(
    (value) => Boolean(value.receiptId) !== Boolean(value.invoiceId),
    "Name exactly one source: a receipt with unallocated credit, or an over-paid invoice",
  );

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  /**
   * The pupil's current year group. Filtered through the student, because the
   * class belongs to the child; a copy held here would give two answers the
   * moment they move up.
   */
  classId: z.string().uuid().optional(),
  status: z.enum(["REQUESTED", "PAID", "CANCELLED"]).optional(),
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
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolFeeRefundWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.classId) where.student = { currentClassId: query.classId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { refundNo: { contains: query.search, mode: "insensitive" } },
        { reference: { contains: query.search, mode: "insensitive" } },
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.schoolFeeRefund.findMany({
        where,
        include: {
          student: {
            select: { id: true, studentNo: true, firstName: true, lastName: true },
          },
          receipt: { select: { id: true, receiptNo: true } },
          invoice: { select: { id: true, invoiceNo: true } },
        },
        orderBy: [{ refundDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolFeeRefund.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/finance/refunds error:", error);
    return errorResponse("Failed to fetch refunds");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    // This route had no guard at all before S-2.6 — it passed
    // `route-guard-coverage.test.ts` only because the GET in the same file
    // carried the marker string, which is a gap in that test worth knowing
    // about.
    const denied = schoolPermissionDenial(session, "schools.fees", "refund");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createSchema.parse(body);

    const refundDate = new Date(validated.refundDate ?? new Date().toISOString());
    if (Number.isNaN(refundDate.getTime())) {
      return errorResponse("Invalid refund date", 400);
    }
    const amount = money(validated.amount);

    let refundNo: string;
    try {
      refundNo = validated.refundNo
        ? normalizeProvidedId(validated.refundNo, "SCHOOL_FEE_REFUND")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_FEE_REFUND",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid refund number format";
      return errorResponse(message, 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      let studentId: string;
      let currency: string;
      let exchangeRate: Prisma.Decimal;
      let available: Prisma.Decimal;
      let sourceRef: string;

      if (validated.receiptId) {
        await lockFeeReceipt(tx, { companyId, receiptId: validated.receiptId });
        const receipt = await tx.schoolFeeReceipt.findFirst({
          where: { id: validated.receiptId, companyId },
          select: {
            id: true,
            receiptNo: true,
            studentId: true,
            status: true,
            currency: true,
            exchangeRate: true,
            amountUnallocated: true,
            refundedAmount: true,
          },
        });
        if (!receipt) throw new FeeCreditError("Fee receipt not found", 404);
        if (receipt.status !== "POSTED") {
          throw new FeeCreditError(
            "Only a posted receipt holds credit that can be refunded",
            400,
          );
        }
        studentId = receipt.studentId;
        currency = receipt.currency;
        // The source document's rate, not today's: a refund undoes what the
        // receipt posted, and re-converting it at a moved rate would leave a
        // difference in the ledger that nothing accounts for.
        exchangeRate = receipt.exchangeRate;
        available = availableReceiptCredit(receipt);
        sourceRef = receipt.receiptNo;
      } else {
        const invoiceId = validated.invoiceId as string;
        await lockFeeInvoices(tx, { companyId, invoiceIds: [invoiceId] });
        const invoice = await tx.schoolFeeInvoice.findFirst({
          where: { id: invoiceId, companyId },
          select: {
            id: true,
            invoiceNo: true,
            studentId: true,
            status: true,
            currency: true,
            exchangeRate: true,
            creditAmount: true,
            refundedAmount: true,
          },
        });
        if (!invoice) throw new FeeCreditError("Fee invoice not found", 404);
        if (invoice.status === "VOIDED") {
          throw new FeeCreditError("A voided invoice carries no credit", 400);
        }
        studentId = invoice.studentId;
        currency = invoice.currency;
        exchangeRate = invoice.exchangeRate;
        available = availableInvoiceCredit(invoice);
        sourceRef = invoice.invoiceNo;
      }

      if (!available.greaterThan(0)) {
        throw new FeeCreditError(`${sourceRef} has no credit left to refund`, 400);
      }
      if (exceeds(amount, available)) {
        throw new FeeCreditError(
          `${sourceRef} has ${available.toFixed(2)} ${currency} available to refund; that asks for ${amount.toFixed(2)}`,
          400,
        );
      }

      // Hold the credit. The CHECK constraint on the source row is the real
      // guarantee — the comparison above produces the better sentence, but it
      // is this write that two bursars race on, and only one of them wins it.
      if (validated.receiptId) {
        await tx.schoolFeeReceipt.update({
          where: { id: validated.receiptId },
          data: { refundedAmount: { increment: amount } },
        });
      } else {
        await tx.schoolFeeInvoice.update({
          where: { id: validated.invoiceId as string },
          data: { refundedAmount: { increment: amount } },
        });
      }

      const refund = await tx.schoolFeeRefund.create({
        data: {
          companyId,
          refundNo,
          studentId,
          receiptId: validated.receiptId ?? null,
          invoiceId: validated.invoiceId ?? null,
          refundDate,
          method: validated.method,
          reference: validated.reference ?? null,
          reason: validated.reason,
          amount,
          currency,
          exchangeRate,
          baseAmount: toBaseAmount(amount, exchangeRate),
          status: "REQUESTED",
          notes: validated.notes ?? null,
          requestedById: session.user.id,
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
        eventType: "schools.fee.refund.requested",
        entityType: "SchoolFeeRefund",
        entityId: refund.id,
        reason: validated.reason,
        payload: {
          refundNo,
          studentId,
          source: validated.receiptId ? "RECEIPT" : "INVOICE",
          sourceRef,
          currency,
          amount: toNumberOrZero(amount),
          creditAvailableBefore: toNumberOrZero(available),
          method: validated.method,
        },
      });

      return refund;
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FeeCreditError) {
      return errorResponse(error.message, error.status);
    }
    if (isFeeCreditCheckViolation(error)) {
      return errorResponse(
        "That credit has already been claimed; reload and try again",
        409,
      );
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return errorResponse("Refund number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/finance/refunds error:", error);
    return errorResponse("Failed to create refund request");
  }
}
