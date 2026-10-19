import { addDays, monthStart } from "./format";
import { INVOICE_PERIOD_LABEL, INVOICE_PERIODS, type InvoicePeriod } from "./invoices";

/**
 * The Filters menu's periods every Bills & spending list shares (as Invoices'
 * do): any time, this month, last month, this year. No database here.
 */
export const PERIODS = INVOICE_PERIODS;
export type Period = InvoicePeriod;
export const PERIOD_LABEL = INVOICE_PERIOD_LABEL;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);

/** The days a period covers, end exclusive; null for any time. */
export function periodRange(period: Period, today: string): { gte: Date; lt: Date } | null {
  if (period === "any") return null;
  if (period === "this-month") return { gte: midnight(monthStart(today)), lt: midnight(addDays(today, 1)) };
  if (period === "this-year") return { gte: midnight(`${today.slice(0, 4)}-01-01`), lt: midnight(addDays(today, 1)) };
  const start = monthStart(today);
  return { gte: midnight(monthStart(addDays(start, -1))), lt: midnight(start) };
}
