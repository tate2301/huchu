import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import {
  calculateRuleAmount,
  computeLineTotals,
  createApprovalAction,
  ensureApproverRole,
} from "@/lib/hr-payroll"
import { prisma } from "@/lib/prisma"

const generateRunSchema = z.object({
  notes: z.string().max(1000).optional(),
  runNumber: z.number().int().min(1).optional(),
  overwriteDraft: z.boolean().optional(),
  goldRatePerUnit: z.number().positive().optional(),
  goldRateUnit: z.string().trim().min(1).max(20).optional(),
})

type LineComponentDraft = {
  ruleId?: string
  name: string
  type: "ALLOWANCE" | "DEDUCTION"
  calcMethod: "FIXED" | "PERCENT"
  rateOrAmount: number
  amount: number
  isTaxable: boolean
}

type LineItemDraft = {
  employeeId: string
  compensationProfileId: string | null
  baseAmount: number
  variableAmount: number
  allowancesTotal: number
  deductionsTotal: number
  grossAmount: number
  netAmount: number
  currency: string
  notes?: string
  components: LineComponentDraft[]
}

type RunDraft = {
  lineItems: LineItemDraft[]
  totals: {
    grossTotal: number
    allowancesTotal: number
    deductionsTotal: number
    netTotal: number
  }
  workflowNote: string
  warnings: string[]
  goldRatePerUnit?: number
  goldRateUnit?: string
  goldSettlementMode?: "CURRENT_PERIOD" | "NEXT_PERIOD"
}

function parseEmployeeScopeIds(raw: string | null | undefined) {
  if (!raw) return [] as string[]
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [] as string[]
    return parsed.filter((value): value is string => typeof value === "string")
  } catch {
    return [] as string[]
  }
}

function deriveRunTotals(lineItems: LineItemDraft[]) {
  return lineItems.reduce(
    (acc, line) => ({
      grossTotal: acc.grossTotal + line.grossAmount,
      allowancesTotal: acc.allowancesTotal + line.allowancesTotal,
      deductionsTotal: acc.deductionsTotal + line.deductionsTotal,
      netTotal: acc.netTotal + line.netAmount,
    }),
    { grossTotal: 0, allowancesTotal: 0, deductionsTotal: 0, netTotal: 0 },
  )
}

async function buildGoldPayoutRunDraft(input: {
  companyId: string
  periodStart: Date
  periodEnd: Date
  goldSettlementMode: "CURRENT_PERIOD" | "NEXT_PERIOD"
  goldRatePerUnit: number
  goldRateUnit: string
}) {
  const allocationDateFloor = new Date(input.periodStart)
  allocationDateFloor.setDate(allocationDateFloor.getDate() - 42)

  const approvedAllocations = await prisma.goldShiftAllocation.findMany({
    where: {
      workflowStatus: "APPROVED",
      site: { companyId: input.companyId },
      date:
        input.goldSettlementMode === "CURRENT_PERIOD"
          ? { gte: input.periodStart, lte: input.periodEnd }
          : { gte: allocationDateFloor, lte: input.periodEnd },
    },
    include: {
      workerShares: {
        select: {
          employeeId: true,
          shareWeight: true,
        },
      },
    },
  })

  const goldWeightByEmployee = new Map<string, number>()
  for (const allocation of approvedAllocations) {
    const dueDate = new Date(allocation.date)
    dueDate.setDate(dueDate.getDate() + allocation.payCycleWeeks * 7)

    const qualifiesForPeriod =
      input.goldSettlementMode === "CURRENT_PERIOD"
        ? allocation.date >= input.periodStart && allocation.date <= input.periodEnd
        : dueDate >= input.periodStart && dueDate <= input.periodEnd

    if (!qualifiesForPeriod) continue

    for (const workerShare of allocation.workerShares) {
      const current = goldWeightByEmployee.get(workerShare.employeeId) ?? 0
      goldWeightByEmployee.set(workerShare.employeeId, current + workerShare.shareWeight)
    }
  }

  const employeeIds = Array.from(goldWeightByEmployee.keys())
  if (employeeIds.length === 0) {
    return null
  }

  const employees = await prisma.employee.findMany({
    where: {
      id: { in: employeeIds },
      companyId: input.companyId,
    },
    select: {
      id: true,
      defaultCurrency: true,
    },
  })
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]))

  const lineItems: LineItemDraft[] = employeeIds.map((employeeId) => {
    const goldWeight = goldWeightByEmployee.get(employeeId) ?? 0
    const convertedAmount = goldWeight * input.goldRatePerUnit
    const employee = employeeById.get(employeeId)

    return {
      employeeId,
      compensationProfileId: null,
      baseAmount: 0,
      variableAmount: convertedAmount,
      allowancesTotal: 0,
      deductionsTotal: 0,
      grossAmount: convertedAmount,
      netAmount: convertedAmount,
      currency: employee?.defaultCurrency ?? "USD",
      notes: `Gold payout conversion: ${goldWeight.toFixed(3)} ${input.goldRateUnit} @ ${input.goldRatePerUnit.toFixed(4)}`,
      components: [],
    }
  })

  return {
    lineItems,
    totals: deriveRunTotals(lineItems),
    workflowNote: "Gold payout run generated from approved gold shift allocations.",
    warnings: [],
    goldRatePerUnit: input.goldRatePerUnit,
    goldRateUnit: input.goldRateUnit,
    goldSettlementMode: input.goldSettlementMode,
  } satisfies RunDraft
}

async function buildSalaryPayrollRunDraft(input: {
  companyId: string
  periodStart: Date
  periodEnd: Date
  employeeScopeJson?: string | null
  appliesToContractorsOnly: boolean
}) {
  const scopedEmployeeIds = parseEmployeeScopeIds(input.employeeScopeJson)
  const employeeWhere: Record<string, unknown> = {
    companyId: input.companyId,
    isActive: true,
  }
  if (input.appliesToContractorsOnly) {
    employeeWhere.employmentType = "CONTRACT"
  }
  if (scopedEmployeeIds.length > 0) {
    employeeWhere.id = { in: scopedEmployeeIds }
  }

  const employees = await prisma.employee.findMany({
    where: employeeWhere,
    select: {
      id: true,
      name: true,
      employeeId: true,
      departmentId: true,
      gradeId: true,
      defaultCurrency: true,
    },
    orderBy: { name: "asc" },
  })
  if (employees.length === 0) {
    return {
      lineItems: [] as LineItemDraft[],
      totals: { grossTotal: 0, allowancesTotal: 0, deductionsTotal: 0, netTotal: 0 },
      workflowNote: "Salary payroll run generated from compensation profiles and active rules.",
      warnings: ["No eligible employees found for this payroll period scope."],
    } satisfies RunDraft
  }

  const employeeIds = employees.map((employee) => employee.id)

  const profiles = await prisma.compensationProfile.findMany({
    where: {
      employeeId: { in: employeeIds },
      workflowStatus: "APPROVED",
      status: "ACTIVE",
      effectiveFrom: { lte: input.periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.periodStart } }],
    },
    select: {
      id: true,
      employeeId: true,
      baseAmount: true,
      currency: true,
      effectiveFrom: true,
    },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }],
  })
  const profileByEmployeeId = new Map<string, (typeof profiles)[number]>()
  for (const profile of profiles) {
    if (!profileByEmployeeId.has(profile.employeeId)) {
      profileByEmployeeId.set(profile.employeeId, profile)
    }
  }

  const rules = await prisma.compensationRule.findMany({
    where: {
      companyId: input.companyId,
      workflowStatus: "APPROVED",
      isActive: true,
    },
    select: {
      id: true,
      name: true,
      type: true,
      calcMethod: true,
      value: true,
      cap: true,
      taxable: true,
      employeeId: true,
      departmentId: true,
      gradeId: true,
    },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
  })

  const lineItems: LineItemDraft[] = []
  const warnings: string[] = []

  for (const employee of employees) {
    const profile = profileByEmployeeId.get(employee.id)

    if (!profile) {
      warnings.push(
        `${employee.name} (${employee.employeeId}) skipped: no approved compensation profile.`,
      )
      continue
    }

    const baseAmount = profile.baseAmount
    const currency = profile.currency ?? employee.defaultCurrency
    const sourceLabel = "Compensation profile"

    const applicableRules = rules.filter((rule) => {
      if (rule.employeeId && rule.employeeId !== employee.id) return false
      if (rule.departmentId && rule.departmentId !== employee.departmentId) return false
      if (rule.gradeId && rule.gradeId !== employee.gradeId) return false
      return true
    })

    const components: LineComponentDraft[] = applicableRules.map((rule) => {
      const amount = calculateRuleAmount({
        baseAmount,
        calcMethod: rule.calcMethod,
        value: rule.value,
        cap: rule.cap,
      })
      return {
        ruleId: rule.id,
        name: rule.name,
        type: rule.type,
        calcMethod: rule.calcMethod,
        rateOrAmount: rule.value,
        amount,
        isTaxable: rule.taxable,
      }
    })

    const totals = computeLineTotals({
      baseAmount,
      variableAmount: 0,
      rules: components,
    })

    lineItems.push({
      employeeId: employee.id,
      compensationProfileId: profile.id,
      baseAmount,
      variableAmount: 0,
      allowancesTotal: totals.allowancesTotal,
      deductionsTotal: totals.deductionsTotal,
      grossAmount: totals.grossAmount,
      netAmount: totals.netAmount,
      currency,
      notes: `${sourceLabel} salary run for ${employee.name}.`,
      components,
    })
  }

  return {
    lineItems,
    totals: deriveRunTotals(lineItems),
    workflowNote: "Salary payroll run generated from compensation profiles and active rules.",
    warnings,
  } satisfies RunDraft
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to generate payroll runs", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = generateRunSchema.parse(body)

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            goldSettlementMode: true,
          },
        },
        runs: {
          select: {
            id: true,
            runNumber: true,
            status: true,
          },
          orderBy: { runNumber: "desc" },
        },
      },
    })
    if (!period || period.companyId !== session.user.companyId) {
      return errorResponse("Payroll period not found", 404)
    }
    if (period.status === "CLOSED") {
      return errorResponse("Closed payroll period cannot be regenerated", 400)
    }

    if (period.domain === "GOLD_PAYOUT" && !validated.goldRatePerUnit) {
      return errorResponse("Gold payout runs require a positive gold rate", 400)
    }
    if (
      period.domain === "PAYROLL" &&
      (validated.goldRatePerUnit !== undefined || validated.goldRateUnit !== undefined)
    ) {
      return errorResponse("Gold rate fields are not valid for salary payroll runs", 400)
    }

    const draftRun = period.runs.find((run) => run.status === "DRAFT")
    if (draftRun && !validated.overwriteDraft) {
      return errorResponse(
        "Draft payroll run already exists for this period. Pass overwriteDraft=true to regenerate.",
        409,
      )
    }

    const runNumber =
      validated.runNumber ??
      (period.runs.length > 0 ? Math.max(...period.runs.map((run) => run.runNumber)) + 1 : 1)

    let runDraft: RunDraft
    if (period.domain === "GOLD_PAYOUT") {
      const goldDraft = await buildGoldPayoutRunDraft({
        companyId: session.user.companyId,
        periodStart: new Date(period.startDate),
        periodEnd: new Date(period.endDate),
        goldSettlementMode: period.company.goldSettlementMode,
        goldRatePerUnit: validated.goldRatePerUnit!,
        goldRateUnit: validated.goldRateUnit ?? "g",
      })
      if (!goldDraft) {
        return errorResponse(
          "No approved gold payout allocations found for this period. Approve allocations before generating a run.",
          409,
        )
      }
      runDraft = goldDraft
    } else {
      runDraft = await buildSalaryPayrollRunDraft({
        companyId: session.user.companyId,
        periodStart: new Date(period.startDate),
        periodEnd: new Date(period.endDate),
        employeeScopeJson: period.employeeScopeJson,
        appliesToContractorsOnly: period.appliesToContractorsOnly,
      })
      if (runDraft.lineItems.length === 0) {
        return errorResponse("No eligible salary employees found for this period", 409, {
          warnings: runDraft.warnings,
        })
      }
    }

    const createdRun = await prisma.$transaction(async (tx) => {
      if (draftRun && validated.overwriteDraft) {
        await tx.payrollRun.delete({ where: { id: draftRun.id } })
      }

      const created = await tx.payrollRun.create({
        data: {
          companyId: session.user.companyId,
          periodId: period.id,
          domain: period.domain,
          runNumber,
          status: "DRAFT",
          notes: validated.notes,
          grossTotal: runDraft.totals.grossTotal,
          allowancesTotal: runDraft.totals.allowancesTotal,
          deductionsTotal: runDraft.totals.deductionsTotal,
          netTotal: runDraft.totals.netTotal,
          goldRatePerUnit: runDraft.goldRatePerUnit,
          goldRateUnit: runDraft.goldRateUnit,
          goldSettlementMode: runDraft.goldSettlementMode ?? period.company.goldSettlementMode,
          createdById: session.user.id,
          lineItems: {
            create: runDraft.lineItems.map((line) => ({
              employeeId: line.employeeId,
              compensationProfileId: line.compensationProfileId,
              baseAmount: line.baseAmount,
              variableAmount: line.variableAmount,
              allowancesTotal: line.allowancesTotal,
              deductionsTotal: line.deductionsTotal,
              grossAmount: line.grossAmount,
              netAmount: line.netAmount,
              currency: line.currency,
              notes: line.notes,
              components:
                line.components.length > 0
                  ? {
                      create: line.components.map((component) => ({
                        ruleId: component.ruleId ?? undefined,
                        name: component.name,
                        type: component.type,
                        calcMethod: component.calcMethod,
                        rateOrAmount: component.rateOrAmount,
                        amount: component.amount,
                        isTaxable: component.isTaxable,
                      })),
                    }
                  : undefined,
            })),
          },
        },
        include: {
          period: { select: { id: true, periodKey: true, startDate: true, endDate: true } },
          createdBy: { select: { id: true, name: true } },
          lineItems: {
            include: {
              employee: { select: { id: true, employeeId: true, name: true } },
              components: true,
            },
            orderBy: { employee: { name: "asc" } },
          },
        },
      })

      await createApprovalAction(tx, {
        companyId: session.user.companyId,
        entityType: "PAYROLL_RUN",
        entityId: created.id,
        action: "CREATE",
        actedById: session.user.id,
        toStatus: "DRAFT",
        note: runDraft.workflowNote,
      })

      return created
    })

    return successResponse(
      {
        ...createdRun,
        warnings: runDraft.warnings,
      },
      201,
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Validation failed", 400, error.issues)
    }
    console.error("[API] POST /api/payroll/periods/[id]/generate-run error:", error)
    return errorResponse("Failed to generate payroll run")
  }
}
