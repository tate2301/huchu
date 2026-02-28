import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { normalizeProvidedId, reserveIdentifier } from "@/lib/id-generator";
import { prisma } from "@/lib/prisma";
import {
  emitSchoolFeeAccountingEvent,
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
  skipExisting: z.boolean().optional(), // Skip students who already have invoice for term
});

function toMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseDate(input: string) {
  return new Date(input);
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
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
    const studentWhere: any = {
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

    // If skipExisting, filter out students with existing invoices
    let eligibleStudents = students;
    if (validated.skipExisting) {
      const existingInvoices = await prisma.schoolFeeInvoice.findMany({
        where: {
          companyId,
          termId: validated.termId,
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

    // Prepare line items from fee structure
    const lineTemplate = feeStructure.lines.map((line) => ({
      feeCode: line.feeCode,
      description: line.description,
      quantity: 1,
      unitAmount: line.amount,
      taxRate: 0,
    }));

    // Generate invoices in batches
    const results = {
      created: 0,
      skipped: 0,
      errors: [] as Array<{ studentId: string; studentNo: string; error: string }>,
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

            await prisma.$transaction(async (tx) => {
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
                  notes: validated.notes ?? null,
                  createdById: session.user.id,
                  issuedById: validated.issueNow ? session.user.id : null,
                  issuedAt: validated.issueNow ? new Date() : null,
                  lines: {
                    create: lineTemplate.map((line) => {
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
                select: { id: true, invoiceNo: true, totalAmount: true },
              });

              // Refresh balance
              await refreshFeeInvoiceBalance(tx, {
                companyId,
                invoiceId: invoice.id,
              });

              // Emit accounting event if issued
              if (validated.issueNow) {
                await emitSchoolFeeAccountingEvent({
                  companyId,
                  actorId: session.user.id,
                  eventType: "SCHOOL_FEE_INVOICE_ISSUED",
                  sourceId: invoice.id,
                  sourceRef: invoice.invoiceNo,
                  entryDate: issueDate,
                  amount: invoice.totalAmount,
                  payload: {
                    studentId: student.id,
                    studentNo: student.studentNo,
                    termId: validated.termId,
                    feeStructureId: validated.feeStructureId,
                  },
                });
              }
            });

            results.created += 1;
          } catch (error) {
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
