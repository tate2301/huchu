import { Prisma, type LeaveAccrualMethod, type LeaveRequestStatus } from "@corelithzw/db"

/**
 * What is left.
 *
 * A balance is derived here and stored nowhere. `LeaveEntitlement` records what
 * was granted, carried over and adjusted; what has been taken is the sum of
 * approved requests, and what is pending is the sum of submitted ones. Keeping a
 * `remaining` column would mean two numbers that disagree the first time a request
 * is edited or withdrawn, and the one on screen would be whichever was written
 * last.
 *
 * Pure, for the same reason as `working-days.ts`: the arithmetic is the part that
 * has to be right, and it is checkable without a database.
 */

/** Statuses that consume entitlement. */
const CONSUMING: readonly LeaveRequestStatus[] = ["APPROVED"]
/** Statuses that reserve entitlement without having spent it. */
const RESERVING: readonly LeaveRequestStatus[] = ["SUBMITTED"]

export type LeaveRequestLike = {
  leaveTypeId: string
  status: LeaveRequestStatus
  workingDays: Prisma.Decimal | string | number
  startDate: Date
}

export type EntitlementLike = {
  leaveTypeId: string
  year: number
  granted: Prisma.Decimal | string | number
  carriedOver: Prisma.Decimal | string | number
  adjustment: Prisma.Decimal | string | number
}

export type LeaveTypeLike = {
  id: string
  code: string
  name: string
  accrualMethod: LeaveAccrualMethod
  defaultEntitlement: Prisma.Decimal | string | number
  policyNote: string | null
  carryOverLimit: Prisma.Decimal | string | number | null
}

export type LeaveBalance = {
  leaveTypeId: string
  code: string
  name: string
  policyNote: string | null
  /** Granted + carried over + adjustment. What the year started with. */
  entitled: Prisma.Decimal
  taken: Prisma.Decimal
  pending: Prisma.Decimal
  /** Entitled − taken − pending. What can still be asked for. */
  remaining: Prisma.Decimal
  /** Null for an UNLIMITED type, where a remaining figure would be a fiction. */
  isUnlimited: boolean
}

function dec(value: Prisma.Decimal | string | number | null | undefined) {
  return value === null || value === undefined
    ? new Prisma.Decimal(0)
    : new Prisma.Decimal(value.toString())
}

/**
 * A month's worth of accrual, for a type that accrues monthly.
 *
 * The Labour Act describes annual leave as accruing, not as a lump sum, so an
 * employee three months into the year has three twelfths — not the whole 22 days
 * they could otherwise book and then leave.
 *
 * `monthsElapsed` is passed in rather than read off a clock, so a balance as at a
 * past date is askable and the tests are not time-dependent.
 */
export function accruedEntitlement(input: {
  accrualMethod: LeaveAccrualMethod
  fullEntitlement: Prisma.Decimal | string | number
  monthsElapsed: number
}): Prisma.Decimal {
  const full = dec(input.fullEntitlement)
  if (input.accrualMethod !== "MONTHLY_ACCRUAL") return full
  const months = Math.max(0, Math.min(12, Math.floor(input.monthsElapsed)))
  // Two places: a twelfth of 22 days is 1.8333…, and rounding it to whole days
  // either gives away a day or steals one.
  return full.times(months).dividedBy(12).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

/**
 * Carry-over capped at the type's limit.
 *
 * Returns the *forfeited* amount as well, because "you lost 4 days on 31 December"
 * is the thing an employee needs told, and a function that silently clamps cannot
 * tell them.
 */
export function carryOverFor(input: {
  remainingAtYearEnd: Prisma.Decimal | string | number
  carryOverLimit: Prisma.Decimal | string | number | null
}): { carriedOver: Prisma.Decimal; forfeited: Prisma.Decimal } {
  const remaining = dec(input.remainingAtYearEnd)
  if (remaining.lessThanOrEqualTo(0)) {
    return { carriedOver: new Prisma.Decimal(0), forfeited: new Prisma.Decimal(0) }
  }
  // A null limit means no carry-over at all, not unlimited carry-over. Unused
  // days expiring is the default in every policy this has been checked against;
  // an employer who wants them kept sets a limit.
  if (input.carryOverLimit === null || input.carryOverLimit === undefined) {
    return { carriedOver: new Prisma.Decimal(0), forfeited: remaining }
  }
  const limit = dec(input.carryOverLimit)
  if (remaining.lessThanOrEqualTo(limit)) {
    return { carriedOver: remaining, forfeited: new Prisma.Decimal(0) }
  }
  return { carriedOver: limit, forfeited: remaining.minus(limit) }
}

/**
 * Balances for one employee, one leave year.
 *
 * Requests outside the year are ignored rather than filtered by the caller, so a
 * caller passing an employee's whole history gets the right answer for the year
 * asked about.
 */
export function computeLeaveBalances(input: {
  year: number
  leaveTypes: readonly LeaveTypeLike[]
  entitlements: readonly EntitlementLike[]
  requests: readonly LeaveRequestLike[]
  /** Months of the leave year elapsed, for monthly accrual. Defaults to a full year. */
  monthsElapsed?: number
}): LeaveBalance[] {
  const entitlementByType = new Map(
    input.entitlements
      .filter((row) => row.year === input.year)
      .map((row) => [row.leaveTypeId, row]),
  )

  return input.leaveTypes.map((type) => {
    const entitlement = entitlementByType.get(type.id)
    const isUnlimited = type.accrualMethod === "UNLIMITED"

    // No entitlement row falls back to the type's default rather than to zero: a
    // new joiner who has not been through a grant run still has leave, and
    // showing them zero reads as "you have none" rather than "nobody has run the
    // grant yet".
    const base = entitlement
      ? dec(entitlement.granted)
      : accruedEntitlement({
          accrualMethod: type.accrualMethod,
          fullEntitlement: type.defaultEntitlement,
          monthsElapsed: input.monthsElapsed ?? 12,
        })

    const entitled = base
      .plus(entitlement ? dec(entitlement.carriedOver) : 0)
      .plus(entitlement ? dec(entitlement.adjustment) : 0)

    let taken = new Prisma.Decimal(0)
    let pending = new Prisma.Decimal(0)
    for (const request of input.requests) {
      if (request.leaveTypeId !== type.id) continue
      if (request.startDate.getUTCFullYear() !== input.year) continue
      const days = dec(request.workingDays)
      if (CONSUMING.includes(request.status)) taken = taken.plus(days)
      else if (RESERVING.includes(request.status)) pending = pending.plus(days)
      // DRAFT, REJECTED, CANCELLED and WITHDRAWN consume nothing. A withdrawn
      // request putting its days back is the point of having the status.
    }

    return {
      leaveTypeId: type.id,
      code: type.code,
      name: type.name,
      policyNote: type.policyNote,
      entitled,
      taken,
      pending,
      remaining: isUnlimited
        ? new Prisma.Decimal(0)
        : entitled.minus(taken).minus(pending),
      isUnlimited,
    }
  })
}

/**
 * Whether a request can be afforded, and why not.
 *
 * A message rather than a boolean, following `hrPermissionDenial`: the caller is
 * a route that returns through `errorResponse`, and "you have 3 days left and
 * asked for 5" is the only useful form of no.
 */
export function leaveAffordabilityDenial(input: {
  balance: LeaveBalance
  requestedDays: Prisma.Decimal | string | number
}): string | null {
  if (input.balance.isUnlimited) return null
  const requested = dec(input.requestedDays)
  if (requested.lessThanOrEqualTo(0)) {
    return "That range contains no working days"
  }
  if (requested.greaterThan(input.balance.remaining)) {
    return `${input.balance.name}: ${input.balance.remaining.toString()} day(s) left, ${requested.toString()} requested`
  }
  return null
}
