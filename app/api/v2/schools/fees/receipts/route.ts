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
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  emitSchoolFeeAccountingEvent,
  refreshFeeInvoiceBalance,
} from "../_helpers";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  status: z.enum(["DRAFT", "POSTED", "VOIDED"]).optional(),
  includeAllocations: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const allocationSchema = z.object({
  invoiceId: z.string().uuid(),
  allocatedAmount: z.number().finite().positive(),
});

const createSchema = z.object({
  receiptNo: z.string().trim().min(1).max(40).optional(),
  studentId: z.string().uuid(),
  receiptDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  paymentMethod: z.enum(["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY"]),
  reference: z.string().trim().max(120).nullable().optional(),
  amountReceived: z.number().finite().positive(),
  notes: z.string().trim().max(1000).nullable().optional(),
  postNow: z.boolean().optional(),
  allocations: z.array(allocationSchema).optional(),
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
      status: searchParams.get("status") ?? undefined,
      includeAllocations: searchParams.get("includeAllocations") ?? undefined,
    });

    const where: Prisma.SchoolFeeReceiptWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { receiptNo: { contains: query.search, mode: "insensitive" } },
        { reference: { contains: query.search, mode: "insensitive" } },
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const include = query.includeAllocations
      ? ({
          student: {
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
            },
          },
          allocations: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNo: true,
                  status: true,
                  balanceAmount: true,
                  dueDate: true,
                },
              },
            },
            orderBy: [{ createdAt: "asc" }],
          },
          _count: { select: { allocations: true } },
        } satisfies Prisma.SchoolFeeReceiptInclude)
      : ({
          student: {
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
            },
          },
          _count: { select: { allocations: true } },
        } satisfies Prisma.SchoolFeeReceiptInclude);

    const [records, total] = await Promise.all([
      prisma.schoolFeeReceipt.findMany({
        where,
        include,
        orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolFeeReceipt.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/fees/receipts error:", error);
    return errorResponse("Failed to fetch fee receipts");
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
    const allocations = validated.allocations ?? [];

    const receiptDate = new Date(validated.receiptDate);
    if (Number.isNaN(receiptDate.getTime())) {
      return errorResponse("Invalid receipt date", 400);
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id: validated.studentId, companyId },
      select: { id: true, studentNo: true },
    });
    if (!student) return errorResponse("Invalid student for this company", 400);

    const receiptAllocationSum = toMoney(
      allocations.reduce((sum, item) => sum + item.allocatedAmount, 0),
    );
    if (receiptAllocationSum - validated.amountReceived > 0.009) {
      return errorResponse("Total allocation exceeds amount received", 400);
    }

    if (allocations.length > 0) {
      const invoiceIds = allocations.map((allocation) => allocation.invoiceId);
      if (new Set(invoiceIds).size !== invoiceIds.length) {
        return errorResponse("Duplicate invoice allocations are not allowed", 400);
      }

      const invoices = await prisma.schoolFeeInvoice.findMany({
        where: {
          companyId,
          id: { in: invoiceIds },
          studentId: validated.studentId,
        },
        select: {
          id: true,
          status: true,
          balanceAmount: true,
        },
      });
      if (invoices.length !== invoiceIds.length) {
        return errorResponse("One or more allocated invoices are invalid", 400);
      }

      const invoiceMap = new Map(invoices.map((invoice) => [invoice.id, invoice]));
      for (const allocation of allocations) {
        const invoice = invoiceMap.get(allocation.invoiceId);
        if (!invoice) return errorResponse("Allocated invoice is invalid", 400);
        if (invoice.status === "VOIDED" || invoice.status === "WRITEOFF") {
          return errorResponse("Cannot allocate against voided or written-off invoice", 400);
        }
        if (allocation.allocatedAmount - invoice.balanceAmount > 0.009) {
          return errorResponse("Allocation exceeds invoice outstanding balance", 400);
        }
      }
    }

    let receiptNo: string;
    try {
      receiptNo = validated.receiptNo
        ? normalizeProvidedId(validated.receiptNo, "SCHOOL_FEE_RECEIPT")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_FEE_RECEIPT",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid fee receipt number format";
      return errorResponse(message, 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const receipt = await tx.schoolFeeReceipt.create({
        data: {
          companyId,
          receiptNo,
          studentId: validated.studentId,
          receiptDate,
          paymentMethod: validated.paymentMethod,
          reference: validated.reference ?? null,
          amountReceived: toMoney(validated.amountReceived),
          amountAllocated: receiptAllocationSum,
          amountUnallocated: toMoney(validated.amountReceived - receiptAllocationSum),
          status: validated.postNow === false ? "DRAFT" : "POSTED",
          notes: validated.notes ?? null,
          createdById: session.user.id,
          postedById: validated.postNow === false ? null : session.user.id,
          postedAt: validated.postNow === false ? null : new Date(),
          allocations:
            allocations.length > 0
              ? {
                  create: allocations.map((allocation) => ({
                    companyId,
                    invoiceId: allocation.invoiceId,
                    allocatedAmount: toMoney(allocation.allocatedAmount),
                  })),
                }
              : undefined,
        },
      });

      if (receipt.status === "POSTED" && allocations.length > 0) {
        for (const allocation of allocations) {
          await refreshFeeInvoiceBalance(tx, {
            companyId,
            invoiceId: allocation.invoiceId,
          });
        }
      }

      return tx.schoolFeeReceipt.findUnique({
        where: { id: receipt.id },
        include: {
          student: {
            select: {
              id: true,
              studentNo: true,
              firstName: true,
              lastName: true,
            },
          },
          allocations: {
            include: {
              invoice: {
                select: {
                  id: true,
                  invoiceNo: true,
                  status: true,
                  balanceAmount: true,
                },
              },
            },
            orderBy: [{ createdAt: "asc" }],
          },
        },
      });
    });

    if (!created) return errorResponse("Failed to create fee receipt", 500);

    if (created.status === "POSTED") {
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_RECEIPT_POSTED",
        sourceId: created.id,
        sourceRef: created.receiptNo,
        entryDate: created.receiptDate,
        amount: created.amountReceived,
        netAmount: created.amountReceived,
        taxAmount: 0,
        grossAmount: created.amountReceived,
        payload: {
          receiptNo: created.receiptNo,
          studentId: created.studentId,
          allocationCount: created.allocations.length,
          allocations: created.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            allocatedAmount: allocation.allocatedAmount,
          })),
        },
      }).catch((error) => {
        console.error("[Accounting] School fee receipt event capture failed:", error);
      });
    }

    return successResponse(created, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return errorResponse("Fee receipt number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/fees/receipts error:", error);
    return errorResponse("Failed to create fee receipt");
  }
}
