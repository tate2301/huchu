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
 */

import { Prisma } from "@corelithzw/db";

import { prisma } from "@corelithzw/db/client";
import type { UniversalDocumentPayload } from "@corelithzw/module-documents/types";

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

const ZERO = new Prisma.Decimal(0);

function money(value: Prisma.Decimal | null | undefined): string {
  return (value ?? ZERO).toFixed(2);
}

function day(value: Date | null | undefined): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * How a rate reads on the payslip.
 *
 * A percentage stage shows its rate; a fixed one shows nothing, because "4.50"
 * in a rate column next to a $4.50 deduction invites the reader to think the two
 * are related.
 */
function rateLabel(component: {
  calcMethod: string;
  rateOrAmount: Prisma.Decimal;
}): string {
  if (component.calcMethod === "PERCENT") {
    return `${component.rateOrAmount.toFixed(2)}%`;
  }
  return "";
}

/**
 * Which side of the payslip a component belongs on.
 *
 * A tax credit is stored as an `ALLOWANCE` so the payslip can show it, but it is
 * not an earning — it is a reduction in tax. Putting it in the earnings column
 * would make gross look larger than the employee was paid.
 */
function isCredit(statutoryKey: string | null) {
  return Boolean(statutoryKey?.startsWith("TAX_CREDIT_"));
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
      notes: true,
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
          approvedAt: true,
          journalEntryId: true,
          postingSkippedReason: true,
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
        },
      },
    },
  });

  if (!line) throw new Error("Payslip not found");

  const { employee, run } = line;

  // Three groups, because they mean three different things and a single list
  // would let an employer contribution read as a deduction from the wage.
  const earnings = line.components.filter(
    (component) => component.type === "ALLOWANCE" && !isCredit(component.statutoryKey),
  );
  const deductions = line.components.filter(
    (component) =>
      component.type === "DEDUCTION" || component.type === "STATUTORY_DEDUCTION",
  );
  const credits = line.components.filter((component) => isCredit(component.statutoryKey));
  const employerContributions = line.components.filter(
    (component) => component.type === "EMPLOYER_CONTRIBUTION",
  );

  const rows = [
    ...earnings.map((component) => ({
      stage: component.name,
      kind: "Earning",
      rate: rateLabel(component),
      calculatedOn: component.basis ? money(component.basis) : "",
      amount: money(component.amount),
      taxable: component.isTaxable ? "Yes" : "No",
    })),
    ...deductions.map((component) => ({
      stage: component.name,
      kind: component.type === "STATUTORY_DEDUCTION" ? "Statutory" : "Deduction",
      rate: rateLabel(component),
      // The figure the stage was struck on. This is the column that answers
      // "why is my NSSA only 31.50" — it shows the capped 700, not the salary.
      calculatedOn: component.basis ? money(component.basis) : "",
      amount: `(${money(component.amount)})`,
      taxable: "",
    })),
    ...credits.map((component) => ({
      stage: component.name,
      kind: "Tax credit",
      rate: rateLabel(component),
      calculatedOn: component.basis ? money(component.basis) : "",
      // Shown as a reduction in the tax, not as money received.
      amount: `−${money(component.amount)} tax`,
      taxable: "",
    })),
  ];

  const employerRows = employerContributions.map((component) => ({
    stage: component.name,
    rate: rateLabel(component),
    calculatedOn: component.basis ? money(component.basis) : "",
    amount: money(component.amount),
  }));

  const isForeignCurrency = !line.exchangeRate.equals(1);

  const notes: string[] = [];
  if (line.employee.taxStatus === "CONTRACTOR") {
    notes.push(
      "Paid gross as a contractor. No PAYE has been withheld and no NSSA contribution made — this income is yours to declare.",
    );
  }
  if (line.employee.taxStatus === "EXEMPT") {
    notes.push("Recorded as exempt from PAYE.");
  }
  if (isForeignCurrency) {
    notes.push(
      `Paid in ${line.currency} at ${line.exchangeRate.toFixed(4)} per unit of the company's reporting currency, the rate in force at ${day(run.period.endDate)}. That is ${money(line.netBaseAmount)} in reporting currency.`,
    );
  }
  if (employerRows.length > 0) {
    notes.push(
      "Employer contributions are paid by the company on your behalf. They are not deducted from your pay and are not part of your gross.",
    );
  }
  if (!employee.taxNumber?.trim() && employee.taxStatus !== "CONTRACTOR") {
    notes.push(
      "No tax (BP) number is on file for you. Please give it to HR — the monthly PAYE return cannot report you without it.",
    );
  }
  if (run.status !== "APPROVED") {
    notes.push(
      `This payroll run is ${run.status.toLowerCase()} and not yet approved. The figures may change.`,
    );
  }

  return {
    targetType: "RECORD",
    documentType: "GENERIC_RECORD",
    sourceKey: "hr.payslip",
    fileName: `payslip-${slug(employee.employeeId)}-${slug(run.period.periodKey)}.pdf`,
    payload: {
      title: "Payslip",
      subtitle: `${employee.name} — ${run.period.periodKey}`,
      meta: [
        { label: "Employee", value: employee.name },
        { label: "Employee number", value: employee.employeeId },
        ...(employee.jobTitle ? [{ label: "Position", value: employee.jobTitle }] : []),
        ...(employee.department?.name
          ? [{ label: "Department", value: employee.department.name }]
          : []),
        { label: "Pay period", value: run.period.periodKey },
        { label: "Period", value: `${day(run.period.startDate)} to ${day(run.period.endDate)}` },
        { label: "Currency", value: line.currency },
        // On the payslip because ZIMRA and NSSA identify the person by these,
        // and an employee checking their own record should be able to see them.
        { label: "Tax (BP) number", value: employee.taxNumber?.trim() || "Not on file" },
        { label: "NSSA number", value: employee.nssaNumber?.trim() || "Not on file" },
      ],
      badge:
        run.status === "APPROVED"
          ? { label: "APPROVED", tone: "positive" }
          : { label: run.status, tone: "warning" },
      record: {
        sections: [
          {
            title: "How your pay was worked out",
            rows: [
              { label: "Basic salary", value: money(line.baseAmount) },
              { label: "Gross pay", value: money(line.grossAmount) },
              // The slice PAYE was actually struck on — gross less the
              // non-taxable allowances, NSSA and the pre-tax deductions.
              { label: "Taxable gross", value: money(line.taxableGross) },
              { label: "Total deductions", value: money(line.deductionsTotal) },
              { label: "Net pay", value: money(line.netAmount) },
            ],
          },
          ...(employerRows.length > 0
            ? [
                {
                  title: "Paid by your employer on your behalf",
                  rows: [
                    ...employerRows.map((row) => ({
                      label: row.calculatedOn
                        ? `${row.stage} (${row.rate || "fixed"} of ${row.calculatedOn})`
                        : row.stage,
                      value: row.amount,
                    })),
                    { label: "Total employer contributions", value: money(line.employerCost) },
                  ],
                },
              ]
            : []),
        ],
        lines: rows,
        lineColumns: [
          { key: "stage", label: "Item" },
          { key: "kind", label: "Type" },
          { key: "rate", label: "Rate" },
          { key: "calculatedOn", label: "Calculated on" },
          { key: "amount", label: "Amount" },
          { key: "taxable", label: "Taxable" },
        ],
      },
      totals: [
        { label: "Gross pay", value: money(line.grossAmount) },
        { label: "Total deductions", value: money(line.deductionsTotal) },
        { label: "Net pay", value: money(line.netAmount), emphasis: true },
      ],
      notes,
    },
    rowsForCsv: rows,
  };
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
