import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@corelithzw/platform/api-utils";
import { prisma } from "@corelithzw/db/client";
import { clampAtZero, sumMoney } from "@corelithzw/module-campus/money";
import {
  canViewAnyPortalSubject,
  consentDeniedMessage,
  getGuardianChildLink,
  guardianMaySee,
  resolvePortalGuardian,
} from "@corelithzw/module-campus/portal-identity";

type RouteParams = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardianId = searchParams.get("guardianId");

    if (!canViewAnyPortalSubject(session.user.role)) {
      // A parent's own account is the only guardian context they get. The
      // previous code looked the guardian up by whatever `guardianId` was
      // passed and only compared it afterwards, so the comparison could never
      // fail — any parent could read another family's fees by guessing an id.
      const resolution = await resolvePortalGuardian(
        {
          companyId,
          userId: session.user.id,
          role: session.user.role,
          requestedId: guardianId,
        },
        { select: { id: true } },
      );

      if (resolution.kind === "forbidden") {
        return errorResponse("Cannot query fees for a different guardian context", 403);
      }
      if (!resolution.subject) {
        return errorResponse("Guardian context not found", 404);
      }

      const link = await getGuardianChildLink({
        companyId,
        guardianId: resolution.subject.id,
        studentId,
      });

      if (!link) {
        return errorResponse("Student is not linked to this parent account", 403);
      }
      if (!guardianMaySee(link, "financials")) {
        return errorResponse(consentDeniedMessage("financials"), 403);
      }
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id: studentId, companyId },
      select: {
        id: true,
        studentNo: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!student) return errorResponse("Student not found", 404);

    const [invoices, receipts] = await Promise.all([
      prisma.schoolFeeInvoice.findMany({
        where: {
          companyId,
          studentId,
          status: { in: ["ISSUED", "PART_PAID", "PAID", "WRITEOFF", "VOIDED"] },
        },
        include: {
          term: { select: { id: true, code: true, name: true } },
        },
        orderBy: [{ issueDate: "desc" }, { createdAt: "desc" }],
      }),
      prisma.schoolFeeReceipt.findMany({
        where: {
          companyId,
          studentId,
          status: { in: ["POSTED", "VOIDED"] },
        },
        include: {
          allocations: {
            include: {
              invoice: {
                select: { id: true, invoiceNo: true },
              },
            },
          },
        },
        orderBy: [{ receiptDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    return successResponse({
      success: true,
      data: {
        resource: "portal-parent-student-fees",
        companyId,
        student,
        invoices,
        receipts,
        // Post S-2.1 Float→Decimal: `0 + Decimal` in JavaScript is string
        // concatenation, so these four reductions would have put a silent
        // string in front of a parent. They sum in Decimal now.
        //
        // The figures are stated in each invoice's own currency and a school
        // billing in two would produce a total in neither — S-2.2 gives every
        // invoice a `currency`, so the sums are grouped by it.
        summary: {
          invoices: invoices.length,
          receipts: receipts.length,
          currencies: [...new Set(invoices.map((invoice) => invoice.currency))],
          totalBilled: sumMoney(invoices.map((invoice) => invoice.totalAmount)),
          totalPaid: sumMoney(invoices.map((invoice) => invoice.paidAmount)),
          totalWaived: sumMoney(invoices.map((invoice) => invoice.waivedAmount)),
          totalOutstanding: sumMoney(
            invoices.map((invoice) => clampAtZero(invoice.balanceAmount)),
          ),
        },
      },
    });
  } catch (error) {
    console.error(
      "[API] GET /api/v2/schools/portal/parent/children/[studentId]/fees error:",
      error,
    );
    return errorResponse("Failed to fetch child fee details");
  }
}
