import { NextRequest, NextResponse } from "next/server";
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

type RouteParams = { params: Promise<{ studentId: string }> };

const privilegedRoles = new Set(["SUPERADMIN", "MANAGER", "CLERK"]);

function isPrivilegedRole(role?: string | null) {
  return role ? privilegedRoles.has(role.toUpperCase()) : false;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const companyId = session.user.companyId;
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const guardianId = searchParams.get("guardianId");

    const isPrivileged = isPrivilegedRole(session.user.role);
    let hasFinanceAccess = false;

    if (isPrivileged) {
      hasFinanceAccess = true;
    } else {
      const guardian = await prisma.schoolGuardian.findFirst({
        where: {
          companyId,
          ...(guardianId
            ? { id: guardianId }
            : session.user.email
              ? { email: { equals: session.user.email, mode: "insensitive" } }
              : { id: "__none__" }),
        },
        select: { id: true },
      });

      if (!guardian) {
        return errorResponse("Guardian context not found", 404);
      }

      const link = await prisma.schoolStudentGuardian.findFirst({
        where: {
          companyId,
          studentId,
          guardianId: guardian.id,
        },
        select: { id: true, canReceiveFinancials: true },
      });

      if (!link) {
        return errorResponse("Student is not linked to this parent account", 403);
      }
      if (!link.canReceiveFinancials) {
        return errorResponse("Financial visibility is disabled for this parent link", 403);
      }
      hasFinanceAccess = true;
    }

    if (!hasFinanceAccess) {
      return errorResponse("Insufficient access to student fees", 403);
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
        summary: {
          invoices: invoices.length,
          receipts: receipts.length,
          totalBilled: invoices.reduce((sum, invoice) => sum + invoice.totalAmount, 0),
          totalPaid: invoices.reduce((sum, invoice) => sum + invoice.paidAmount, 0),
          totalWaived: invoices.reduce((sum, invoice) => sum + invoice.waivedAmount, 0),
          totalOutstanding: invoices.reduce(
            (sum, invoice) => sum + Math.max(invoice.balanceAmount, 0),
            0,
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
