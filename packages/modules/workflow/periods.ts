import type { PayrollCycle } from "@corelithzw/db"

/**
 * Period windows and keys, in UTC.
 *
 * Every boundary here is built with `Date.UTC`, never local-time constructors: a
 * server in Harare and a server in UTC must agree on which month a payroll
 * period is, or the same run computes over different days depending on where it
 * ran.
 *
 * `PayrollCycle` is the only cycle vocabulary in the product, so timesheet
 * periods and leave accrual windows share these helpers rather than growing a
 * second set that rounds a fortnight differently.
 */

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

function startOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0))
}

function endOfMonthUtc(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999))
}

function startOfFortnightUtc(date: Date) {
  const startDay = date.getUTCDate() <= 15 ? 1 : 16
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), startDay, 0, 0, 0, 0))
}

function endOfFortnightUtc(date: Date) {
  if (date.getUTCDate() <= 15) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15, 23, 59, 59, 999))
  }
  return endOfMonthUtc(date)
}

export function deriveCycleWindow(anchorDate: Date, cycle: PayrollCycle) {
  if (cycle === "FORTNIGHTLY") {
    return {
      startDate: startOfFortnightUtc(anchorDate),
      endDate: endOfFortnightUtc(anchorDate),
    }
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
  if (cycle === "FORTNIGHTLY" && startDate.getUTCDate() <= 1) {
    return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 16, 0, 0, 0, 0))
  }
  return new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1, 0, 0, 0, 0))
}
