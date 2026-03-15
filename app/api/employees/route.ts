import bcrypt from "bcryptjs"
import { NextRequest, NextResponse } from "next/server"
import {
  validateSession,
  successResponse,
  errorResponse,
  getPaginationParams,
  paginationResponse,
} from "@/lib/api-utils"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { ensureApproverRole } from "@/lib/hr-payroll"
import { Prisma } from "@prisma/client"

const employeeSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  nextOfKinName: z.string().min(1).max(200),
  nextOfKinPhone: z.string().min(1).max(30),
  passportPhotoUrl: z.string().min(1).max(2048),
  nationalIdNumber: z.string().trim().min(1).max(100).optional(),
  nationalIdDocumentUrl: z.string().min(1).max(2048).optional(),
  villageOfOrigin: z.string().min(1).max(200),
  jobTitle: z.string().trim().max(200).optional(),
  position: z.enum([
    "MANAGER",
    "CLERK",
    "SUPPORT_STAFF",
    "ENGINEERS",
    "CHEMIST",
    "MINERS",
  ]),
  departmentId: z.string().uuid().optional(),
  gradeId: z.string().uuid().optional(),
  supervisorId: z.string().uuid().optional(),
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "CASUAL"])
    .optional(),
  hireDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  terminationDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .optional(),
  defaultCurrency: z.string().min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  compensationTemplateId: z.string().uuid().optional(),
  moduleAssignments: z
    .array(
      z.object({
        module: z.enum(["HR", "GOLD", "SCRAP_METAL", "CAR_SALES", "THRIFT"]),
        accessRole: z
          .enum([
            "MANAGER",
            "CLERK",
            "SALES_EXEC",
            "AUTO_MANAGER",
            "FINANCE_OFFICER",
            "SHOP_MANAGER",
            "CASHIER",
            "STOCK_CLERK",
          ])
          .optional(),
        requiresUserAccess: z.boolean().optional(),
        isPrimary: z.boolean().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .max(10)
    .optional(),
  createUserAccount: z.boolean().optional(),
  userEmail: z.string().email().max(320).optional(),
  userPassword: z.string().min(8).max(200).optional(),
  userRole: z
    .enum([
      "MANAGER",
      "CLERK",
      "SALES_EXEC",
      "AUTO_MANAGER",
      "FINANCE_OFFICER",
      "SHOP_MANAGER",
      "CASHIER",
      "STOCK_CLERK",
    ])
    .optional(),
})

const EMPLOYEE_ID_PREFIX = "EMP-"
const EMPLOYEE_ID_PAD = 4

async function generateEmployeeId(companyId: string) {
  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { employeeId: true },
  })

  let max = 0
  const existingIds = new Set<string>()

  for (const employee of employees) {
    existingIds.add(employee.employeeId)
    const match = employee.employeeId.match(/^EMP-(\d+)$/i)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isFinite(value)) {
      max = Math.max(max, value)
    }
  }

  let next = max + 1
  let candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`
  while (existingIds.has(candidate)) {
    next += 1
    candidate = `${EMPLOYEE_ID_PREFIX}${String(next).padStart(EMPLOYEE_ID_PAD, "0")}`
  }

  return candidate
}

export async function GET(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const { searchParams } = new URL(request.url)
    const active = searchParams.get("active")
    const search = searchParams.get("search")
    const position = searchParams.get("position")
    const departmentId = searchParams.get("departmentId")
    const gradeId = searchParams.get("gradeId")
    const { page, limit, skip } = getPaginationParams(request)

    const where: Record<string, unknown> = {
      companyId: session.user.companyId,
    }

    if (active !== null) where.isActive = active === "true"
    if (position) where.position = position
    if (departmentId) where.departmentId = departmentId
    if (gradeId) where.gradeId = gradeId
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { employeeId: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { nationalIdNumber: { contains: search, mode: "insensitive" } },
      ]
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
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
          defaultCurrency: true,
          isActive: true,
          user: { select: { id: true, email: true, name: true, role: true, isActive: true } },
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
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      prisma.employee.count({ where }),
    ])

    const employeeIds = employees.map((employee) => employee.id)
    const owedByEmployee = new Map<
      string,
      { goldOwed: number; irregularOwed: number; salaryOwed: number }
    >()

    if (employeeIds.length > 0) {
      const outstandingTotals = await prisma.employeePayment.findMany({
        where: {
          employeeId: { in: employeeIds },
          status: { in: ["DUE", "PARTIAL"] },
        },
        select: {
          employeeId: true,
          type: true,
          payoutSource: true,
          amount: true,
          paidAmount: true,
          amountUsd: true,
          paidAmountUsd: true,
        },
      })

      outstandingTotals.forEach((row) => {
        const amount =
          row.type === "GOLD" ? (row.amountUsd ?? 0) : (row.amount ?? 0)
        const paidAmount =
          row.type === "GOLD" ? (row.paidAmountUsd ?? 0) : (row.paidAmount ?? 0)
        const outstanding = Math.max(amount - paidAmount, 0)
        const current = owedByEmployee.get(row.employeeId) ?? {
          goldOwed: 0,
          irregularOwed: 0,
          salaryOwed: 0,
        }

        if (row.type === "GOLD" || row.payoutSource === "GOLD") {
          current.goldOwed += outstanding
          current.irregularOwed += outstanding
        } else if (row.type === "IRREGULAR") {
          current.irregularOwed += outstanding
        } else if (row.type === "SALARY") {
          current.salaryOwed += outstanding
        }

        owedByEmployee.set(row.employeeId, current)
      })
    }

    const enrichedEmployees = employees.map((employee) => {
      const owed = owedByEmployee.get(employee.id)
      return {
        ...employee,
        goldOwed: owed?.goldOwed ?? 0,
        irregularOwed: owed?.irregularOwed ?? 0,
        salaryOwed: owed?.salaryOwed ?? 0,
      }
    })

    return successResponse(paginationResponse(enrichedEmployees, total, page, limit))
  } catch (error) {
    console.error("[API] GET /api/employees error:", error)
    return errorResponse("Failed to fetch employees")
  }
}

export async function POST(request: NextRequest) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult

    const body = await request.json()
    const validated = employeeSchema.parse(body)

    const [department, grade, supervisor, compensationTemplate] = await Promise.all([
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
      validated.compensationTemplateId
        ? prisma.compensationTemplate.findUnique({
            where: { id: validated.compensationTemplateId },
            include: {
              rules: {
                include: {
                  compensationRule: true,
                },
                orderBy: { sortOrder: "asc" },
              },
            },
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
    if (compensationTemplate && compensationTemplate.companyId !== session.user.companyId) {
      return errorResponse("Invalid compensation template", 403)
    }
    if (compensationTemplate && !compensationTemplate.isActive) {
      return errorResponse("Selected compensation template is inactive", 400)
    }
    if (compensationTemplate && !ensureApproverRole(session)) {
      return errorResponse(
        "Only managers and superadmins can apply compensation templates during onboarding",
        403,
      )
    }

    if (validated.createUserAccount) {
      if (session.user.role !== "SUPERADMIN") {
        return errorResponse("Only superadmins can provision linked user accounts during onboarding", 403)
      }
      if (!validated.userEmail || !validated.userPassword || !validated.userRole) {
        return errorResponse("Linked user email, password, and role are required", 400)
      }
      const existingUser = await prisma.user.findFirst({
        where: { email: { equals: validated.userEmail.trim(), mode: "insensitive" } },
        select: { id: true },
      })
      if (existingUser) {
        return errorResponse("A user with this email already exists", 409)
      }
    }

    const moduleAssignments =
      validated.moduleAssignments && validated.moduleAssignments.length > 0
        ? validated.moduleAssignments
        : [{ module: "HR" as const, isPrimary: true, isActive: true }]
    const normalizedModuleAssignments = Array.from(
      new Map(
        moduleAssignments.map((assignment, index) => [
          assignment.module,
          {
            ...assignment,
            isPrimary: assignment.isPrimary ?? (index === 0 || assignment.module === "HR"),
            isActive: assignment.isActive ?? true,
            requiresUserAccess: assignment.requiresUserAccess ?? validated.createUserAccount ?? false,
          },
        ]),
      ).values(),
    )

    const employeeId = await generateEmployeeId(session.user.companyId)
    const hireDate = validated.hireDate ? new Date(validated.hireDate) : undefined
    const terminationDate = validated.terminationDate
      ? new Date(validated.terminationDate)
      : undefined

    const result = await prisma.$transaction(async (tx) => {
      let linkedUserId: string | undefined
      if (validated.createUserAccount && validated.userEmail && validated.userPassword && validated.userRole) {
        const passwordHash = await bcrypt.hash(validated.userPassword, 12)
        const user = await tx.user.create({
          data: {
            companyId: session.user.companyId,
            name: validated.name,
            email: validated.userEmail.trim().toLowerCase(),
            password: passwordHash,
            role: validated.userRole,
            isActive: validated.isActive ?? true,
            phone: validated.phone,
          },
          select: { id: true },
        })
        linkedUserId = user.id
      }

      const createdEmployee = await tx.employee.create({
        data: {
          employeeId,
          userId: linkedUserId,
          name: validated.name,
          phone: validated.phone,
          nextOfKinName: validated.nextOfKinName,
          nextOfKinPhone: validated.nextOfKinPhone,
          passportPhotoUrl: validated.passportPhotoUrl,
          nationalIdNumber: validated.nationalIdNumber,
          nationalIdDocumentUrl: validated.nationalIdDocumentUrl,
          villageOfOrigin: validated.villageOfOrigin,
          jobTitle: validated.jobTitle?.trim() || undefined,
          position: validated.position,
          departmentId: validated.departmentId,
          gradeId: validated.gradeId,
          supervisorId: validated.supervisorId,
          employmentType: validated.employmentType ?? "FULL_TIME",
          hireDate,
          terminationDate,
          defaultCurrency: validated.defaultCurrency ?? "USD",
          isActive: validated.isActive ?? true,
          companyId: session.user.companyId,
          moduleAssignments: {
            create: normalizedModuleAssignments.map((assignment) => ({
              companyId: session.user.companyId,
              module: assignment.module,
              accessRole: assignment.accessRole,
              requiresUserAccess: assignment.requiresUserAccess,
              isPrimary: assignment.isPrimary,
              isActive: assignment.isActive,
            })),
          },
        },
      })

      if (!compensationTemplate) {
        return {
          employee: createdEmployee,
          linkedUserId: linkedUserId ?? null,
          moduleAssignmentsCreated: normalizedModuleAssignments.length,
          compensationTemplateApplied: null,
        }
      }

      const now = new Date()
      const profile = await tx.compensationProfile.create({
        data: {
          employeeId: createdEmployee.id,
          baseAmount: compensationTemplate.baseAmount,
          currency: compensationTemplate.currency || createdEmployee.defaultCurrency,
          effectiveFrom: hireDate ?? now,
          status: "ACTIVE",
          workflowStatus: "APPROVED",
          notes: `Auto-applied from template ${compensationTemplate.name}.`,
          createdById: session.user.id,
          submittedById: session.user.id,
          approvedById: session.user.id,
          submittedAt: now,
          approvedAt: now,
        },
      })

      let rulesCreated = 0
      for (const templateRule of compensationTemplate.rules) {
        const sourceRule = templateRule.compensationRule
        await tx.compensationRule.create({
          data: {
            companyId: session.user.companyId,
            name: `${sourceRule.name} - ${createdEmployee.employeeId}`,
            type: sourceRule.type,
            calcMethod: sourceRule.calcMethod,
            value: sourceRule.value,
            cap: sourceRule.cap,
            taxable: sourceRule.taxable,
            currency: sourceRule.currency,
            isActive: sourceRule.isActive,
            workflowStatus: "APPROVED",
            employeeId: createdEmployee.id,
            createdById: session.user.id,
            submittedById: session.user.id,
            approvedById: session.user.id,
            submittedAt: now,
            approvedAt: now,
          },
        })
        rulesCreated += 1
      }

      return {
        employee: createdEmployee,
        linkedUserId: linkedUserId ?? null,
        moduleAssignmentsCreated: normalizedModuleAssignments.length,
        compensationTemplateApplied: {
          id: compensationTemplate.id,
          name: compensationTemplate.name,
          profileId: profile.id,
          rulesCreated,
        },
      }
    })

    return successResponse(result, 201)
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
    console.error("[API] POST /api/employees error:", error)
    return errorResponse("Failed to create employee")
  }
}
