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

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
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
  reason: z.string().trim().max(500).nullable().optional(),
  status: z
    .enum(["DRAFT", "APPROVED", "APPLIED", "REJECTED", "REVERSED"])
    .optional(),
});

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { page, limit, skip } = getPaginationParams(request);
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      search: searchParams.get("search") ?? undefined,
      studentId: searchParams.get("studentId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      invoiceId: searchParams.get("invoiceId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    const where: Prisma.SchoolFeeWaiverWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
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
            select: { id: true, termId: true, balanceAmount: true },
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
    if (invoice && validated.amount - invoice.balanceAmount > 0.009) {
      return errorResponse("Waiver amount exceeds invoice outstanding balance", 400);
    }

    const status = validated.status ?? "DRAFT";
    const created = await prisma.schoolFeeWaiver.create({
      data: {
        companyId,
        studentId: validated.studentId,
        termId: validated.termId,
        invoiceId: validated.invoiceId ?? null,
        waiverType: validated.waiverType,
        amount: toMoney(validated.amount),
        reason: validated.reason ?? null,
        status,
        approvedById: status === "APPROVED" || status === "APPLIED" ? session.user.id : null,
        approvedAt: status === "APPROVED" || status === "APPLIED" ? new Date() : null,
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

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/fees/waivers error:", error);
    return errorResponse("Failed to create fee waiver");
  }
}
