import {
  Prisma,
  type CompensationCalcMethod,
  type CompensationRuleType,
  type GoldSettlementMode,
  type PayrollCycle,
} from "@prisma/client"
import type { AuthenticatedSession } from "@/lib/api-utils"
import { emitWorkflowNotificationFromApprovalAction } from "@/lib/notifications"

type ApprovalActionInput = {
  companyId: string
  entityType:
    | "PAYROLL_RUN"
    | "DISBURSEMENT_BATCH"
    | "ADJUSTMENT_ENTRY"
    | "COMPENSATION_PROFILE"
    | "COMPENSATION_RULE"
    | "GOLD_SHIFT_ALLOCATION"
    | "DISCIPLINARY_ACTION"
  entityId: string
  action: "CREATE" | "SUBMIT" | "APPROVE" | "REJECT" | "ADJUST"
  actedById: string
  fromStatus?: string | null
  toStatus?: string | null
  note?: string | null
}

export function isApproverRole(role: string | undefined) {
  return role === "MANAGER" || role === "SUPERADMIN"
}

export function ensureApproverRole(session: AuthenticatedSession) {
  return isApproverRole(session.user.role)
}

export function isTwoStepActionAllowed(
  submittedById: string | null | undefined,
  actorId: string,
  actorRole?: string,
  options?: {
    allowSuperadminSelfAction?: boolean
  },
) {
  if (options?.allowSuperadminSelfAction && actorRole === "SUPERADMIN") {
    return true
  }
  return !submittedById || submittedById !== actorId
}

export function derivePaidStatus(
  amount: number,
  paidAmount?: number | null,
): "DUE" | "PARTIAL" | "PAID" {
  const paid = paidAmount ?? 0
  if (paid <= 0) return "DUE"
  if (paid >= amount) return "PAID"
  return "PARTIAL"
}

export function monthPeriodKey(date: Date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${year}-${month}`
}

export function startOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0))
}

export function endOfDayUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999))
}

export function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0))
}

export function endOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

export function startOfFortnightUtc(date: Date) {
  const startDay = date.getUTCDate() <= 15 ? 1 : 16
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), startDay, 0, 0, 0, 0))
}

export function endOfFortnightUtc(date: Date) {
  if (date.getUTCDate() <= 15) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15, 23, 59, 59, 999))
  }
  return endOfMonthUtc(date)
}

export function deriveCycleWindow(anchorDate: Date, cycle: PayrollCycle) {
  if (cycle === "FORTNIGHTLY") {
    const startDate = startOfFortnightUtc(anchorDate)
    const endDate = endOfFortnightUtc(anchorDate)
    return { startDate, endDate }
  }
  return {
    startDate: startOfMonthUtc(anchorDate),
    endDate: endOfMonthUtc(anchorDate),
  }
}

export function deriveCyclePeriodKey(startDate: Date, cycle: PayrollCycle) {
  if (cycle === "FORTNIGHTLY") {
    const half = startDate.getUTCDate() <= 15 ? "H1" : "H2"
    return `${monthPeriodKey(startDate)}-${half}`
  }
  return monthPeriodKey(startDate)
}

export function nextCycleAnchor(startDate: Date, cycle: PayrollCycle) {
  if (cycle === "FORTNIGHTLY") {
    if (startDate.getUTCDate() <= 1) {
      return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 16, 0, 0, 0, 0))
    }
    return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1, 0, 0, 0, 0))
  }
  return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1, 0, 0, 0, 0))
}

export function buildGoldPaymentWhere(input: {
  employeeIds: string[]
  settlementMode: GoldSettlementMode
  periodStart: Date
  periodEnd: Date
}) {
  const base = {
    employeeId: { in: input.employeeIds },
    type: "GOLD" as const,
  }

  if (input.settlementMode === "NEXT_PERIOD") {
    return {
      ...base,
      dueDate: {
        gte: input.periodStart,
        lte: input.periodEnd,
      },
    }
  }

  return {
    ...base,
    periodStart: { lte: input.periodEnd },
    periodEnd: { gte: input.periodStart },
  }
}

export function generateDisbursementCode(date = new Date()) {
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  const stamp = `${yyyy}${mm}${dd}`
  const suffix = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0")
  return `DB-${stamp}-${suffix}`
}

export async function createApprovalAction(
  tx: Prisma.TransactionClient,
  input: ApprovalActionInput,
) {
  await tx.approvalAction.create({
    data: {
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actedById: input.actedById,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus ?? undefined,
      note: input.note ?? undefined,
    },
  })

  await emitWorkflowNotificationFromApprovalAction(tx, {
    companyId: input.companyId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actedById: input.actedById,
  })
}

export function calculateRuleAmount(input: {
  baseAmount: number
  calcMethod: CompensationCalcMethod
  value: number
  cap?: number | null
}) {
  let amount =
    input.calcMethod === "PERCENT" ? (input.baseAmount * input.value) / 100 : input.value
  if (input.cap !== null && input.cap !== undefined) {
    amount = Math.min(amount, input.cap)
  }
  return Math.max(amount, 0)
}

export type ComputedRuleComponent = {
  name: string
  ruleId?: string
  type: CompensationRuleType
  calcMethod: CompensationCalcMethod
  rateOrAmount: number
  amount: number
  isTaxable: boolean
}

export function computeLineTotals(input: {
  baseAmount: number
  variableAmount: number
  rules: ComputedRuleComponent[]
}) {
  const allowancesTotal = input.rules
    .filter((rule) => rule.type === "ALLOWANCE")
    .reduce((sum, rule) => sum + rule.amount, 0)
  const deductionsTotal = input.rules
    .filter((rule) => rule.type === "DEDUCTION")
    .reduce((sum, rule) => sum + rule.amount, 0)
  const grossAmount = input.baseAmount + input.variableAmount + allowancesTotal
  const netAmount = Math.max(grossAmount - deductionsTotal, 0)

  return {
    allowancesTotal,
    deductionsTotal,
    grossAmount,
    netAmount,
  }
}
