import type { LeaveAccrualMethod, LeaveUnit, Prisma } from "@corelithzw/db"
import { prisma } from "@corelithzw/db/client"

/**
 * Zimbabwe leave defaults, as a starting set.
 *
 * The same shape and the same warning as `lib/hr/statutory/zimbabwe-pack.ts`:
 * every row is marked `isSeeded` with a `source` telling the operator to check it,
 * and the whole pack bails if the company already has leave types — a corrected
 * entitlement must never be reverted by a re-run.
 *
 * The figures are from the Labour Act [Chapter 28:01] as commonly applied, and
 * they are the numbers an employer is most likely to *start* from rather than the
 * numbers they will end on: a mine's NEC agreement and a school's terms both
 * differ, which is why the types are effective-dated.
 */

export const SEEDED_LEAVE_EFFECTIVE_FROM = new Date("2026-01-01T00:00:00.000Z")

export const SEEDED_LEAVE_SOURCE =
  "Seeded starting set — VERIFY against the Labour Act and any NEC agreement before use"

type SeedLeaveType = {
  code: string
  name: string
  unit: LeaveUnit
  accrualMethod: LeaveAccrualMethod
  defaultEntitlement: string
  isPaid: boolean
  requiresDocumentAfterDays: number | null
  carryOverLimit: string | null
  carryOverExpiresOn: string | null
  policyNote: string
}

const LEAVE_TYPES: SeedLeaveType[] = [
  {
    code: "ANNUAL",
    name: "Annual leave",
    unit: "DAY",
    accrualMethod: "MONTHLY_ACCRUAL",
    defaultEntitlement: "22",
    isPaid: true,
    requiresDocumentAfterDays: null,
    // The Act provides for accumulation; most employers cap it. Five days is a
    // common cap and a visible one — an operator who wants more changes it.
    carryOverLimit: "5",
    carryOverExpiresOn: "12-31",
    policyNote: "Accrues monthly. Up to 5 unused days carry over and expire 31 December.",
  },
  {
    code: "SICK",
    name: "Sick leave",
    unit: "DAY",
    accrualMethod: "ANNUAL_GRANT",
    defaultEntitlement: "12",
    isPaid: true,
    // The Act's full-pay period runs to 90 days in a year with a certificate;
    // 12 days without one is the practical threshold employers apply.
    requiresDocumentAfterDays: 3,
    carryOverLimit: null,
    carryOverExpiresOn: null,
    policyNote: "A doctor's note is required from day 3. Does not carry over.",
  },
  {
    code: "COMPASSIONATE",
    name: "Compassionate leave",
    unit: "DAY",
    accrualMethod: "ANNUAL_GRANT",
    defaultEntitlement: "3",
    isPaid: true,
    requiresDocumentAfterDays: null,
    carryOverLimit: null,
    carryOverExpiresOn: null,
    policyNote: "For the death or serious illness of an immediate family member.",
  },
  {
    code: "MATERNITY",
    name: "Maternity leave",
    unit: "DAY",
    accrualMethod: "ANNIVERSARY_GRANT",
    // 98 days on full pay under the Act. Granted per qualifying event rather than
    // per year, which is why the accrual method is the anniversary one and the
    // entitlement is not reduced by a partial year.
    defaultEntitlement: "98",
    isPaid: true,
    requiresDocumentAfterDays: null,
    carryOverLimit: null,
    carryOverExpiresOn: null,
    policyNote: "98 days on full pay. Granted per qualifying event, not per year.",
  },
  {
    code: "UNPAID",
    name: "Unpaid leave",
    unit: "DAY",
    accrualMethod: "UNLIMITED",
    defaultEntitlement: "0",
    // The one type payroll must know about: an unpaid day reduces the month's
    // pay, and recording it anywhere else means payroll never hears.
    isPaid: false,
    requiresDocumentAfterDays: null,
    carryOverLimit: null,
    carryOverExpiresOn: null,
    policyNote: "Approved at the employer's discretion. Reduces pay for the days taken.",
  },
]

/**
 * Zimbabwe public holidays.
 *
 * Fixed-date only. The moveable feasts — Good Friday, Easter Monday — and the
 * Monday-substitution rule for a holiday falling on a Sunday are deliberately not
 * computed here: getting Easter wrong by a day is worse than an operator adding
 * two rows they can see, and a wrong seeded holiday silently changes what leave
 * costs.
 */
const FIXED_HOLIDAYS: Array<{ monthDay: string; name: string; doublePayIfWorked: boolean }> = [
  { monthDay: "01-01", name: "New Year's Day", doublePayIfWorked: true },
  { monthDay: "02-21", name: "Robert Gabriel Mugabe National Youth Day", doublePayIfWorked: true },
  { monthDay: "04-18", name: "Independence Day", doublePayIfWorked: true },
  { monthDay: "05-01", name: "Workers' Day", doublePayIfWorked: true },
  { monthDay: "05-25", name: "Africa Day", doublePayIfWorked: true },
  { monthDay: "08-11", name: "Heroes' Day", doublePayIfWorked: true },
  { monthDay: "08-12", name: "Defence Forces Day", doublePayIfWorked: true },
  { monthDay: "12-22", name: "Unity Day", doublePayIfWorked: true },
  { monthDay: "12-25", name: "Christmas Day", doublePayIfWorked: true },
  { monthDay: "12-26", name: "Boxing Day", doublePayIfWorked: true },
]

type Db = Prisma.TransactionClient | typeof prisma

export type SeedLeavePackResult = {
  seeded: boolean
  reason?: string
  leaveTypes: number
  publicHolidays: number
}

export async function seedZimbabweLeavePack(
  input: { companyId: string; effectiveFrom?: Date; year?: number },
  db: Db = prisma,
): Promise<SeedLeavePackResult> {
  const effectiveFrom = input.effectiveFrom ?? SEEDED_LEAVE_EFFECTIVE_FROM
  const year = input.year ?? effectiveFrom.getUTCFullYear()

  const existing = await db.leaveType.count({ where: { companyId: input.companyId } })
  if (existing > 0) {
    // Bail on the whole pack, not per row. A company that has corrected its annual
    // entitlement down to 20 days must not have 22 written back over it, and a
    // partial seed is harder to reason about than none.
    return {
      seeded: false,
      reason: "This company already has leave types; the pack does not overwrite them.",
      leaveTypes: 0,
      publicHolidays: 0,
    }
  }

  await db.leaveType.createMany({
    data: LEAVE_TYPES.map((type) => ({
      companyId: input.companyId,
      code: type.code,
      name: type.name,
      unit: type.unit,
      accrualMethod: type.accrualMethod,
      defaultEntitlement: type.defaultEntitlement,
      isPaid: type.isPaid,
      requiresDocumentAfterDays: type.requiresDocumentAfterDays,
      carryOverLimit: type.carryOverLimit,
      carryOverExpiresOn: type.carryOverExpiresOn,
      policyNote: type.policyNote,
      effectiveFrom,
      source: SEEDED_LEAVE_SOURCE,
      isSeeded: true,
    })),
  })

  const holidays = FIXED_HOLIDAYS.map((holiday) => ({
    companyId: input.companyId,
    date: new Date(`${year}-${holiday.monthDay}T00:00:00.000Z`),
    name: holiday.name,
    isPaid: true,
    doublePayIfWorked: holiday.doublePayIfWorked,
    siteId: null,
    isSeeded: true,
  }))

  await db.publicHoliday.createMany({ data: holidays, skipDuplicates: true })

  return {
    seeded: true,
    leaveTypes: LEAVE_TYPES.length,
    publicHolidays: holidays.length,
  }
}
