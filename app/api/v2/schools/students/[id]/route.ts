import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  errorResponse,
  isValidUUID,
  successResponse,
  validateSession,
} from "@/lib/api-utils";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request);
    if (sessionResult instanceof NextResponse) return sessionResult;
    const { session } = sessionResult;
    const { id } = await params;

    if (!isValidUUID(id)) {
      return errorResponse("Invalid student ID", 400);
    }

    const student = await prisma.schoolStudent.findFirst({
      where: { id, companyId: session.user.companyId },
      include: {
        currentClass: { select: { id: true, code: true, name: true } },
        currentStream: { select: { id: true, code: true, name: true, classId: true } },
        guardianLinks: {
          include: {
            guardian: {
              select: {
                id: true,
                guardianNo: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true,
              },
            },
          },
        },
        enrollments: {
          include: {
            term: { select: { id: true, code: true, name: true } },
            class: { select: { id: true, code: true, name: true } },
            stream: { select: { id: true, code: true, name: true } },
          },
          orderBy: { enrolledAt: "desc" },
        },
        boardingAllocations: {
          include: {
            hostel: { select: { id: true, code: true, name: true } },
            room: { select: { id: true, code: true, name: true } },
            bed: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startDate: "desc" },
        },
        resultLines: {
          include: {
            sheet: {
              select: {
                id: true,
                title: true,
                term: { select: { id: true, code: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            guardianLinks: true,
            enrollments: true,
            boardingAllocations: true,
            resultLines: true,
            feeInvoices: true,
          },
        },
        feeInvoices: {
          select: {
            id: true,
            invoiceNo: true,
            totalAmount: true,
            paidAmount: true,
            balanceAmount: true,
            status: true,
            issueDate: true,
            dueDate: true,
            term: { select: { id: true, code: true, name: true } },
          },
          orderBy: { issueDate: "desc" },
        },
      },
    });

    if (!student) {
      return errorResponse("Student not found", 404);
    }

    return successResponse(student);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues);
    }
    console.error("[API] GET /api/v2/schools/students/[id] error:", error);
    return errorResponse("Failed to fetch student profile");
  }
}
