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
  apportionBase,
  money,
  multiplyMoney,
  percent,
  rate,
  resolveDocumentCurrency,
  taxOn,
  toNumberOrZero,
  UnknownExchangeRateError,
} from "@corelithzw/module-campus/money";
import {
  emitSchoolFeeAccountingEvent,
  isDuplicateLiveInvoice,
  refreshFeeInvoiceBalance,
} from "@corelithzw/module-campus/fees-posting";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  /**
   * The year group a bursar is chasing. Filtered through the student's current
   * class rather than stored on the invoice: an invoice belongs to a student
   * and a term, and the class is the student's, so copying it here would give
   * two answers the moment a child moves up.
   */
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
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
  /**
   * S-2.2. Omitted means the school's own currency, so an existing tenant sees
   * no change. A fee structure's currency wins over this, because the price
   * sheet is what the family was quoted.
   */
  currency: z.string().trim().min(3).max(10).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  issueNow: z.boolean().optional(),
  lines: z.array(createLineSchema).optional(),
});

function parseDate(input: string) {
  return new Date(input);
}

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
      streamId: searchParams.get("streamId") ?? undefined,
      termId: searchParams.get("termId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      includeLines: searchParams.get("includeLines") ?? undefined,
    });

    const where: Prisma.SchoolFeeInvoiceWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.classId || query.streamId) {
      where.student = {
        ...(query.classId ? { currentClassId: query.classId } : {}),
        ...(query.streamId ? { currentStreamId: query.streamId } : {}),
      };
    }
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

    const denied = schoolPermissionDenial(session, "schools.fees", "create");
    if (denied) return errorResponse(denied, 403);
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

    // S-2.2. A structure's own currency is what the family was quoted, so it
    // beats anything the request asks for.
    let documentCurrency;
    try {
      documentCurrency = await resolveDocumentCurrency({
        companyId,
        currency: feeStructure?.currency ?? validated.currency,
        on: issueDate,
      });
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        return errorResponse(error.message, 400);
      }
      throw error;
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
          currency: documentCurrency.currency,
          exchangeRate: documentCurrency.exchangeRate,
          notes: validated.notes ?? null,
          createdById: session.user.id,
          issuedById: validated.issueNow ? session.user.id : null,
          issuedAt: validated.issueNow ? new Date() : null,
          lines: {
            create: sourceLines.map((line) => {
              const quantity = rate(line.quantity);
              const unitAmount = money(line.unitAmount);
              const taxRate = percent(line.taxRate);
              const net = multiplyMoney(quantity, unitAmount);
              const taxAmount = taxOn(net, taxRate);
              return {
                companyId,
                feeCode: line.feeCode,
                description: line.description,
                quantity,
                unitAmount,
                taxRate,
                taxAmount,
                lineTotal: net.plus(taxAmount),
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

      // S-2.8. Raising a bill is where a family's debt begins, so it is the
      // first thing "why does this family owe this" has to be traceable to.
      // Written on `tx`, so a bill and the record of who raised it cannot
      // disagree about whether they happened.
      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.invoice.created",
        entityType: "SchoolFeeInvoice",
        entityId: invoice.id,
        payload: {
          invoiceNo,
          studentId: validated.studentId,
          termId: validated.termId,
          feeStructureId: validated.feeStructureId ?? null,
          currency: refreshed.currency,
          // `Decimal` in, `number` out — deliberately, at the JSON boundary.
          totalAmount: toNumberOrZero(refreshed.totalAmount),
          balanceAmount: toNumberOrZero(refreshed.balanceAmount),
          lineCount: sourceLines.length,
          status: refreshed.status,
          issueDate: issueDate.toISOString(),
          dueDate: dueDate.toISOString(),
        },
      });

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
      const issuedInBase = apportionBase({
        amount: created.totalAmount,
        part: created.taxTotal,
        exchangeRate: created.exchangeRate,
      });
      await emitSchoolFeeAccountingEvent({
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_INVOICE_ISSUED",
        sourceId: created.id,
        sourceRef: created.invoiceNo,
        entryDate: created.issueDate,
        // S-2.2: the ledger is kept in the school's base currency, so the
        // base-currency figures are what post. The billed amounts ride along in
        // the payload.
        amount: issuedInBase.base,
        // S-2.3: convert the tax, derive the net. See the issue route.
        netAmount: issuedInBase.baseRest,
        taxAmount: issuedInBase.basePart,
        grossAmount: issuedInBase.base,
        currency: documentCurrency.baseCurrency,
        documentCurrency: created.currency,
        documentAmount: created.totalAmount,
        exchangeRate: created.exchangeRate,
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
      // S-2.4. The partial unique index reports itself by name, and a bursar
      // needs to be told which of the two collisions they hit.
      if (isDuplicateLiveInvoice(error)) {
        return errorResponse(
          "This student already has an invoice for this term and fee structure",
          409,
        );
      }
      return errorResponse("Fee invoice number already exists", 409);
    }
    console.error("[API] POST /api/v2/schools/fees/invoices error:", error);
    return errorResponse("Failed to create fee invoice");
  }
}
