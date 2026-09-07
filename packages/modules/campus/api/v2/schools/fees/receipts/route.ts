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
import { schoolPermissionDenial } from "../../../../../permissions";
import {
  apportionBase,
  exceeds,
  money,
  resolveDocumentCurrency,
  sumMoney,
  toBaseAmount,
  toNumberOrZero,
  UnknownExchangeRateError,
} from "../../../../../money";
import { writeSchoolAuditEvent } from "../../../../../audit";
import {
  tryIssueSchoolFeeReceiptFiscalisation,
  type SchoolFiscalOutcome,
} from "../../../../../fiscalisation";
import {
  emitSchoolFeeAccountingEvent,
  FeeCreditError,
  isFeeCreditCheckViolation,
  loadInvoicesForAllocation,
  refreshFeeInvoiceBalance,
  spreadOverInvoices,
  type SchoolFeePostingResult,
} from "../../../../../fees-posting";

const querySchema = z.object({
  search: z.string().trim().min(1).optional(),
  studentId: z.string().uuid().optional(),
  /**
   * The pupil's current year group. Filtered through the student rather than a
   * column on the receipt, for the same reason the invoice route does it: the
   * class belongs to the child, and a copy on the receipt would give two
   * answers the moment they move up.
   */
  classId: z.string().uuid().optional(),
  /** Inclusive receipt-date window — "everything banked this week". */
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

const dateInputSchema = z
  .string()
  .datetime()
  .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/));

const paymentMethodSchema = z.enum([
  "CASH",
  "BANK_TRANSFER",
  "CARD",
  "MOBILE_MONEY",
]);

const createSchema = z.object({
  receiptNo: z.string().trim().min(1).max(40).optional(),
  studentId: z.string().uuid().optional(),
  receiptDate: dateInputSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  method: z.string().trim().min(1).max(40).optional(),
  reference: z.string().trim().max(120).nullable().optional(),
  amountReceived: z.number().finite().positive().optional(),
  amount: z.number().finite().optional(),
  /** S-2.2. Omitted means the school's own currency. */
  currency: z.string().trim().min(3).max(10).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  postNow: z.boolean().optional(),
  allocations: z.array(allocationSchema).optional(),
  invoiceId: z.string().uuid().optional(),
});

function normalizePaymentMethod(
  value: string,
): z.infer<typeof paymentMethodSchema> | null {
  const canonical = value.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const condensed = canonical.replace(/_/g, "");

  if (canonical === "CASH" || condensed === "CASH") return "CASH";
  if (
    canonical === "BANK_TRANSFER" ||
    condensed === "BANKTRANSFER" ||
    canonical === "BANK" ||
    canonical === "TRANSFER"
  ) {
    return "BANK_TRANSFER";
  }
  if (canonical === "CARD" || condensed === "CARD") return "CARD";
  if (
    canonical === "MOBILE_MONEY" ||
    condensed === "MOBILEMONEY" ||
    canonical === "MOMO"
  ) {
    return "MOBILE_MONEY";
  }
  return null;
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
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      includeAllocations: searchParams.get("includeAllocations") ?? undefined,
    });

    const where: Prisma.SchoolFeeReceiptWhereInput = { companyId };
    if (query.studentId) where.studentId = query.studentId;
    if (query.classId) where.student = { currentClassId: query.classId };
    if (query.from || query.to) {
      where.receiptDate = {
        ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
        // The window is inclusive of its last day, so a bursar asking for
        // "up to the 20th" is not silently told about the 19th.
        ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
      };
    }
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
          // S-2.7. The fiscal number is the one thing a parent needs off a
          // ZIMRA receipt, and until now nothing in the product carried it out
          // of the database.
          fiscalReceipt: {
            select: { id: true, status: true, fiscalNumber: true },
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
          // S-2.7. The fiscal number is the one thing a parent needs off a
          // ZIMRA receipt, and until now nothing in the product carried it out
          // of the database.
          fiscalReceipt: {
            select: { id: true, status: true, fiscalNumber: true },
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

    const denied = schoolPermissionDenial(session, "schools.fees", "receive-payment");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = createSchema.parse(body);
    const isLegacyDerivedFlow =
      validated.invoiceId !== undefined ||
      validated.amount !== undefined ||
      validated.method !== undefined;

    if (!isLegacyDerivedFlow) {
      if (!validated.studentId) return errorResponse("studentId is required", 400);
      if (!validated.receiptDate) return errorResponse("receiptDate is required", 400);
      if (!validated.paymentMethod) return errorResponse("paymentMethod is required", 400);
      if (validated.amountReceived === undefined) {
        return errorResponse("amountReceived is required", 400);
      }
    }

    if (
      validated.amountReceived !== undefined &&
      validated.amount !== undefined &&
      !money(validated.amountReceived).equals(money(validated.amount))
    ) {
      return errorResponse("amount and amountReceived do not match", 400);
    }

    const amountReceived = validated.amountReceived ?? validated.amount;
    if (amountReceived === undefined || amountReceived <= 0) {
      return errorResponse("Amount received must be greater than zero", 400);
    }

    const legacyPaymentMethod = validated.method
      ? normalizePaymentMethod(validated.method)
      : null;
    if (validated.method && !legacyPaymentMethod && !validated.paymentMethod) {
      return errorResponse("Invalid payment method", 400);
    }
    if (
      validated.paymentMethod &&
      legacyPaymentMethod &&
      validated.paymentMethod !== legacyPaymentMethod
    ) {
      return errorResponse("paymentMethod and method do not match", 400);
    }
    const paymentMethod = validated.paymentMethod ?? legacyPaymentMethod;
    if (!paymentMethod) return errorResponse("paymentMethod is required", 400);

    const receiptDateInput =
      validated.receiptDate ??
      (isLegacyDerivedFlow ? new Date().toISOString() : undefined);
    if (!receiptDateInput) return errorResponse("receiptDate is required", 400);

    const receiptDate = new Date(receiptDateInput);
    if (Number.isNaN(receiptDate.getTime())) {
      return errorResponse("Invalid receipt date", 400);
    }

    // S-2.5. The explicit-allocations flow names its own amounts; the derived
    // flow ("here is a payment against this invoice") does not, and it is the
    // one a parent overpays through. `settleFromAmount` marks the second, so
    // that inside the transaction the amount can be spread over the invoice's
    // real balance and the surplus carried, rather than the whole payment being
    // refused for being fifty dollars too generous.
    const explicitAllocations =
      validated.allocations && validated.allocations.length > 0
        ? validated.allocations
        : null;
    const settleFromAmount = !explicitAllocations && Boolean(validated.invoiceId);
    const invoiceIds = explicitAllocations
      ? explicitAllocations.map((allocation) => allocation.invoiceId)
      : validated.invoiceId
        ? [validated.invoiceId]
        : [];

    if (invoiceIds.length > 0 && new Set(invoiceIds).size !== invoiceIds.length) {
      return errorResponse("Duplicate invoice allocations are not allowed", 400);
    }

    // Read once here to derive the student and the currency, which the receipt
    // must be stamped with before the transaction opens. Every figure the
    // allocation decision rests on is read again under `FOR UPDATE` inside it —
    // these rows are for identification, not for arithmetic.
    const invoices =
      invoiceIds.length > 0
        ? await prisma.schoolFeeInvoice.findMany({
            where: {
              companyId,
              id: { in: invoiceIds },
            },
            select: {
              id: true,
              invoiceNo: true,
              studentId: true,
              status: true,
              balanceAmount: true,
              currency: true,
            },
          })
        : [];
    if (invoices.length !== invoiceIds.length) {
      return errorResponse("One or more allocated invoices are invalid", 400);
    }

    let studentId = validated.studentId;
    if (!studentId && invoices.length > 0) {
      const allocationStudentIds = new Set(invoices.map((invoice) => invoice.studentId));
      if (allocationStudentIds.size !== 1) {
        return errorResponse(
          "Cannot derive student from allocations spanning multiple students",
          400,
        );
      }
      studentId = invoices[0].studentId;
    }
    if (!studentId) return errorResponse("studentId is required", 400);

    const student = await prisma.schoolStudent.findFirst({
      where: { id: studentId, companyId },
      select: { id: true, studentNo: true },
    });
    if (!student) return errorResponse("Invalid student for this company", 400);

    // S-2.2. A receipt takes the currency of what it is settling. Where the
    // request names one and the invoices disagree, the invoices win — money
    // cannot be allocated across a currency boundary without a conversion
    // nobody has authorised.
    const allocatedCurrencies = new Set(invoices.map((invoice) => invoice.currency));
    if (allocatedCurrencies.size > 1) {
      return errorResponse(
        "Allocated invoices are in more than one currency; receipt one currency at a time",
        400,
      );
    }
    const requestedCurrency = validated.currency?.trim().toUpperCase();
    const invoiceCurrency = [...allocatedCurrencies][0];
    if (requestedCurrency && invoiceCurrency && requestedCurrency !== invoiceCurrency) {
      return errorResponse(
        `Receipt currency ${requestedCurrency} does not match the invoice currency ${invoiceCurrency}`,
        400,
      );
    }

    let documentCurrency;
    try {
      documentCurrency = await resolveDocumentCurrency({
        companyId,
        currency: invoiceCurrency ?? requestedCurrency,
        on: receiptDate,
      });
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        return errorResponse(error.message, 400);
      }
      throw error;
    }

    // Post S-2.1 Float→Decimal: exact comparisons replace the `> 0.009`
    // epsilon fudges. There is no float error left for them to absorb, and a
    // tolerance that quietly accepts half a cent over is a tolerance that
    // quietly accepts half a cent over.
    const receiptAmount = money(amountReceived);
    if (
      explicitAllocations &&
      exceeds(
        sumMoney(explicitAllocations.map((item) => item.allocatedAmount)),
        receiptAmount,
      )
    ) {
      return errorResponse("Total allocation exceeds amount received", 400);
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

    const resolvedStudentId = studentId;
    const created = await prisma.$transaction(async (tx) => {
      // S-2.5 — the allocation decision, taken against locked rows. Reading
      // the balances outside the transaction and trusting them inside is how
      // two bursars at two desks each allocate the same $450.
      const locked = await loadInvoicesForAllocation(tx, {
        companyId,
        studentId: resolvedStudentId,
        currency: documentCurrency.currency,
        invoiceIds,
      });

      let allocations: Array<{ invoiceId: string; allocatedAmount: Prisma.Decimal }>;
      if (settleFromAmount) {
        // The payment settles what it can and the rest becomes credit.
        const ordered = invoiceIds
          .map((id) => locked.get(id))
          .filter((invoice): invoice is NonNullable<typeof invoice> => Boolean(invoice));
        allocations = spreadOverInvoices(receiptAmount, ordered).allocations;
      } else {
        allocations = (explicitAllocations ?? []).map((allocation) => ({
          invoiceId: allocation.invoiceId,
          allocatedAmount: money(allocation.allocatedAmount),
        }));
        for (const allocation of allocations) {
          const invoice = locked.get(allocation.invoiceId);
          if (!invoice) {
            throw new FeeCreditError("One or more allocated invoices are invalid", 400);
          }
          // A named amount over the balance is a typo, not an overpayment: the
          // bursar said which invoice and how much, and one of the two is
          // wrong. An overpayment arrives as a receipt larger than the sum of
          // its allocations, and that is carried, not refused.
          if (exceeds(allocation.allocatedAmount, invoice.balanceAmount)) {
            throw new FeeCreditError(
              `Allocation exceeds the outstanding balance on invoice ${invoice.invoiceNo}`,
              400,
            );
          }
        }
      }

      const amountAllocated = sumMoney(
        allocations.map((allocation) => allocation.allocatedAmount),
      );
      const amountUnallocated = receiptAmount.minus(amountAllocated);
      if (amountUnallocated.isNegative()) {
        throw new FeeCreditError("Total allocation exceeds amount received", 400);
      }

      const receipt = await tx.schoolFeeReceipt.create({
        data: {
          companyId,
          receiptNo,
          studentId: resolvedStudentId,
          receiptDate,
          paymentMethod,
          reference: validated.reference ?? null,
          amountReceived: receiptAmount,
          amountAllocated,
          // S-2.5. The surplus is carried here rather than dropped. The
          // `SchoolFeeReceipt_split_adds_up_check` constraint means no future
          // code path can drop it either.
          amountUnallocated,
          currency: documentCurrency.currency,
          exchangeRate: documentCurrency.exchangeRate,
          baseAmount: toBaseAmount(receiptAmount, documentCurrency.exchangeRate),
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
                    allocatedAmount: allocation.allocatedAmount,
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

      await writeSchoolAuditEvent(tx, {
        companyId,
        actorId: session.user.id,
        eventType: "schools.fee.receipt.recorded",
        entityType: "SchoolFeeReceipt",
        entityId: receipt.id,
        payload: {
          receiptNo,
          studentId: resolvedStudentId,
          currency: documentCurrency.currency,
          amountReceived: toNumberOrZero(receiptAmount),
          amountAllocated: toNumberOrZero(amountAllocated),
          amountUnallocated: toNumberOrZero(amountUnallocated),
          paymentMethod,
          status: receipt.status,
        },
      });

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

    // The posting outcome travels back with the receipt. Swallowing it would
    // put the school exactly where it was before: money taken, ledger silent,
    // and nobody told until a reconciliation months later.
    let accounting: SchoolFeePostingResult | null = null;
    if (created.status === "POSTED") {
      // S-2.3. What settled a bill and what did not are two different accounts:
      // the settled part clears the family's receivable, the surplus is money
      // the school owes back until an invoice claims it. Apportioned rather
      // than converted twice, so the two halves add up to the cent.
      const receivedInBase = apportionBase({
        amount: created.amountReceived,
        part: created.amountAllocated,
        exchangeRate: created.exchangeRate,
      });
      accounting = await emitSchoolFeeAccountingEvent({
        actorRole: session.user.role,
        companyId,
        actorId: session.user.id,
        eventType: "SCHOOL_FEE_RECEIPT_POSTED",
        sourceId: created.id,
        sourceRef: created.receiptNo,
        entryDate: created.receiptDate,
        // S-2.2: the ledger takes the base-currency figure.
        amount: created.baseAmount,
        netAmount: created.baseAmount,
        taxAmount: 0,
        grossAmount: created.baseAmount,
        allocatedAmount: receivedInBase.basePart,
        currency: documentCurrency.baseCurrency,
        documentCurrency: created.currency,
        documentAmount: created.amountReceived,
        exchangeRate: created.exchangeRate,
        payload: {
          receiptNo: created.receiptNo,
          studentId: created.studentId,
          allocationCount: created.allocations.length,
          allocations: created.allocations.map((allocation) => ({
            invoiceId: allocation.invoiceId,
            // Post S-2.1 Float→Decimal: a `Prisma.Decimal` dropped into a
            // `Record<string, unknown>` payload is not a type error, and
            // `JSON.stringify` would silently store it as a string.
            allocatedAmount: toNumberOrZero(allocation.allocatedAmount),
          })),
        },
      }).catch((error) => {
        console.error("[Accounting] School fee receipt posting failed:", error);
        return {
          accountingStatus: "FAILED" as const,
          journalEntryId: null,
          accountingError:
            error instanceof Error ? error.message : "Accounting posting failed",
        };
      });
    }

    // S-2.7. The ZIMRA leg, and it runs last for a reason: the money is taken,
    // the invoices are settled and the ledger has been told before FDMS is
    // dialled. A school without the add-on gets `SKIPPED` without a query
    // leaving the process; a school with it gets whatever the connector said,
    // and a failure leaves a retryable `FiscalReceipt` row rather than losing
    // the payment. `tryIssue…` cannot throw.
    const fiscal: SchoolFiscalOutcome | null =
      created.status === "POSTED"
        ? await tryIssueSchoolFeeReceiptFiscalisation({
            companyId,
            receiptId: created.id,
          })
        : null;

    return successResponse({ ...created, accounting, fiscal }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    if (error instanceof FeeCreditError) {
      return errorResponse(error.message, error.status);
    }
    if (isFeeCreditCheckViolation(error)) {
      return errorResponse(
        "That payment no longer matches the invoice balances; reload and try again",
        409,
      );
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
