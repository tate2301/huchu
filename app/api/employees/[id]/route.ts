import { NextRequest, NextResponse } from "next/server"
import { validateSession, successResponse, errorResponse } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { EMPLOYEE_POSITION_VALUES } from "@/lib/platform/vertical-defaults"

const employeeUpdateSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    phone: z.string().min(1).max(30).optional(),
    nextOfKinName: z.string().min(1).max(200).optional(),
    nextOfKinPhone: z.string().min(1).max(30).optional(),
    passportPhotoUrl: z.string().min(1).max(2048).optional(),
    nationalIdNumber: z.union([z.string().trim().min(1).max(100), z.null()]).optional(),
    nationalIdDocumentUrl: z.union([z.string().min(1).max(2048), z.null()]).optional(),
    villageOfOrigin: z.string().min(1).max(200).optional(),
    jobTitle: z.string().trim().max(200).nullable().optional(),
    position: z.enum(EMPLOYEE_POSITION_VALUES).optional(),
    departmentId: z.string().uuid().nullable().optional(),
    gradeId: z.string().uuid().nullable().optional(),
    supervisorId: z.string().uuid().nullable().optional(),
    employmentType: z
      .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"])
      .optional(),
    hireDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .nullable()
      .optional(),
    terminationDate: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .nullable()
      .optional(),
    dateOfBirth: z
      .string()
      .datetime()
      .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
      .nullable()
      .optional(),
    defaultCurrency: z.string().min(1).max(10).optional(),
    isActive: z.boolean().optional(),
    taxNumber: z.string().trim().max(100).nullable().optional(),
    nssaNumber: z.string().trim().max(100).nullable().optional(),
    taxStatus: z.enum(["STANDARD", "EXEMPT", "CONTRACTOR"]).optional(),
    bankName: z.string().trim().max(100).nullable().optional(),
    bankAccountNumber: z.string().trim().max(100).nullable().optional(),
    bankBranchCode: z.string().trim().max(100).nullable().optional(),
    mobileMoneyProvider: z.string().trim().max(100).nullable().optional(),
    mobileMoneyNumber: z.string().trim().max(100).nullable().optional(),
    monthlyAmount: z.number().nonnegative().optional(),
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
    const denial = hrPermissionDenial(session, "hr.employees", "view")
    if (denial) return errorResponse(denial, 403)

    const { id } = await params

    const employee = await prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        employeeId: true,
        userId: true,
        name: true,
        phone: true,
        nextOfKinName: true,
        nextOfKinPhone: true,
        passportPhotoUrl: true,
        nationalIdNumber: true,
        nationalIdDocumentUrl: true,
        villageOfOrigin: true,
        jobTitle: true,
        position: true,
        departmentId: true,
        gradeId: true,
        supervisorId: true,
        employmentType: true,
        hireDate: true,
        terminationDate: true,
        dateOfBirth: true,
        hasDisability: true,
        overtimeHourlyRate: true,
        taxNumber: true,
        nssaNumber: true,
        taxStatus: true,
        bankName: true,
        bankAccountNumber: true,
        bankBranchCode: true,
        mobileMoneyProvider: true,
        mobileMoneyNumber: true,
        defaultCurrency: true,
        isActive: true,
        companyId: true,
        user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
        fixedSalary: { select: { id: true, monthlyAmount: true, currency: true, isActive: true, updatedAt: true } },
        supervisees: { select: { id: true, employeeId: true, name: true, position: true } },
        compensationProfiles: {
          select: {
            id: true,
            baseAmount: true,
            currency: true,
            effectiveFrom: true,
            effectiveTo: true,
            status: true,
            workflowStatus: true,
          },
          orderBy: { effectiveFrom: "desc" },
          take: 10,
        },
        attendance: {
          select: { id: true, date: true, shift: true, status: true, overtime: true, notes: true },
          orderBy: { date: "desc" },
          take: 20,
        },
        leaveRequests: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            workingDays: true,
            status: true,
            reason: true,
            leaveType: { select: { id: true, name: true, code: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        },
        leaveEntitlements: {
          select: {
            id: true,
            year: true,
            granted: true,
            carriedOver: true,
            adjustment: true,
            leaveType: { select: { id: true, name: true, code: true } },
          },
          orderBy: { year: "desc" },
        },
        payrollLineItems: {
          select: {
            id: true,
            grossAmount: true,
            netAmount: true,
            baseAmount: true,
            currency: true,
            createdAt: true,
            run: {
              select: {
                id: true,
                runNumber: true,
                period: { select: { periodKey: true, startDate: true, endDate: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 15,
        },
        hrIncidents: {
          select: {
            id: true,
            category: true,
            title: true,
            incidentDate: true,
            severity: true,
            status: true,
          },
          orderBy: { incidentDate: "desc" },
          take: 10,
        },
        moduleAssignments: {
          select: {
            id: true,
            module: true,
            accessRole: true,
            requiresUserAccess: true,
            isPrimary: true,
            isActive: true,
          },
          orderBy: [{ isPrimary: "desc" }, { module: "asc" }],
        },
        department: { select: { id: true, code: true, name: true } },
        grade: { select: { id: true, code: true, name: true, rank: true } },
        supervisor: { select: { id: true, employeeId: true, name: true } },
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
    const denial = hrPermissionDenial(session, "hr.employees", "edit")
    if (denial) return errorResponse(denial, 403)

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

    const [department, grade, supervisor] = await Promise.all([
      validated.departmentId
        ? prisma.department.findUnique({
            where: { id: validated.departmentId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
      validated.gradeId
        ? prisma.jobGrade.findUnique({
            where: { id: validated.gradeId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
      validated.supervisorId
        ? prisma.employee.findUnique({
            where: { id: validated.supervisorId },
            select: { companyId: true },
          })
        : Promise.resolve(null),
    ])

    if (department && department.companyId !== session.user.companyId) {
      return errorResponse("Invalid department", 403)
    }
    if (grade && grade.companyId !== session.user.companyId) {
      return errorResponse("Invalid grade", 403)
    }
    if (supervisor && supervisor.companyId !== session.user.companyId) {
      return errorResponse("Invalid supervisor", 403)
    }

    const { monthlyAmount, ...employeeFields } = validated

    const employee = await prisma.employee.update({
      where: { id },
      data: {
        ...employeeFields,
        hireDate: employeeFields.hireDate ? new Date(employeeFields.hireDate) : employeeFields.hireDate,
        terminationDate: employeeFields.terminationDate
          ? new Date(employeeFields.terminationDate)
          : employeeFields.terminationDate,
        dateOfBirth: employeeFields.dateOfBirth
          ? new Date(employeeFields.dateOfBirth)
          : employeeFields.dateOfBirth,
      },
    })

    if (monthlyAmount !== undefined) {
      await prisma.fixedSalary.upsert({
        where: { employeeId: id },
        create: {
          employeeId: id,
          monthlyAmount,
          currency: employee.defaultCurrency || "USD",
          isActive: true,
        },
        update: {
          monthlyAmount,
          ...(employee.defaultCurrency ? { currency: employee.defaultCurrency } : {}),
        },
      })
    }

    return successResponse(employee)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : ""
      if (target.includes("nationalIdNumber")) {
        return errorResponse(
          "National ID number already exists for this company",
          409,
        )
      }
      return errorResponse("Employee data conflicts with an existing record", 409)
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
    const denial = hrPermissionDenial(session, "hr.employees", "edit")
    if (denial) return errorResponse(denial, 403)

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

    const [
      attendanceCount,
      shiftCount,
      shiftGroupLeaderCount,
      shiftGroupMembershipCount,
      workOrderCount,
      witnessCount,
      dispatchCount,
    ] =
      await Promise.all([
        prisma.attendance.count({ where: { employeeId: id } }),
        prisma.shiftReport.count({ where: { groupLeaderId: id } }),
        prisma.shiftGroup.count({ where: { leaderEmployeeId: id } }),
        prisma.shiftGroupMember.count({ where: { employeeId: id, isActive: true } }),
        prisma.workOrder.count({ where: { technicianId: id } }),
        prisma.goldPour.count({
          where: {
            OR: [{ witness1Id: id }, { witness2Id: id }],
          },
        }),
        prisma.goldDispatch.count({ where: { handedOverById: id } }),
      ])

    const totalLinks =
      attendanceCount +
      shiftCount +
      shiftGroupLeaderCount +
      shiftGroupMembershipCount +
      workOrderCount +
      witnessCount +
      dispatchCount

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
