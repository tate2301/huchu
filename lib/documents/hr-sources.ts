/**
 * HR documents — the payslip.
 *
 * Built the way `lib/documents/schools-sources.ts` builds a report card, and for
 * the same reason: one pipeline means one branding snapshot, one PDF renderer,
 * one CSV path and one template editor, rather than a payroll module that grows
 * its own printing.
 *
 * A payslip is a `letterTemplate`, not a `recordTemplate`. The difference is the
 * bank block at the foot: a payslip with the company's account details on it
 * reads like a demand for money from the person it is paying. That block belongs
 * only on paper that asks to be paid.
 *
 * **What a payslip has to show.** Not just the net figure. An employee who
 * queries their PAYE deserves the working — the taxable gross it was struck on,
 * the band, the credits, the levy on the tax rather than on the wage — and an
 * employer who is asked "why is my NSSA only $31.50 on a $5,000 salary" needs to
 * be able to point at the ceiling. So every stage the engine computed is a line,
 * in the order it happened, with the figure it was calculated on.
 *
 * The employer's own contributions are shown too, in their own section and
 * excluded from every total. An employee should be able to see what was paid on
 * their behalf; they should not be able to mistake it for money they were paid.
 *
 * So is the leave left as at the period's end, the one place most employees
 * see it, and any disciplinary penalty payroll took that period, among the
 * deductions. The shaping is pure, in `payslip-payload.ts`; rows a layout adds in
 * Build are put on by `payslip-rows.ts` when it prints.
 */

import { prisma } from "@/lib/prisma";
import { payslipLeave, payslipPayload, type PayslipLeave } from "@/lib/documents/payslip-payload";
import type { UniversalDocumentPayload } from "@/lib/documents/types";
import { computeLeaveBalances } from "@/lib/people/leave/balances";

type Resolution = {
  targetType: "LIST" | "RECORD" | "DASHBOARD";
  documentType:
    | "REPORT_TABLE"
    | "DASHBOARD_PACK"
    | "SALES_INVOICE"
    | "SALES_QUOTATION"
    | "SALES_RECEIPT"
    | "GENERIC_RECORD";
  sourceKey: string;
  fileName: string;
  payload: UniversalDocumentPayload;
  rowsForCsv?: Array<Record<string, unknown>>;
};

/** Every HR document the pipeline can render. */
export const HR_DOCUMENT_SOURCE_KEYS = ["hr.payslip"] as const;

export type HrDocumentSourceKey = (typeof HR_DOCUMENT_SOURCE_KEYS)[number];

export function isHrDocumentSourceKey(key: string): key is HrDocumentSourceKey {
  return (HR_DOCUMENT_SOURCE_KEYS as readonly string[]).includes(key);
}

/**
 * What a caller needs to render each of these.
 *
 * `selfServiceFeature` is the second door. Payroll data is the most sensitive
 * data in the product, so the ordinary bar is an HR feature and an HR role — but
 * an employee must be able to fetch **their own** payslip without being given
 * access to everybody's. The render route checks the HR feature first and falls
 * back to matching `Employee.userId` against the caller.
 */
export const HR_DOCUMENT_ACCESS: Record<
  HrDocumentSourceKey,
  { feature: string; selfServiceFeature?: string }
> = {
  "hr.payslip": {
    feature: "hr.payslips",
    selfServiceFeature: "hr.employee-self-service",
  },
};

/**
 * The employee's leave as at the end of the run's period: the leave year that
 * period ends in, accrued to its month, less what was approved or asked for
 * by then. A payslip reprinted next year still says what was left that month.
 */
async function leaveAsAt(companyId: string, employeeId: string, asAt: Date): Promise<PayslipLeave[]> {
  const year = asAt.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
  const [types, entitlements, requests] = await Promise.all([
    prisma.leaveType.findMany({
      where: {
        companyId,
        isActive: true,
        effectiveFrom: { lte: asAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: yearStart } }],
      },
      orderBy: [{ code: "asc" }, { effectiveFrom: "desc" }],
    }),
    prisma.leaveEntitlement.findMany({ where: { companyId, employeeId, year } }),
    prisma.leaveRequest.findMany({
      where: { companyId, employeeId, startDate: { gte: yearStart, lte: asAt < yearEnd ? asAt : yearEnd } },
      select: { leaveTypeId: true, status: true, workingDays: true, startDate: true },
    }),
  ]);
  // The newest version of each type, as the leave balances read them.
  const newest = new Map<string, (typeof types)[number]>();
  for (const type of types) if (!newest.has(type.code)) newest.set(type.code, type);
  const leaveTypes = [...newest.values()];
  const balances = computeLeaveBalances({
    year,
    leaveTypes,
    entitlements,
    requests,
    // The period's month counts, as it does on the leave page.
    monthsElapsed: asAt.getUTCMonth() + 1,
  });
  return payslipLeave({
    balances,
    accruing: new Set(leaveTypes.filter((type) => type.accrualMethod === "MONTHLY_ACCRUAL").map((type) => type.id)),
    granted: new Set(entitlements.map((entitlement) => entitlement.leaveTypeId)),
  });
}

/** One employee's payslip for one run. */
export async function resolvePayslip(
  companyId: string,
  lineItemId: string,
): Promise<Resolution> {
  const line = await prisma.payrollLineItem.findFirst({
    where: { id: lineItemId, run: { companyId } },
    select: {
      id: true,
      employeeId: true,
      baseAmount: true,
      grossAmount: true,
      allowancesTotal: true,
      deductionsTotal: true,
      netAmount: true,
      taxableGross: true,
      employerCost: true,
      currency: true,
      exchangeRate: true,
      netBaseAmount: true,
      employee: {
        select: {
          name: true,
          employeeId: true,
          jobTitle: true,
          taxNumber: true,
          nssaNumber: true,
          taxStatus: true,
          department: { select: { name: true } },
        },
      },
      run: {
        select: {
          runNumber: true,
          status: true,
          period: {
            select: { periodKey: true, startDate: true, endDate: true, dueDate: true },
          },
        },
      },
      components: {
        orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
        select: {
          name: true,
          type: true,
          calcMethod: true,
          rateOrAmount: true,
          amount: true,
          isTaxable: true,
          statutoryKey: true,
          basis: true,
          sequence: true,
        },
      },
    },
  });

  if (!line) throw new Error("Payslip not found");

  // Disciplinary penalties are among the line's components: what payroll
  // took, in Deductions and net pay (`lib/hr/payroll/penalties.ts`).
  const leave = await leaveAsAt(companyId, line.employeeId, line.run.period.endDate);
  const shaped = payslipPayload(line, leave);

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "hr.payslip",
    fileName: shaped.fileName,
    payload: shaped.payload,
    rowsForCsv: shaped.rows,
  };
}

/**
 * The run line the payslip layout's page shows: the newest period's first
 * employee, or null when the workspace has run no payroll yet.
 */
export async function latestPayslipLine(companyId: string): Promise<{ id: string; name: string; periodEnd: Date } | null> {
  const line = await prisma.payrollLineItem.findFirst({
    where: { run: { companyId } },
    orderBy: [{ run: { period: { endDate: "desc" } } }, { run: { runNumber: "desc" } }, { employee: { name: "asc" } }],
    select: { id: true, employee: { select: { name: true } }, run: { select: { period: { select: { endDate: true } } } } },
  });
  return line ? { id: line.id, name: line.employee.name, periodEnd: line.run.period.endDate } : null;
}

/** Dispatch for the shared source registry. */
export async function resolveHrDocumentSource(input: {
  companyId: string;
  sourceKey: HrDocumentSourceKey;
  recordId?: string | null;
}): Promise<Resolution> {
  switch (input.sourceKey) {
    case "hr.payslip":
      if (!input.recordId) throw new Error("recordId is required for a payslip");
      return resolvePayslip(input.companyId, input.recordId);
  }
}

/**
 * Whether this caller may print this payslip.
 *
 * Returns the reason on refusal rather than a bare boolean, so the route can say
 * something useful. Both refusals return the **same** message on purpose: a
 * distinct "no such payslip" would let somebody enumerate which line items
 * exist by probing ids.
 */
export async function canRenderPayslip(input: {
  companyId: string;
  lineItemId: string;
  userId: string;
  /** True when the caller holds an HR payroll role, not merely a login. */
  hasPayrollAccess: boolean;
}): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  const refusal = {
    allowed: false as const,
    reason: "That payslip is not available to you.",
  };

  const line = await prisma.payrollLineItem.findFirst({
    where: { id: input.lineItemId, run: { companyId: input.companyId } },
    select: { employee: { select: { userId: true } } },
  });
  if (!line) return refusal;

  if (input.hasPayrollAccess) return { allowed: true };
  // Self-service: an employee sees their own and nobody else's.
  if (line.employee.userId && line.employee.userId === input.userId) {
    return { allowed: true };
  }
  return refusal;
}
