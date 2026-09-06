import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@corelithzw/db";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@corelithzw/platform/api-utils";
import { reserveIdentifier } from "@corelithzw/platform/id-generator";
import { prisma } from "@corelithzw/db/client";
import { writeSchoolAuditEvent } from "@/lib/schools/audit";
import { schoolPermissionDenial } from "@/lib/schools/permissions";
import {
  apportionBase,
  money,
  multiplyMoney,
  percent,
  rate,
  resolveDocumentCurrency,
  sumMoney,
  taxOn,
  toNumberOrZero,
  UnknownExchangeRateError,
} from "@/lib/schools/money";
import {
  emitSchoolFeeAccountingEvent,
  isDuplicateLiveInvoice,
  refreshFeeInvoiceBalance,
} from "../../_helpers";

const bulkGenerateSchema = z.object({
  termId: z.string().uuid(),
  classId: z.string().uuid().optional(),
  streamId: z.string().uuid().optional(),
  feeStructureId: z.string().uuid(),
  issueDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  dueDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  issueNow: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  /**
   * S-2.4. Defaults to **true**: a bursar re-running a generation after a
   * network wobble means "finish the job", not "raise everybody a second bill".
   * The database refuses the duplicate either way; this decides whether the
   * bursar is told about it as an error or as a count of what was left alone.
   */
  skipExisting: z.boolean().optional(),
});

function parseDate(input: string) {
  return new Date(input);
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;

    const denied = schoolPermissionDenial(session, "schools.fees", "issue");
    if (denied) return errorResponse(denied, 403);
    const companyId = session.user.companyId;

    const body = await request.json();
    const validated = bulkGenerateSchema.parse(body);

    const issueDate = parseDate(validated.issueDate);
    const dueDate = parseDate(validated.dueDate);
    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(dueDate.getTime())) {
      return errorResponse("Invalid issue or due date", 400);
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      return errorResponse("Due date cannot be earlier than issue date", 400);
    }

    // Verify term and fee structure exist
    const [term, feeStructure] = await Promise.all([
      prisma.schoolTerm.findFirst({
        where: { id: validated.termId, companyId },
        select: { id: true, code: true, name: true },
      }),
      prisma.schoolFeeStructure.findFirst({
        where: { id: validated.feeStructureId, companyId },
        include: {
          lines: { orderBy: [{ sortOrder: "asc" }, { feeCode: "asc" }] },
          class: { select: { id: true, code: true, name: true } },
        },
      }),
    ]);

    if (!term) return errorResponse("Invalid term for this company", 400);
    if (!feeStructure) return errorResponse("Invalid fee structure for this company", 400);
    if (feeStructure.lines.length === 0) {
      return errorResponse("Fee structure has no line items", 400);
    }

    // Build student query
    const studentWhere: Prisma.SchoolStudentWhereInput = {
      companyId,
      status: "ACTIVE", // Only generate for active students
    };

    // If classId provided, use it; otherwise use fee structure's class
    if (validated.classId) {
      studentWhere.currentClassId = validated.classId;
    } else {
      studentWhere.currentClassId = feeStructure.classId;
    }

    // Optional stream filter
    if (validated.streamId) {
      studentWhere.currentStreamId = validated.streamId;
    }

    // Fetch eligible students
    const students = await prisma.schoolStudent.findMany({
      where: studentWhere,
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
      },
      orderBy: { studentNo: "asc" },
    });

    if (students.length === 0) {
      return errorResponse("No eligible students found matching criteria", 400);
    }

    // S-2.4. Skipping is the default. The scope of "already has one" matches
    // the partial unique index exactly — same term, same fee structure, not
    // voided — so a boarder who has been billed tuition is still eligible for
    // the boarding run.
    const skipExisting = validated.skipExisting ?? true;
    let eligibleStudents = students;
    if (skipExisting) {
      const existingInvoices = await prisma.schoolFeeInvoice.findMany({
        where: {
          companyId,
          termId: validated.termId,
          feeStructureId: validated.feeStructureId,
          status: { not: "VOIDED" },
          studentId: { in: students.map((s) => s.id) },
        },
        select: { studentId: true },
      });

      const existingStudentIds = new Set(existingInvoices.map((inv) => inv.studentId));
      eligibleStudents = students.filter((s) => !existingStudentIds.has(s.id));

      if (eligibleStudents.length === 0) {
        return successResponse({
          success: true,
          message: "All eligible students already have invoices for this term",
          created: 0,
          skipped: students.length,
          errors: [],
        });
      }
    }

    // S-2.2. Every invoice in a run carries the fee structure's currency, and
    // one rate looked up once — a run that straddled two rates would bill two
    // children in the same class differently.
    let documentCurrency;
    try {
      documentCurrency = await resolveDocumentCurrency({
        companyId,
        currency: feeStructure.currency,
        on: issueDate,
      });
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        return errorResponse(error.message, 400);
      }
      throw error;
    }

    // Prepare line items from fee structure
    const lineTemplate = feeStructure.lines.map((line) => {
      const quantity = rate(1);
      const unitAmount = money(line.amount);
      const taxRate = percent(0);
      const net = multiplyMoney(quantity, unitAmount);
      const taxAmount = taxOn(net, taxRate);
      return {
        feeCode: line.feeCode,
        description: line.description,
        quantity,
        unitAmount,
        taxRate,
        taxAmount,
        lineTotal: net.plus(taxAmount),
      };
    });

    // Generate invoices in batches
    const results = {
      created: 0,
      skipped: students.length - eligibleStudents.length,
      errors: [] as Array<{ studentId: string; studentNo: string; error: string }>,
      /**
       * S-2.8. Every bill this run actually raised, for the audit row below.
       * Collected as it goes so the row can name them rather than count them.
       */
      raised: [] as Array<{
        invoiceId: string;
        invoiceNo: string;
        studentId: string;
        studentNo: string;
        totalAmount: Prisma.Decimal;
      }>,
    };

    // Process in batches of 50 to avoid timeout
    const batchSize = 50;
    for (let i = 0; i < eligibleStudents.length; i += batchSize) {
      const batch = eligibleStudents.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (student) => {
          try {
            const invoiceNo = await reserveIdentifier(prisma, {
              companyId,
              entity: "SCHOOL_FEE_INVOICE",
            });

            const raised = await prisma.$transaction(async (tx) => {
              const invoice = await tx.schoolFeeInvoice.create({
                data: {
                  companyId,
                  invoiceNo,
                  studentId: student.id,
                  termId: validated.termId,
                  feeStructureId: validated.feeStructureId,
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
                    create: lineTemplate.map((line) => ({
                      companyId,
                      feeCode: line.feeCode,
                      description: line.description,
                      quantity: line.quantity,
                      unitAmount: line.unitAmount,
                      taxRate: line.taxRate,
                      taxAmount: line.taxAmount,
                      lineTotal: line.lineTotal,
                    })),
                  },
                },
                select: { id: true, invoiceNo: true },
              });

              // Refresh balance — this is also what stamps `baseAmount`.
              const refreshed = await refreshFeeInvoiceBalance(tx, {
                companyId,
                invoiceId: invoice.id,
              });
              if (!refreshed) throw new Error("Failed to refresh invoice balances");

              // Emit accounting event if issued
              if (validated.issueNow) {
                const issuedInBase = apportionBase({
                  amount: refreshed.totalAmount,
                  part: refreshed.taxTotal,
                  exchangeRate: refreshed.exchangeRate,
                });
                await emitSchoolFeeAccountingEvent({
                  companyId,
                  actorId: session.user.id,
                  eventType: "SCHOOL_FEE_INVOICE_ISSUED",
                  sourceId: invoice.id,
                  sourceRef: invoice.invoiceNo,
                  entryDate: issueDate,
                  // S-2.3: convert the tax, derive the net, so the entry
                  // balances even on a fee sheet that charges VAT.
                  amount: issuedInBase.base,
                  netAmount: issuedInBase.baseRest,
                  taxAmount: issuedInBase.basePart,
                  grossAmount: issuedInBase.base,
                  currency: documentCurrency.baseCurrency,
                  documentCurrency: refreshed.currency,
                  documentAmount: refreshed.totalAmount,
                  exchangeRate: refreshed.exchangeRate,
                  payload: {
                    studentId: student.id,
                    studentNo: student.studentNo,
                    termId: validated.termId,
                    feeStructureId: validated.feeStructureId,
                  },
                });
              }

              return {
                invoiceId: invoice.id,
                invoiceNo: invoice.invoiceNo,
                studentId: student.id,
                studentNo: student.studentNo,
                totalAmount: refreshed.totalAmount,
              };
            });

            // Only what committed. A transaction that rolled back raised no
            // bill and must not appear in the run's audit row.
            results.raised.push(raised);
            results.created += 1;
          } catch (error) {
            // S-2.4. The index is what actually closes the door — two bursars
            // running the same generation at once both pass the pre-check
            // above and one of them loses here. That is a skip, not a failure.
            if (isDuplicateLiveInvoice(error)) {
              results.skipped += 1;
              return;
            }
            console.error(
              `[Bulk Invoice] Failed for student ${student.studentNo}:`,
              error,
            );
            results.errors.push({
              studentId: student.id,
              studentNo: student.studentNo,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }),
      );
    }

    /**
     * S-2.8 — **one event for the run, not one per invoice.**
     *
     * A bursar performed one action: "bill Form 1 for Term 2 off this fee
     * sheet". A hundred rows would multiply that single decision by the size of
     * the class and bury the events that actually need finding — a write-off, a
     * waiver — under a wall of identical rows. So the run gets one row, and it
     * is useless unless it names what it raised: every invoice is listed by id,
     * number, student and amount, so "where did this bill come from" is still
     * answerable from the log.
     *
     * It is written after the invoices rather than inside them because there is
     * no single transaction to be inside — the run is already N transactions by
     * construction, one per student, so that a duplicate for one child does not
     * abort the other ninety-nine. The row is written on a transaction of its
     * own and its failure is not swallowed: a run whose record cannot be
     * written is reported as a failure rather than reported as a success.
     *
     * A run that raised nothing — everything skipped as already billed — moved
     * no money and gets no row.
     */
    if (results.raised.length > 0) {
      await prisma.$transaction((tx) =>
        writeSchoolAuditEvent(tx, {
          companyId,
          actorId: session.user.id,
          eventType: "schools.fee.invoice.bulk-generated",
          // The sheet the run was driven from. There is no "run" entity to
          // point at, and the fee structure is what decided every amount.
          entityType: "SchoolFeeStructure",
          entityId: feeStructure.id,
          payload: {
            termId: validated.termId,
            classId: validated.classId ?? feeStructure.classId,
            streamId: validated.streamId ?? null,
            feeStructureId: feeStructure.id,
            feeStructureName: feeStructure.name,
            currency: documentCurrency.currency,
            issuedImmediately: Boolean(validated.issueNow),
            invoiceCount: results.raised.length,
            // Decimals summed as Decimals, coerced once at the boundary.
            totalBilled: toNumberOrZero(
              sumMoney(results.raised.map((invoice) => invoice.totalAmount)),
            ),
            skipped: results.skipped,
            failed: results.errors.length,
            invoices: results.raised.map((invoice) => ({
              invoiceId: invoice.invoiceId,
              invoiceNo: invoice.invoiceNo,
              studentId: invoice.studentId,
              studentNo: invoice.studentNo,
              totalAmount: toNumberOrZero(invoice.totalAmount),
            })),
          },
        }),
      );
    }

    return successResponse({
      success: true,
      message: `Generated ${results.created} invoices for ${feeStructure.class.name} / ${term.name}`,
      created: results.created,
      skipped: results.skipped,
      errors: results.errors,
      summary: {
        totalEligible: eligibleStudents.length,
        feeStructure: {
          id: feeStructure.id,
          name: feeStructure.name,
          class: feeStructure.class.name,
          term: term.name,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] POST /api/v2/schools/fees/invoices/bulk-generate error:", error);
    return errorResponse("Failed to bulk generate invoices");
  }
}
