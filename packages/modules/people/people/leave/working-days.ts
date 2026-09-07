import { Prisma } from "@corelithzw/db"

/**
 * How many working days a leave request costs.
 *
 * Pure — no Prisma, no clock. The holidays and the work week are passed in, so
 * the arithmetic can be checked against a calendar without a database, and so the
 * same function serves the request form (previewing a cost) and the submit route
 * (freezing it).
 *
 * Two decisions worth stating.
 *
 * The count is frozen on the request at submission time and never recomputed.
 * Recomputing means that adding a public holiday months later silently restates
 * every balance that ever spanned it — including leave already taken and paid.
 *
 * Weekends come from a work-week bitmask rather than a hard-coded Saturday and
 * Sunday. A mine runs a six-day week and a retailer's staff work Sundays, and
 * both were previously unrepresentable.
 */

/** Days of the week a company works, `0` = Sunday through `6` = Saturday. */
export type WorkWeek = ReadonlySet<number>

/** Monday to Friday. The default when a company has not said otherwise. */
export const DEFAULT_WORK_WEEK: WorkWeek = new Set([1, 2, 3, 4, 5])

export type HolidayLike = { date: Date; siteId?: string | null }

function dayKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate(),
  ).padStart(2, "0")}`
}

/**
 * The holidays that apply at one site.
 *
 * A row with no `siteId` is company-wide; a row with one applies only there. A
 * site-specific holiday at *another* site is not a holiday here, which is the
 * whole reason the column is nullable.
 */
export function holidayKeysForSite(
  holidays: readonly HolidayLike[],
  siteId?: string | null,
): ReadonlySet<string> {
  const keys = new Set<string>()
  for (const holiday of holidays) {
    if (holiday.siteId && holiday.siteId !== siteId) continue
    keys.add(dayKey(holiday.date))
  }
  return keys
}

export type WorkingDayCount = {
  workingDays: Prisma.Decimal
  /** Every calendar day in the range, whether or not it was counted. */
  calendarDays: number
  /** Days skipped because the company does not work them. */
  restDays: number
  /** Days skipped because they are public holidays. */
  holidays: number
}

/**
 * Count working days between two dates, inclusive of both.
 *
 * Returns zero rather than throwing when the range is inverted — a caller
 * validating a form wants a number to show, and the route that persists it
 * validates the order separately.
 */
export function countWorkingDays(input: {
  startDate: Date
  endDate: Date
  workWeek?: WorkWeek
  holidayKeys?: ReadonlySet<string>
  /** A half day costs 0.5 and only makes sense for a single-day request. */
  isHalfDay?: boolean
}): WorkingDayCount {
  const workWeek = input.workWeek ?? DEFAULT_WORK_WEEK
  const holidayKeys = input.holidayKeys ?? new Set<string>()

  const start = Date.UTC(
    input.startDate.getUTCFullYear(),
    input.startDate.getUTCMonth(),
    input.startDate.getUTCDate(),
  )
  const end = Date.UTC(
    input.endDate.getUTCFullYear(),
    input.endDate.getUTCMonth(),
    input.endDate.getUTCDate(),
  )

  if (end < start) {
    return {
      workingDays: new Prisma.Decimal(0),
      calendarDays: 0,
      restDays: 0,
      holidays: 0,
    }
  }

  let counted = 0
  let restDays = 0
  let holidays = 0
  let calendarDays = 0

  for (let stamp = start; stamp <= end; stamp += 86_400_000) {
    const day = new Date(stamp)
    calendarDays += 1
    if (!workWeek.has(day.getUTCDay())) {
      restDays += 1
      continue
    }
    if (holidayKeys.has(dayKey(day))) {
      // A holiday inside a leave range is not leave. Counting it would charge an
      // employee a day of annual leave for a day nobody was working.
      holidays += 1
      continue
    }
    counted += 1
  }

  const isHalfDay = Boolean(input.isHalfDay) && calendarDays === 1 && counted === 1
  return {
    workingDays: new Prisma.Decimal(isHalfDay ? "0.5" : counted),
    calendarDays,
    restDays,
    holidays,
  }
}
