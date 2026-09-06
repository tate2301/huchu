import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@corelithzw/db"
import type { CompensationCalcMethod, CompensationRuleType } from "@corelithzw/db"
import { errorResponse, successResponse, validateSession } from "@/lib/api-utils"
import { hrPermissionDenial } from "@/lib/hr/permissions"
import { writePlatformAuditEvent } from "@/lib/audit/platform"
import { createApprovalAction, ensureApproverRole } from "@/lib/workflow/approvals"
import { ensureHrPayrollDefaults } from "@/lib/hr/bootstrap"
import {
  assembleSalaryRun,
  findReturnBlockers,
} from "@/lib/hr/payroll/assemble"
import {
  money,
  resolveBaseCurrency,
  resolveExchangeRate,
  sumMoney,
  toBaseAmount,
  UnknownExchangeRateError,
  ZERO,
} from "@/lib/money"
import { createRouteLogger } from "@/lib/observability/route-logger"
import { prisma } from "@corelithzw/db/client"

const generateRunSchema = z.object({
  notes: z.string().max(1000).optional(),
  runNumber: z.number().int().min(1).optional(),
  overwriteDraft: z.boolean().optional(),
})

type LineComponentDraft = {
  ruleId?: string
  name: string
  type: CompensationRuleType
  calcMethod: CompensationCalcMethod
  rateOrAmount: Prisma.Decimal
  amount: Prisma.Decimal
  isTaxable: boolean
  /// Non-null on the lines the state owns, so a return can be built by summing.
  statutoryKey?: string | null
  sequence?: number
  basis?: Prisma.Decimal | null
}

type LineItemDraft = {
  employeeId: string
  compensationProfileId: string | null
  baseAmount: Prisma.Decimal
  variableAmount: Prisma.Decimal
  allowancesTotal: Prisma.Decimal
  deductionsTotal: Prisma.Decimal
  grossAmount: Prisma.Decimal
  netAmount: Prisma.Decimal
  /** The slice PAYE was struck on. Zero on a settlement run, which has no tax. */
  taxableGross?: Prisma.Decimal
  /** Employer contributions. In neither gross nor deductions. */
  employerCost?: Prisma.Decimal
  currency: string
  notes?: string
  components: LineComponentDraft[]
}

/**
 * Stamp every line with the rate its currency was worth at the period end, and
 * the base-currency value of its net pay.
 *
 * Frozen on the row rather than looked up when something reads it: a payslip
 * reprinted in a year, and the journal that posted alongside it, have to agree,
 * and the ZWG rate will not be what it was. A currency with no rate on file
 * raises `UnknownExchangeRateError` — the run stops rather than paying somebody
 * against an invented number.
 */
async function stampLineCurrencies(input: {
  companyId: string
  on: Date
  lineItems: LineItemDraft[]
}) {
  const baseCurrency = await resolveBaseCurrency(input.companyId)
  const currencies = new Set(input.lineItems.map((line) => line.currency))
  const rateByCurrency = new Map<string, Prisma.Decimal>()

  for (const currency of currencies) {
    rateByCurrency.set(
      currency,
      await resolveExchangeRate({
        companyId: input.companyId,
        currency,
        baseCurrency,
        on: input.on,
      }),
    )
  }

  return input.lineItems.map((line) => {
    const exchangeRate = rateByCurrency.get(line.currency) ?? new Prisma.Decimal(1)
    return {
      ...line,
      exchangeRate,
      netBaseAmount: toBaseAmount(line.netAmount, exchangeRate),
    }
  })
}

type RunDraft = {
  lineItems: LineItemDraft[]
  totals: {
    grossTotal: Prisma.Decimal
    allowancesTotal: Prisma.Decimal
    deductionsTotal: Prisma.Decimal
    netTotal: Prisma.Decimal
    employerCostTotal: Prisma.Decimal
  }
  workflowNote: string
  warnings: string[]
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
  return {
    grossTotal: sumMoney(lineItems.map((line) => line.grossAmount)),
    allowancesTotal: sumMoney(lineItems.map((line) => line.allowancesTotal)),
    deductionsTotal: sumMoney(lineItems.map((line) => line.deductionsTotal)),
    netTotal: sumMoney(lineItems.map((line) => line.netAmount)),
    // Kept out of gross and net on purpose: the employer's contributions are a
    // cost to the company, not part of anybody's wage.
    employerCostTotal: sumMoney(lineItems.map((line) => line.employerCost ?? ZERO)),
  }
}

async function buildSalaryPayrollRunDraft(input: {
  companyId: string
  periodStart: Date
  periodEnd: Date
  employeeScopeJson?: string | null
  appliesToContractorsOnly: boolean
}): Promise<RunDraft & { gaps: string[] }> {
  // All the reading, the statutory lookups and the Zimbabwe arithmetic now live
  // in `lib/hr/payroll/` — `assembleSalaryRun` gathers, `computePayroll`
  // calculates, and this function only shapes the result for persistence. What
  // used to be here was `gross = base + allowances, net = gross - deductions`
  // and nothing else.
  const assembled = await assembleSalaryRun({
    companyId: input.companyId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    employeeScopeIds: parseEmployeeScopeIds(input.employeeScopeJson),
    appliesToContractorsOnly: input.appliesToContractorsOnly,
  })

  const warnings = [...assembled.warnings]

  if (assembled.lines.length > 0) {
    // Identity gaps are warnings, not refusals: an employee can be paid before
    // their BP number comes back from ZIMRA, but the P2 reporting them cannot be
    // filed — so say so now rather than at filing time.
    warnings.push(
      ...(await findReturnBlockers({
        companyId: input.companyId,
        employeeIds: assembled.lines.map((line) => line.employee.id),
      })),
    )
  }

  const lineItems: LineItemDraft[] = []
  for (const line of assembled.lines) {
    for (const slice of line.payroll.slices) {
      lineItems.push({
        employeeId: line.employee.id,
        compensationProfileId: line.profile.id,
        baseAmount: money(line.profile.baseAmount),
        variableAmount: ZERO,
        allowancesTotal: slice.allowancesTotal,
        deductionsTotal: slice.deductionsTotal,
        grossAmount: slice.grossAmount,
        netAmount: slice.netAmount,
        taxableGross: slice.taxableGross,
        employerCost: slice.employerCost,
        currency: slice.currency,
        notes: `Salary run for ${line.employee.name}.`,
        components: slice.components.map((component) => ({
          ruleId: component.ruleId,
          name: component.name,
          type: component.type,
          calcMethod: component.calcMethod,
          rateOrAmount: component.rateOrAmount,
          amount: component.amount,
          isTaxable: component.isTaxable,
          statutoryKey: component.statutoryKey,
          sequence: component.sequence,
          basis: component.basis,
        })),
      })
    }
  }

  return {
    lineItems,
    totals: deriveRunTotals(lineItems),
    workflowNote:
      "Salary payroll run generated from compensation profiles, active rules and the Zimbabwe statutory tables.",
    warnings,
    gaps: assembled.gaps,
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const logger = createRouteLogger({
    route: "/api/payroll/periods/[id]/generate-run",
    request,
  })
  logger.info("start")

  try {
    const sessionResult = await validateSession(request)
    if (sessionResult instanceof NextResponse) return sessionResult
    const { session } = sessionResult
    const denial = hrPermissionDenial(session, "hr.payroll", "create")
    if (denial) return errorResponse(denial, 403)
    if (!ensureApproverRole(session)) {
      return errorResponse("Insufficient permissions to generate payroll runs", 403)
    }

    const { id } = await params
    const body = await request.json()
    const validated = generateRunSchema.parse(body)
    logger.info("generate_run_requested", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      periodId: id,
      overwriteDraft: validated.overwriteDraft ?? false,
      requestedRunNumber: validated.runNumber,
    })

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      include: {
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
    if (period.status === "APPROVED" || period.status === "CLOSED") {
      return errorResponse("Approved or closed payroll periods cannot be regenerated", 400)
    }

    const draftRun = period.runs.find((run) => run.status === "DRAFT")
    if (draftRun && !validated.overwriteDraft) {
      logger.info("generate_run_conflict", {
        companyId: session.user.companyId,
        actorId: session.user.id,
        periodId: id,
        draftRunId: draftRun.id,
        statusCode: 409,
      })
      return errorResponse(
        "Draft payroll run already exists for this period. Pass overwriteDraft=true to regenerate.",
        409,
      )
    }

    const runNumber =
      validated.runNumber ??
      (period.runs.length > 0 ? Math.max(...period.runs.map((run) => run.runNumber)) + 1 : 1)

    let runDraft: RunDraft
    {
      // Seed the statutory tables if this company has none — a no-op for anyone
      // who already does, and it means enabling the payroll addon on an existing
      // workspace does not need a re-provision.
      await ensureHrPayrollDefaults(session.user.companyId)

      const salaryDraft = await buildSalaryPayrollRunDraft({
        companyId: session.user.companyId,
        periodStart: new Date(period.startDate),
        periodEnd: new Date(period.endDate),
        employeeScopeJson: period.employeeScopeJson,
        appliesToContractorsOnly: period.appliesToContractorsOnly,
      })

      // A gap in the statutory tables stops the run. Every gap is reported at
      // once, so an operator adds the rows in one pass rather than fixing one,
      // retrying, and finding the next.
      if (salaryDraft.gaps.length > 0) {
        logger.info("generate_run_statutory_gaps", {
          companyId: session.user.companyId,
          actorId: session.user.id,
          periodId: id,
          gapCount: salaryDraft.gaps.length,
          statusCode: 409,
        })
        return errorResponse(
          "This period is not covered by the statutory tables on file",
          409,
          { warnings: [...salaryDraft.warnings, ...salaryDraft.gaps] },
        )
      }

      runDraft = salaryDraft
      if (runDraft.lineItems.length === 0) {
        logger.info("generate_run_no_eligible_employees", {
          companyId: session.user.companyId,
          actorId: session.user.id,
          periodId: id,
          warningCount: runDraft.warnings.length,
          statusCode: 409,
        })
        return errorResponse("No eligible salary employees found for this period", 409, {
          warnings: runDraft.warnings,
        })
      }
    }

    // Freeze the FX rate before anything is written. A missing rate is a hard
    // stop, not a warning: the alternative is paying somebody in ZWG against a
    // rate nobody entered.
    let stampedLines: Awaited<ReturnType<typeof stampLineCurrencies>>
    try {
      stampedLines = await stampLineCurrencies({
        companyId: session.user.companyId,
        on: new Date(period.endDate),
        lineItems: runDraft.lineItems,
      })
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        logger.info("generate_run_missing_exchange_rate", {
          companyId: session.user.companyId,
          actorId: session.user.id,
          periodId: id,
          statusCode: 409,
        })
        return errorResponse(error.message, 409, { warnings: runDraft.warnings })
      }
      throw error
    }

    const createdRun = await prisma.$transaction(async (tx) => {
      if (draftRun && validated.overwriteDraft) {
        await tx.payrollRun.delete({ where: { id: draftRun.id } })
      }

      const created = await tx.payrollRun.create({
        data: {
          companyId: session.user.companyId,
          periodId: period.id,
          runNumber,
          status: "DRAFT",
          notes: validated.notes,
          grossTotal: runDraft.totals.grossTotal,
          allowancesTotal: runDraft.totals.allowancesTotal,
          deductionsTotal: runDraft.totals.deductionsTotal,
          netTotal: runDraft.totals.netTotal,
          employerCostTotal: runDraft.totals.employerCostTotal,
          createdById: session.user.id,
          lineItems: {
            create: stampedLines.map((line) => ({
              employeeId: line.employeeId,
              compensationProfileId: line.compensationProfileId,
              baseAmount: line.baseAmount,
              variableAmount: line.variableAmount,
              allowancesTotal: line.allowancesTotal,
              deductionsTotal: line.deductionsTotal,
              grossAmount: line.grossAmount,
              netAmount: line.netAmount,
              taxableGross: line.taxableGross ?? ZERO,
              employerCost: line.employerCost ?? ZERO,
              currency: line.currency,
              exchangeRate: line.exchangeRate,
              netBaseAmount: line.netBaseAmount,
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
                        // The three fields a payslip shows the working from and
                        // a statutory return is summed over.
                        statutoryKey: component.statutoryKey ?? undefined,
                        sequence: component.sequence ?? undefined,
                        basis: component.basis ?? undefined,
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

      // Computing a run is the act that decides what everybody is paid and what
      // the state is owed, so it goes on the tamper-evident chain even though
      // nothing has been approved yet. The statutory figures are recorded here
      // because a later dispute is about what the tables said *at compute time* —
      // and by then somebody may have corrected a rate.
      await writePlatformAuditEvent(
        {
          companyId: session.user.companyId,
          actorId: session.user.id,
          eventType: "hr.payroll.run.computed",
          entityType: "PAYROLL_RUN",
          entityId: created.id,
          payload: {
            runNumber,
            periodKey: period.periodKey,
            lineCount: stampedLines.length,
            grossTotal: runDraft.totals.grossTotal.toFixed(2),
            netTotal: runDraft.totals.netTotal.toFixed(2),
            deductionsTotal: runDraft.totals.deductionsTotal.toFixed(2),
            employerCostTotal: runDraft.totals.employerCostTotal.toFixed(2),
            warningCount: runDraft.warnings.length,
          },
        },
        tx,
      )

      return created
    })

    logger.info("generate_run_success", {
      companyId: session.user.companyId,
      actorId: session.user.id,
      periodId: id,
      payrollRunId: createdRun.id,
      runNumber: createdRun.runNumber,
      lineItemCount: createdRun.lineItems.length,
      warningCount: runDraft.warnings.length,
      statusCode: 201,
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
    logger.error("generate_run_failed", error)
    return errorResponse("Failed to generate payroll run")
  }
}
