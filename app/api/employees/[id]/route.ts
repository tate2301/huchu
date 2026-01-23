import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const employeeUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(1).max(30).optional(),
    nextOfKinName: z.string().min(1).max(200).optional(),
    nextOfKinPhone: z.string().min(1).max(30).optional(),
    passportPhotoUrl: z.string().min(1).max(2048).optional(),
    villageOfOrigin: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "No fields provided",
  })

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        name: true,
        phone: true,
        nextOfKinName: true,
        nextOfKinPhone: true,
        passportPhotoUrl: true,
        villageOfOrigin: true,
        isActive: true,
        companyId: true,
      },
    })

    if (!employee) {
      return errorResponse("Employee not found", 404)
    }

    if (employee.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    return successResponse(employee)
  } catch (error) {
    console.error("[API] GET /api/employees/[id] error:", error)
    return errorResponse("Failed to fetch employee")
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params
    const body = await request.json()
    const validated = employeeUpdateSchema.parse(body)

    const existing = await prisma.employee.findUnique({
      where: { id },
      select: { companyId: true, employeeId: true },
    })

    if (!existing) {
      return errorResponse("Employee not found", 404)
    }

    if (existing.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const employee = await prisma.employee.update({
      where: { id },
      data: validated,
    })

    return successResponse(employee)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] PATCH /api/employees/[id] error:", error)
    return errorResponse("Failed to update employee")
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { id } = await params

    const existing = await prisma.employee.findUnique({
      where: { id },
      select: { companyId: true },
    })

    if (!existing) {
      return errorResponse("Employee not found", 404)
    }

    if (existing.companyId !== session.user.companyId) {
      return errorResponse("Forbidden", 403)
    }

    const [attendanceCount, shiftCount, workOrderCount, witnessCount, dispatchCount] =
      await Promise.all([
        prisma.attendance.count({ where: { employeeId: id } }),
        prisma.shiftReport.count({ where: { groupLeaderId: id } }),
        prisma.workOrder.count({ where: { technicianId: id } }),
        prisma.goldPour.count({
          where: {
            OR: [{ witness1Id: id }, { witness2Id: id }],
          },
        }),
        prisma.goldDispatch.count({ where: { handedOverById: id } }),
      ])

    const totalLinks =
      attendanceCount + shiftCount + workOrderCount + witnessCount + dispatchCount

    if (totalLinks > 0) {
      return errorResponse(
        "Employee has linked records and cannot be deleted. Deactivate instead.",
        409,
      )
    }

    await prisma.employee.delete({
      where: { id },
    })

    return successResponse({ success: true, deleted: true })
  } catch (error) {
    console.error("[API] DELETE /api/employees/[id] error:", error)
    return errorResponse("Failed to delete employee")
  }
}
