import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  errorResponse,
  getPaginationParams,
  paginationResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  exceeds,
  money,
  resolveDocumentCurrency,
  toBaseAmount,
  toNumberOrZero,
  UnknownExchangeRateError,
} from "@/lib/schools/money";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  /**
   * The pupil's current year group. Filtered through the student, because the
   * class belongs to the child; a copy held here would give two answers the
   * moment they move up.
   */
  classId: z.string().uuid().optional(),
  termId: z.string().uuid().optional(),
  invoiceId: z.string().uuid().optional(),
  status: z
    .enum(["DRAFT", "APPROVED", "APPLIED", "REJECTED", "REVERSED"])
    .optional(),
});

const createSchema = z.object({
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  invoiceId: z.string().uuid().nullable().optional(),
  waiverType: z.enum(["SCHOLARSHIP", "DISCOUNT", "HARDSHIP", "OTHER"]),
  amount: z.number().finite().positive(),
  /** S-2.2. Ignored when the waiver names an invoice — that invoice decides. */
  currency: z.string().trim().min(3).max(10).optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  status: z
    .enum(["DRAFT", "APPROVED", "APPLIED", "REJECTED", "REVERSED"])
    .optional(),
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
      termId: searchParams.get("termId") ?? undefined,
      invoiceId: searchParams.get("invoiceId") ?? undefined,
      classId: searchParams.get("classId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolFeeWaiverWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.classId) where.student = { currentClassId: query.classId };
    if (query.termId) where.termId = query.termId;
    if (query.invoiceId) where.invoiceId = query.invoiceId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { reason: { contains: query.search, mode: "insensitive" } },
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const [records, total] = await Promise.all([
      prisma.schoolFeeWaiver.findMany({
        where,
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
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolFeeWaiver.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/fees/waivers error:", error);
    return errorResponse("Failed to fetch fee waivers");
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "create");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createSchema.parse(body);

    const [student, term, invoice] = await Promise.all([
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true },
      }),
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      validated.invoiceId
        ? prisma.schoolFeeInvoice.findFirst({
            where: { id: validated.invoiceId, companyId, studentId: validated.studentId },
            select: {
              id: true,
              termId: true,
              balanceAmount: true,
              currency: true,
              exchangeRate: true,
            },
          })
        : Promise.resolve(null),
    ]);

    if (!student) return errorResponse("Invalid student for this company", 400);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (validated.invoiceId && !invoice) {
      return errorResponse("Invalid invoice for this student and company", 400);
    }
    if (invoice && invoice.termId !== validated.termId) {
      return errorResponse("Waiver term must match invoice term", 400);
    }
    // Post S-2.1 Float→Decimal: an exact comparison, no epsilon fudge.
    if (invoice && exceeds(validated.amount, invoice.balanceAmount)) {
      return errorResponse("Waiver amount exceeds invoice outstanding balance", 400);
    }

    // S-2.2. A waiver against an invoice inherits that invoice's currency and
    // the rate it was raised at, so the discount and the bill cannot drift
    // apart when the rate moves.
    let documentCurrency;
    try {
      documentCurrency = invoice
        ? {
            baseCurrency: null,
            currency: invoice.currency,
            exchangeRate: invoice.exchangeRate,
          }
        : await resolveDocumentCurrency({ companyId, currency: validated.currency });
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        return errorResponse(error.message, 400);
      }
      throw error;
    }

    const amount = money(validated.amount);
    const status = validated.status ?? "DRAFT";
    const approvedHere = status === "APPROVED" || status === "APPLIED";

    // S-2.8. The create and the rows that describe it commit together. This
    // route can hand out an approval in the same call that writes the waiver
    // down — `status: "APPROVED"` stamps `approvedById` — and that approval is
    // what reduces a family's bill, so it cannot be the one thing with no
    // record behind it.
    const created = await prisma.$transaction(async (tx) => {
      const waiver = await tx.schoolFeeWaiver.create({
        data: {
          companyId,
          studentId: validated.studentId,
          termId: validated.termId,
          invoiceId: validated.invoiceId ?? null,
          waiverType: validated.waiverType,
          amount,
          currency: documentCurrency.currency,
          exchangeRate: documentCurrency.exchangeRate,
          baseAmount: toBaseAmount(amount, documentCurrency.exchangeRate),
          reason: validated.reason ?? null,
          status,
          approvedById: approvedHere ? session.user.id : null,
          approvedAt: approvedHere ? new Date() : null,
          appliedById: status === "APPLIED" ? session.user.id : null,
          appliedAt: status === "APPLIED" ? new Date() : null,
          createdById: session.user.id,
        },
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

      const shared = {
        companyId,
        actorId: session.user.id,
        entityType: "SchoolFeeWaiver",
        entityId: waiver.id,
        reason: validated.reason ?? undefined,
      } as const;
      const shape = {
        studentId: waiver.studentId,
        termId: waiver.termId,
        invoiceId: waiver.invoiceId,
        waiverType: waiver.waiverType,
        currency: waiver.currency,
        // `amount` is a `Decimal`; a number is what belongs in the payload.
        amount: toNumberOrZero(waiver.amount),
        baseAmount: toNumberOrZero(waiver.baseAmount),
        status: waiver.status,
      };

      await writeSchoolAuditEvent(tx, {
        ...shared,
        eventType: "schools.fee.waiver.created",
        payload: shape,
      });

      // Two things happened when a waiver arrives already approved, and only
      // one of them costs the school money. "Who authorised this discount" is
      // the question an auditor asks, and it wants its own verb.
      if (approvedHere) {
        await writeSchoolAuditEvent(tx, {
          ...shared,
          eventType: "schools.fee.waiver.approved",
          payload: { ...shape, approvedAt: waiver.approvedAt?.toISOString() ?? null },
        });
      }

      return waiver;
    });

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/fees/waivers error:", error);
    return errorResponse("Failed to create fee waiver");
  }
}
