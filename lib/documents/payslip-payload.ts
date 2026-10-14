/**
 * The payslip as it prints, shaped from one run line. Pure: `hr-sources.ts`
 * reads the line and the employee's leave and hands them here, and the
 * layout's preview hands it a sample, so the page in Build is the payslip as
 * it prints rather than a stand-in.
 *
 * The reasons for what is on it (the working, the employer's contributions in
 * their own section, the notes) are in `hr-sources.ts`.
 */

import { Prisma } from "@prisma/client";

import type { LeaveBalance } from "@/lib/people/leave/balances";
import { PAYSLIP_EMPLOYER_TITLE, PAYSLIP_LEAVE_TITLE } from "@/lib/documents/payslip-rows";
import type { UniversalDocumentPayload } from "@/lib/documents/types";

type Money = Prisma.Decimal;

export type PayslipComponent = {
  name: string;
  type: string;
  calcMethod: string;
  rateOrAmount: Money;
  amount: Money;
  isTaxable: boolean;
  statutoryKey: string | null;
  basis: Money | null;
};

export type PayslipLine = {
  baseAmount: Money;
  grossAmount: Money;
  allowancesTotal: Money;
  deductionsTotal: Money;
  netAmount: Money;
  taxableGross: Money;
  employerCost: Money;
  currency: string;
  exchangeRate: Money;
  netBaseAmount: Money;
  employee: {
    name: string;
    employeeId: string;
    jobTitle: string | null;
    taxNumber: string | null;
    nssaNumber: string | null;
    taxStatus: string;
    department: { name: string } | null;
  };
  run: {
    runNumber: number;
    status: string;
    period: { periodKey: string; startDate: Date; endDate: Date; dueDate: Date | null };
  };
  components: PayslipComponent[];
};

/** One kind of leave as the payslip prints it: what is left of what has built up, at the period's end. */
export type PayslipLeave = { name: string; remaining: Money; entitled: Money };

const ZERO = new Prisma.Decimal(0);

function money(value: Money | null | undefined): string {
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

/** "11 of 22 days": two places at most, as the balances keep them, and no trailing zeros. */
export function leaveLeftValue(leave: PayslipLeave): string {
  const figure = (value: Money) => value.toDecimalPlaces(2).toString();
  return `${figure(leave.remaining)} of ${figure(leave.entitled)} ${leave.entitled.equals(1) ? "day" : "days"}`;
}

/**
 * Which balances a payslip prints. Leave that builds up month by month
 * (annual leave) always: the payslip is where an employee sees it grow. Leave
 * granted on need (sick, compassionate, maternity) only once this employee
 * has been granted some this year or has taken or asked for some: a payslip
 * listing 98 days of maternity leave for everyone reads as an entitlement it
 * is not. Unlimited leave has no balance to print.
 */
export function payslipLeave(input: {
  balances: readonly LeaveBalance[];
  /** Leave types that accrue monthly. */
  accruing: ReadonlySet<string>;
  /** Leave types this employee has an entitlement row for, this year. */
  granted: ReadonlySet<string>;
}): PayslipLeave[] {
  return input.balances
    .filter((balance) => !balance.isUnlimited)
    .filter(
      (balance) =>
        input.accruing.has(balance.leaveTypeId) ||
        input.granted.has(balance.leaveTypeId) ||
        balance.taken.greaterThan(0) ||
        balance.pending.greaterThan(0),
    )
    .map((balance) => ({ name: balance.name, remaining: balance.remaining, entitled: balance.entitled }));
}

/** How a rate reads: a percentage stage shows its rate, a fixed one nothing (see `hr-sources.ts`). */
function rateLabel(component: { calcMethod: string; rateOrAmount: Money }): string {
  return component.calcMethod === "PERCENT" ? `${component.rateOrAmount.toFixed(2)}%` : "";
}

/** A tax credit is stored as an allowance so it can be shown, but it is a reduction in tax, not an earning. */
function isCredit(statutoryKey: string | null) {
  return Boolean(statutoryKey?.startsWith("TAX_CREDIT_"));
}

/** The payslip for one run line, with the employee's leave as at the period's end. */
export function payslipPayload(
  line: PayslipLine,
  leave: readonly PayslipLeave[],
): { fileName: string; payload: UniversalDocumentPayload; rows: Array<Record<string, unknown>> } {
  const { employee, run } = line;

  // Three groups, because they mean three different things and a single list
  // would let an employer contribution read as a deduction from the wage.
  const earnings = line.components.filter((component) => component.type === "ALLOWANCE" && !isCredit(component.statutoryKey));
  const deductions = line.components.filter((component) => component.type === "DEDUCTION" || component.type === "STATUTORY_DEDUCTION");
  const credits = line.components.filter((component) => isCredit(component.statutoryKey));
  const employerContributions = line.components.filter((component) => component.type === "EMPLOYER_CONTRIBUTION");

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
  if (employee.taxStatus === "CONTRACTOR") {
    notes.push("Paid gross as a contractor. No PAYE has been withheld and no NSSA contribution made — this income is yours to declare.");
  }
  if (employee.taxStatus === "EXEMPT") {
    notes.push("Recorded as exempt from PAYE.");
  }
  if (isForeignCurrency) {
    notes.push(
      `Paid in ${line.currency} at ${line.exchangeRate.toFixed(4)} per unit of the company's reporting currency, the rate in force at ${day(run.period.endDate)}. That is ${money(line.netBaseAmount)} in reporting currency.`,
    );
  }
  if (employerRows.length > 0) {
    notes.push("Employer contributions are paid by the company on your behalf. They are not deducted from your pay and are not part of your gross.");
  }
  if (!employee.taxNumber?.trim() && employee.taxStatus !== "CONTRACTOR") {
    notes.push("No tax (BP) number is on file for you. Please give it to HR — the monthly PAYE return cannot report you without it.");
  }
  if (run.status !== "APPROVED") {
    notes.push(`This payroll run is ${run.status.toLowerCase()} and not yet approved. The figures may change.`);
  }

  return {
    fileName: `payslip-${slug(employee.employeeId)}-${slug(run.period.periodKey)}.pdf`,
    rows,
    payload: {
      title: "Payslip",
      subtitle: `${employee.name} — ${run.period.periodKey}`,
      meta: [
        { label: "Employee", value: employee.name },
        { label: "Employee number", value: employee.employeeId },
        ...(employee.jobTitle ? [{ label: "Position", value: employee.jobTitle }] : []),
        ...(employee.department?.name ? [{ label: "Department", value: employee.department.name }] : []),
        { label: "Pay period", value: run.period.periodKey },
        { label: "Period", value: `${day(run.period.startDate)} to ${day(run.period.endDate)}` },
        { label: "Currency", value: line.currency },
        // On the payslip because ZIMRA and NSSA identify the person by these,
        // and an employee checking their own record should be able to see them.
        { label: "Tax (BP) number", value: employee.taxNumber?.trim() || "Not on file" },
        { label: "NSSA number", value: employee.nssaNumber?.trim() || "Not on file" },
      ],
      badge: run.status === "APPROVED" ? { label: "APPROVED", tone: "positive" } : { label: run.status, tone: "warning" },
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
          ...(leave.length > 0 ? [{ title: PAYSLIP_LEAVE_TITLE, rows: leave.map((entry) => ({ label: entry.name, value: leaveLeftValue(entry) })) }] : []),
          ...(employerRows.length > 0
            ? [
                {
                  title: PAYSLIP_EMPLOYER_TITLE,
                  rows: [
                    ...employerRows.map((row) => ({
                      label: row.calculatedOn ? `${row.stage} (${row.rate || "fixed"} of ${row.calculatedOn})` : row.stage,
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
      // What a row added in Build can be filled from (`payslip-rows.ts`).
      fields: {
        "line.basic": money(line.baseAmount),
        "line.allowances": money(line.allowancesTotal),
        "line.gross": money(line.grossAmount),
        "line.taxableGross": money(line.taxableGross),
        "line.deductions": money(line.deductionsTotal),
        "line.net": money(line.netAmount),
        "line.employerCost": money(line.employerCost),
        "line.netBase": money(line.netBaseAmount),
        "line.exchangeRate": line.exchangeRate.toFixed(4),
        "line.currency": line.currency,
        "employee.department": employee.department?.name ?? "",
        "employee.position": employee.jobTitle ?? "",
        "period.payDate": day(run.period.dueDate),
        "run.number": String(run.runNumber),
      },
    },
  };
}

const d = (value: string) => new Prisma.Decimal(value);

/**
 * The payslip the layout's page shows when the workspace has no run line to
 * show, or the person looking may not see one: one fitter's October.
 */
export function samplePayslipPayload(): UniversalDocumentPayload {
  const component = (name: string, type: string, amount: string, extra: Partial<PayslipComponent> = {}): PayslipComponent => ({
    name,
    type,
    calcMethod: "FIXED",
    rateOrAmount: d(amount),
    amount: d(amount),
    isTaxable: type === "ALLOWANCE",
    statutoryKey: null,
    basis: null,
    ...extra,
  });
  return payslipPayload(
    {
      baseAmount: d("780"),
      grossAmount: d("780"),
      allowancesTotal: d("0"),
      deductionsTotal: d("188.19"),
      netAmount: d("591.81"),
      taxableGross: d("748.50"),
      employerCost: d("39.30"),
      currency: "USD",
      exchangeRate: d("1"),
      netBaseAmount: d("591.81"),
      employee: {
        name: "Tinashe Moyo",
        employeeId: "EMP-0005",
        jobTitle: "Fitter",
        taxNumber: "2000441093",
        nssaNumber: "NSSA-0005",
        taxStatus: "STANDARD",
        department: { name: "Fitting" },
      },
      run: {
        runNumber: 1,
        status: "APPROVED",
        period: {
          periodKey: "2026-10",
          startDate: new Date("2026-10-01T00:00:00.000Z"),
          endDate: new Date("2026-10-31T23:59:59.999Z"),
          dueDate: new Date("2026-10-23T00:00:00.000Z"),
        },
      },
      components: [
        component("Basic pay", "ALLOWANCE", "780"),
        component("NSSA", "STATUTORY_DEDUCTION", "31.50", { calcMethod: "PERCENT", rateOrAmount: d("4.5"), basis: d("700") }),
        component("PAYE", "STATUTORY_DEDUCTION", "152.13", { basis: d("748.50") }),
        component("AIDS levy", "STATUTORY_DEDUCTION", "4.56", { calcMethod: "PERCENT", rateOrAmount: d("3"), basis: d("152.13") }),
        component("NSSA", "EMPLOYER_CONTRIBUTION", "31.50", { calcMethod: "PERCENT", rateOrAmount: d("4.5"), basis: d("700") }),
        component("ZIMDEF", "EMPLOYER_CONTRIBUTION", "7.80", { calcMethod: "PERCENT", rateOrAmount: d("1"), basis: d("780") }),
      ],
    },
    [{ name: "Annual leave", remaining: d("11"), entitled: d("22") }],
  ).payload;
}
