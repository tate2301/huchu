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
  termId: z.string().uuid().optional(),
  status: z
    .enum(["DRAFT", "ISSUED", "PART_PAID", "PAID", "VOIDED", "WRITEOFF"])
    .optional(),
  includeLines: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const createLineSchema = z.object({
  feeCode: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(240),
  quantity: z.number().finite().min(0.0001).optional(),
  unitAmount: z.number().finite().min(0),
  taxRate: z.number().finite().min(0).max(100).optional(),
});

const dateInputSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const createSchema = z.object({
  invoiceNo: z.string().trim().min(1).max(40).optional(),
  studentId: z.string().uuid(),
  termId: z.string().uuid(),
  feeStructureId: z.string().uuid().optional(),
  issueDate: dateInputSchema.optional(),
  dueDate: dateInputSchema.optional(),
  description: z.string().trim().max(240).optional(),
  amount: z.number().finite().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  issueNow: z.boolean().optional(),
  lines: z.array(createLineSchema).optional(),
});

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDate(input: string) {
  return new Date(input);
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
      status: searchParams.get("status") ?? undefined,
      includeLines: searchParams.get("includeLines") ?? undefined,
    });

    const where: Prisma.SchoolFeeInvoiceWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.termId) where.termId = query.termId;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { invoiceNo: { contains: query.search, mode: "insensitive" } },
        { student: { studentNo: { contains: query.search, mode: "insensitive" } } },
        { student: { firstName: { contains: query.search, mode: "insensitive" } } },
        { student: { lastName: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    const include = query.includeLines
      ? ({
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
          lines: { orderBy: [{ createdAt: "asc" }] },
          waivers: {
            where: { status: "APPLIED" },
            select: { id: true, amount: true, waiverType: true, appliedAt: true },
          },
          receiptAllocations: {
            include: {
              receipt: {
                select: {
                  id: true,
                  receiptNo: true,
                  receiptDate: true,
                  paymentMethod: true,
                  status: true,
                },
              },
            },
            orderBy: [{ createdAt: "asc" }],
          },
          _count: { select: { lines: true, receiptAllocations: true, waivers: true } },
        } satisfies Prisma.SchoolFeeInvoiceInclude)
      : ({
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
          _count: { select: { lines: true, receiptAllocations: true, waivers: true } },
        } satisfies Prisma.SchoolFeeInvoiceInclude);

    const [records, total] = await Promise.all([
      prisma.schoolFeeInvoice.findMany({
        where,
        include,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
      prisma.schoolFeeInvoice.count({ where }),
    ]);

    return successResponse(paginationResponse(records, total, page, limit));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/fees/invoices error:", error);
    return errorResponse("Failed to fetch fee invoices");
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
    const isLegacyDerivedFlow =
      validated.amount !== undefined || validated.description !== undefined;

    if (!isLegacyDerivedFlow && (!validated.issueDate || !validated.dueDate)) {
      return errorResponse("issueDate and dueDate are required", 400);
    }

    const issueDateInput =
      validated.issueDate ??
      (isLegacyDerivedFlow ? new Date().toISOString() : undefined);
    const dueDateInput =
      validated.dueDate ??
      validated.issueDate ??
      (isLegacyDerivedFlow ? new Date().toISOString() : undefined);

    if (!issueDateInput || !dueDateInput) {
      return errorResponse("issueDate and dueDate are required", 400);
    }

    const issueDate = parseDate(issueDateInput);
    const dueDate = parseDate(dueDateInput);
    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      return errorResponse("Invalid issue or due date", 400);
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      return errorResponse("Due date cannot be earlier than issue date", 400);
    }

    const [student, term, feeStructure] = await Promise.all([
      prisma.schoolStudent.findFirst({
        where: { id: validated.studentId, companyId },
        select: { id: true, studentNo: true, currentClassId: true },
      }),
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true },
      }),
      validated.feeStructureId
        ? prisma.schoolFeeStructure.findFirst({
            where: { id: validated.feeStructureId, companyId },
            include: { lines: true },
          })
        : Promise.resolve(null),
    ]);

    if (!student) return errorResponse("Invalid student for this company", 400);
    if (!term) return errorResponse("Invalid term for this company", 400);
    if (validated.feeStructureId && !feeStructure) {
      return errorResponse("Invalid fee structure for this company", 400);
    }

    if (
      feeStructure &&
      student.currentClassId &&
      feeStructure.classId !== student.currentClassId
    ) {
      return errorResponse("Fee structure class does not match student current class", 400);
    }

    const hasManualLines = Boolean(validated.lines && validated.lines.length > 0);
    const useDerivedLineFlow =
      isLegacyDerivedFlow && !hasManualLines && !validated.feeStructureId;

    if (useDerivedLineFlow) {
      if (validated.amount === undefined || validated.amount <= 0) {
        return errorResponse(
          "Amount must be greater than zero for invoice quick-create",
          400,
        );
      }
    }

    const derivedLineDescription = validated.description?.trim() || "School fee";

    const sourceLines =
      hasManualLines
        ? validated.lines!.map((line) => ({
            feeCode: line.feeCode.toUpperCase(),
            description: line.description,
            quantity: line.quantity ?? 1,
            unitAmount: line.unitAmount,
            taxRate: line.taxRate ?? 0,
          }))
        : feeStructure?.lines.map((line) => ({
            feeCode: line.feeCode,
            description: line.description,
            quantity: 1,
            unitAmount: line.amount,
            taxRate: 0,
          })) ??
          (useDerivedLineFlow
            ? [
                {
                  feeCode: "MANUAL",
                  description: derivedLineDescription,
                  quantity: 1,
                  unitAmount: validated.amount!,
                  taxRate: 0,
                },
              ]
            : []);

    if (sourceLines.length === 0) {
      return errorResponse(
        "Provide invoice lines directly or select a fee structure with at least one line",
        400,
      );
    }

    if (new Set(sourceLines.map((line) => line.feeCode)).size !== sourceLines.length) {
      return errorResponse("Duplicate fee codes in invoice lines are not allowed", 400);
    }

    let invoiceNo: string;
    try {
      invoiceNo = validated.invoiceNo
        ? normalizeProvidedId(validated.invoiceNo, "SCHOOL_FEE_INVOICE")
        : await reserveIdentifier(prisma, {
            companyId,
            entity: "SCHOOL_FEE_INVOICE",
          });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid fee invoice number format";
      return errorResponse(message, 400);
    }

    const created = await prisma.$transaction(async (tx) => {
      const invoice = await tx.schoolFeeInvoice.create({
        data: {
          companyId,
          invoiceNo,
          studentId: validated.studentId,
          termId: validated.termId,
          feeStructureId: validated.feeStructureId ?? null,
          issueDate,
          dueDate,
          status: validated.issueNow ? "ISSUED" : "DRAFT",
          notes: validated.notes ?? null,
          createdById: session.user.id,
          issuedById: validated.issueNow ? session.user.id : null,
          issuedAt: validated.issueNow ? new Date() : null,
          lines: {
            create: sourceLines.map((line) => {
              const quantity = toMoney(line.quantity);
              const unitAmount = toMoney(line.unitAmount);
              const net = toMoney(quantity * unitAmount);
              const taxAmount = toMoney((net * line.taxRate) / 100);
              const lineTotal = toMoney(net + taxAmount);
              return {
                companyId,
                feeCode: line.feeCode,
                description: line.description,
                quantity,
                unitAmount,
                taxRate: toMoney(line.taxRate),
                taxAmount,
                lineTotal,
              };
            }),
          },
        },
      });

      const refreshed = await refreshFeeInvoiceBalance(tx, {
        companyId,
        invoiceId: invoice.id,
      });
      if (!refreshed) throw new Error("Failed to refresh invoice balances");

      return tx.schoolFeeInvoice.findUnique({
        where: { id: invoice.id },
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
          feeStructure: { select: { id: true, name: true, currency: true } },
          lines: { orderBy: [{ createdAt: "asc" }] },
          _count: { select: { lines: true, receiptAllocations: true, waivers: true } },
        },
      });
    });

    if (!created) return errorResponse("Failed to create fee invoice", 500);

    if (created.status === "ISSUED") {
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_INVOICE_ISSUED",
        sourceId: created.id,
        sourceRef: created.invoiceNo,
        entryDate: created.issueDate,
        amount: created.totalAmount,
        netAmount: created.subTotal,
        taxAmount: created.taxTotal,
        grossAmount: created.totalAmount,
        currency: created.feeStructure?.currency ?? "USD",
        payload: {
          invoiceNo: created.invoiceNo,
          studentId: created.studentId,
          termId: created.termId,
          status: created.status,
        },
      }).catch((error) => {
        console.error("[Accounting] School fee invoice event capture failed:", error);
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
      return errorResponse("Fee invoice number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/fees/invoices error:", error);
    return errorResponse("Failed to create fee invoice");
  }
}
