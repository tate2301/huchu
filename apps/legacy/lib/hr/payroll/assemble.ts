/**
 * Gathering what the engine needs.
 *
 * `lib/hr/payroll/engine.ts` is pure and knows nothing about the database. This
 * file is the seam: it reads the compensation profiles, the rules, the
 * attendance, the statutory tables and the FX rates, shapes them into
 * `EngineInput`, and hands over. It writes nothing.
 *
 * Keeping the read and the arithmetic apart is what lets the arithmetic be
 * tested against a hand-worked payslip. It also means a statutory gap is
 * discovered here — with a database to consult and a helpful error to raise —
 * rather than in the middle of a calculation.
 */

import { Prisma } from "@corelithzw/db";
import type { CompensationRule, EmployeeTaxStatus } from "@corelithzw/db";

import {
  clampAtZero,
  money,
  multiplyMoney,
  resolveBaseCurrency,
  resolveExchangeRate,
  sumMoney,
  toBaseAmount,
  ZERO,
} from "@/lib/money";
import { prisma } from "@corelithzw/db/client";
import { calculateRuleAmount } from "@/lib/hr/payroll/rules";
import {
  findStatutoryGaps,
  resolveNecAgreement,
  resolvePayeTable,
  resolveStatutoryRate,
  resolveTaxCredits,
} from "@/lib/hr/statutory/tables";
import {
  computePayroll,
  type ComputedPayroll,
  type EngineDeduction,
  type EngineEarning,
  type EngineSlice,
} from "./engine";

type Db = typeof prisma | Prisma.TransactionClient;

/**
 * A rule carrying this key is the employee's own medical aid contribution, and
 * its amount feeds the 50% credit.
 *
 * Marked on the rule rather than held as a column on `Employee`, because it *is*
 * a deduction — it comes out of the wage — and duplicating the figure in two
 * places would let them disagree.
 */
export const MEDICAL_AID_CONTRIBUTION_KEY = "MEDICAL_AID_CONTRIBUTION";

/**
 * Rules whose deduction lands before PAYE is struck.
 *
 * Order is not inferable from the type: a pension deduction and a union
 * subscription are both `DEDUCTION`, and only one of them reduces the tax. So a
 * rule declares it, and these are the keys that mean "before".
 */
const PRE_TAX_KEYS = new Set([
  "PENSION",
  "RETIREMENT_ANNUITY",
  MEDICAL_AID_CONTRIBUTION_KEY,
]);

/** Zimbabwe's qualifying age for the elderly persons' credit. */
const ELDERLY_AGE = 55;

function isElderlyAt(dateOfBirth: Date | null, on: Date) {
  if (!dateOfBirth) return false;
  const years =
    (on.getTime() - dateOfBirth.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return years >= ELDERLY_AGE;
}

export type AssembleEmployee = {
  id: string;
  name: string;
  employeeId: string;
  departmentId: string | null;
  gradeId: string | null;
  defaultCurrency: string;
  taxStatus: EmployeeTaxStatus;
  dateOfBirth: Date | null;
  hasDisability: boolean;
  overtimeHourlyRate: Prisma.Decimal | null;
};

export type AssembleProfile = {
  id: string;
  employeeId: string;
  baseAmount: Prisma.Decimal;
  currency: string;
};

type RuleForAssembly = Pick<
  CompensationRule,
  | "id"
  | "name"
  | "type"
  | "calcMethod"
  | "value"
  | "cap"
  | "taxable"
  | "currency"
  | "sequence"
  | "statutoryKey"
  | "employeeId"
  | "departmentId"
  | "gradeId"
>;

export type AssembledLine = {
  employee: AssembleEmployee;
  profile: AssembleProfile;
  payroll: ComputedPayroll;
};

export type AssembleResult = {
  lines: AssembledLine[];
  warnings: string[];
  /** Statutory gaps, if any. Non-empty means the run must not proceed. */
  gaps: string[];
  baseCurrency: string;
};

/**
 * Overtime money owed per employee for a period.
 *
 * `Attendance.overtime` has held hours since the module was written and payroll
 * has never once queried it — so an employee who worked a Saturday was paid as
 * though they had not. An employee with no hourly rate is skipped rather than
 * paid at a guessed rate; some contracts bank overtime as leave.
 */
async function overtimePayByEmployee(
  input: {
    employees: AssembleEmployee[];
    periodStart: Date;
    periodEnd: Date;
  },
  db: Db = prisma,
): Promise<Map<string, Prisma.Decimal>> {
  const payable = input.employees.filter(
    (employee) =>
      employee.overtimeHourlyRate !== null &&
      employee.overtimeHourlyRate.greaterThan(0),
  );
  if (payable.length === 0) return new Map();

  const rows = await db.attendance.groupBy({
    by: ["employeeId"],
    where: {
      employeeId: { in: payable.map((employee) => employee.id) },
      date: { gte: input.periodStart, lte: input.periodEnd },
      overtime: { gt: 0 },
    },
    _sum: { overtime: true },
  });

  const rateById = new Map(
    payable.map((employee) => [employee.id, employee.overtimeHourlyRate!]),
  );
  const byEmployee = new Map<string, Prisma.Decimal>();
  for (const row of rows) {
    const hours = row._sum.overtime ?? 0;
    if (hours <= 0) continue;
    const hourly = rateById.get(row.employeeId);
    if (!hourly) continue;
    byEmployee.set(row.employeeId, multiplyMoney(hours, hourly));
  }
  return byEmployee;
}

/**
 * Assemble and compute a salary run for a period.
 *
 * Returns computed payroll per employee plus any statutory gaps. Deliberately
 * returns the gaps rather than throwing on them: the caller wants to show an
 * operator every gap at once, and it needs the warnings alongside.
 */
export async function assembleSalaryRun(
  input: {
    companyId: string;
    periodStart: Date;
    periodEnd: Date;
    employeeScopeIds?: string[];
    appliesToContractorsOnly: boolean;
  },
  db: Db = prisma,
): Promise<AssembleResult> {
  const on = input.periodEnd;
  const baseCurrency = await resolveBaseCurrency(input.companyId);

  const employeeWhere: Prisma.EmployeeWhereInput = {
    companyId: input.companyId,
    isActive: true,
    ...(input.appliesToContractorsOnly ? { employmentType: "CONTRACT" } : {}),
    ...(input.employeeScopeIds && input.employeeScopeIds.length > 0
      ? { id: { in: input.employeeScopeIds } }
      : {}),
  };

  const employees = (await db.employee.findMany({
    where: employeeWhere,
    select: {
      id: true,
      name: true,
      employeeId: true,
      departmentId: true,
      gradeId: true,
      defaultCurrency: true,
      taxStatus: true,
      dateOfBirth: true,
      hasDisability: true,
      overtimeHourlyRate: true,
    },
    orderBy: { name: "asc" },
  })) as AssembleEmployee[];

  if (employees.length === 0) {
    return {
      lines: [],
      warnings: ["No eligible employees found for this payroll period scope."],
      gaps: [],
      baseCurrency,
    };
  }

  const employeeIds = employees.map((employee) => employee.id);

  const profiles = await db.compensationProfile.findMany({
    where: {
      employeeId: { in: employeeIds },
      workflowStatus: "APPROVED",
      status: "ACTIVE",
      effectiveFrom: { lte: input.periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.periodStart } }],
    },
    select: { id: true, employeeId: true, baseAmount: true, currency: true },
    orderBy: [{ employeeId: "asc" }, { effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  const profileByEmployee = new Map<string, AssembleProfile>();
  for (const profile of profiles) {
    if (!profileByEmployee.has(profile.employeeId)) {
      profileByEmployee.set(profile.employeeId, profile);
    }
  }

  const rules = (await db.compensationRule.findMany({
    where: { companyId: input.companyId, workflowStatus: "APPROVED", isActive: true },
    select: {
      id: true,
      name: true,
      type: true,
      calcMethod: true,
      value: true,
      cap: true,
      taxable: true,
      currency: true,
      sequence: true,
      statutoryKey: true,
      employeeId: true,
      departmentId: true,
      gradeId: true,
    },
    orderBy: [{ sequence: "asc" }, { name: "asc" }],
  })) as RuleForAssembly[];

  const overtimeByEmployee = await overtimePayByEmployee(
    { employees, periodStart: input.periodStart, periodEnd: input.periodEnd },
    db,
  );

  // Which currencies this run will actually touch — the profile's, falling back
  // to the employee's default.
  const currencies = new Set<string>();
  for (const employee of employees) {
    const profile = profileByEmployee.get(employee.id);
    if (!profile) continue;
    currencies.add((profile.currency || employee.defaultCurrency).toUpperCase());
  }

  // Only worth checking if there is something to pay. A period where nobody has
  // an approved profile has nothing to compute, and reporting "no AIDS levy
  // rate" for it would bury the answer the operator actually needs — that the
  // profiles are missing.
  if (currencies.size === 0) {
    return {
      lines: [],
      warnings: employees.map(
        (employee) =>
          `${employee.name} (${employee.employeeId}) skipped: no approved compensation profile.`,
      ),
      gaps: [],
      baseCurrency,
    };
  }

  const gaps = await findStatutoryGaps(
    { companyId: input.companyId, currencies: Array.from(currencies), on },
    db,
  );
  if (gaps.length > 0) {
    return { lines: [], warnings: [], gaps, baseCurrency };
  }

  // Resolve each per-currency and cross-currency table once, not per employee.
  const payeByCurrency = new Map<string, Awaited<ReturnType<typeof resolvePayeTable>>>();
  const creditsByCurrency = new Map<string, Awaited<ReturnType<typeof resolveTaxCredits>>>();
  const necByCurrency = new Map<string, Awaited<ReturnType<typeof resolveNecAgreement>>>();
  const rateByCurrency = new Map<string, Prisma.Decimal>();
  const bonusExemptionByCurrency = new Map<string, Prisma.Decimal>();

  for (const currency of currencies) {
    payeByCurrency.set(
      currency,
      await resolvePayeTable({ companyId: input.companyId, currency, on }, db),
    );
    creditsByCurrency.set(
      currency,
      await resolveTaxCredits({ companyId: input.companyId, currency, on }, db),
    );
    necByCurrency.set(
      currency,
      await resolveNecAgreement({ companyId: input.companyId, currency, on }, db),
    );
    rateByCurrency.set(
      currency,
      await resolveExchangeRate({
        companyId: input.companyId,
        currency,
        baseCurrency,
        on,
      }),
    );
    const bonus = await resolveStatutoryRate(
      { companyId: input.companyId, key: "BONUS_EXEMPTION", currency, on },
      db,
    );
    bonusExemptionByCurrency.set(currency, money(bonus?.ceilingAmount ?? ZERO));
  }

  // The NSSA rates are read in the BASE currency: one ceiling per employee
  // across every currency they are paid in, not one per currency.
  const nssaEmployee = await resolveStatutoryRate(
    { companyId: input.companyId, key: "NSSA_POBS_EMPLOYEE", currency: baseCurrency, on },
    db,
  );
  const nssaEmployer = await resolveStatutoryRate(
    { companyId: input.companyId, key: "NSSA_POBS_EMPLOYER", currency: baseCurrency, on },
    db,
  );
  const aidsLevy = await resolveStatutoryRate(
    { companyId: input.companyId, key: "AIDS_LEVY", on },
    db,
  );
  const apwcs = await resolveStatutoryRate(
    { companyId: input.companyId, key: "NSSA_APWCS", on },
    db,
  );
  const zimdef = await resolveStatutoryRate(
    { companyId: input.companyId, key: "ZIMDEF", on },
    db,
  );
  const standardsDevelopmentLevy = await resolveStatutoryRate(
    { companyId: input.companyId, key: "STANDARDS_DEVELOPMENT_LEVY", on },
    db,
  );

  const lines: AssembledLine[] = [];
  const warnings: string[] = [];

  for (const employee of employees) {
    const profile = profileByEmployee.get(employee.id);
    if (!profile) {
      warnings.push(
        `${employee.name} (${employee.employeeId}) skipped: no approved compensation profile.`,
      );
      continue;
    }

    const currency = (profile.currency || employee.defaultCurrency).toUpperCase();
    const payeTable = payeByCurrency.get(currency)!;
    const exchangeRate = rateByCurrency.get(currency)!;

    const applicable = rules.filter((rule) => {
      if (rule.employeeId && rule.employeeId !== employee.id) return false;
      if (rule.departmentId && rule.departmentId !== employee.departmentId) return false;
      if (rule.gradeId && rule.gradeId !== employee.gradeId) return false;
      // A rule denominated in another currency does not apply to this line.
      // Silently converting it would add a USD allowance to a ZWG wage, which
      // is what `computeLineTotals` used to do.
      if (rule.currency && rule.currency.toUpperCase() !== currency) return false;
      return true;
    });

    const earnings: EngineEarning[] = [
      {
        name: "Basic salary",
        amount: profile.baseAmount,
        isTaxable: true,
        kind: "BASE",
      },
    ];

    const overtime = overtimeByEmployee.get(employee.id);
    if (overtime && overtime.greaterThan(0)) {
      earnings.push({
        name: "Overtime",
        amount: overtime,
        isTaxable: true,
        kind: "VARIABLE",
      });
    }

    const preTaxDeductions: EngineDeduction[] = [];
    const postTaxDeductions: EngineDeduction[] = [];
    let medicalAidContribution = ZERO;

    for (const rule of applicable) {
      const amount = calculateRuleAmount({
        baseAmount: profile.baseAmount,
        calcMethod: rule.calcMethod,
        value: rule.value,
        cap: rule.cap,
      });
      if (amount.isZero()) continue;

      if (rule.type === "ALLOWANCE") {
        earnings.push({
          name: rule.name,
          amount,
          isTaxable: rule.taxable,
          kind: "ALLOWANCE",
          ruleId: rule.id,
        });
        continue;
      }

      // Statutory deductions and employer contributions are the engine's
      // business, not a company rule's — a company that has written its own
      // "PAYE" rule would otherwise have it charged twice.
      if (rule.type !== "DEDUCTION") continue;

      if (rule.statutoryKey === MEDICAL_AID_CONTRIBUTION_KEY) {
        medicalAidContribution = sumMoney([medicalAidContribution, amount]);
      }

      const target =
        rule.statutoryKey && PRE_TAX_KEYS.has(rule.statutoryKey)
          ? preTaxDeductions
          : postTaxDeductions;
      target.push({ name: rule.name, amount, ruleId: rule.id });
    }

    const nec = necByCurrency.get(currency);

    const slice: EngineSlice = {
      currency,
      exchangeRate,
      earnings,
      preTaxDeductions,
      postTaxDeductions,
      payeTable,
      credits: creditsByCurrency.get(currency) ?? [],
      medicalAidContribution,
      bonusExemption: bonusExemptionByCurrency.get(currency) ?? ZERO,
      necEmployee: nec
        ? {
            ratePercent: nec.employeeRatePercent,
            fixedAmount: nec.employeeFixedAmount,
            councilName: nec.councilName,
          }
        : undefined,
      necEmployer: nec
        ? {
            ratePercent: nec.employerRatePercent,
            fixedAmount: nec.employerFixedAmount,
            councilName: nec.councilName,
          }
        : undefined,
    };

    const payroll = computePayroll({
      baseCurrency,
      taxStatus: employee.taxStatus,
      isElderly: isElderlyAt(employee.dateOfBirth, on),
      isDisabled: employee.hasDisability,
      slices: [slice],
      aidsLevy,
      nssaEmployee,
      nssaEmployer,
      apwcs,
      zimdef,
      standardsDevelopmentLevy,
    });

    // Surface the identity gaps a statutory return will trip over, as warnings
    // rather than refusals — an employee can be paid before their BP number
    // arrives, but the P2 that reports them cannot be filed.
    lines.push({ employee, profile, payroll });
  }

  return { lines, warnings, gaps: [], baseCurrency };
}

/**
 * Identity gaps that will block a statutory return.
 *
 * Warnings, not refusals: an employee can legitimately be paid before their BP
 * number comes back from ZIMRA. The P2 that reports them cannot be filed, so an
 * operator needs to know now rather than at filing time.
 */
export async function findReturnBlockers(
  input: { companyId: string; employeeIds: string[] },
  db: Db = prisma,
): Promise<string[]> {
  if (input.employeeIds.length === 0) return [];

  const rows = await db.employee.findMany({
    where: { id: { in: input.employeeIds } },
    select: {
      name: true,
      employeeId: true,
      taxNumber: true,
      nssaNumber: true,
      taxStatus: true,
    },
  });

  const blockers: string[] = [];
  for (const row of rows) {
    if (row.taxStatus === "CONTRACTOR") continue;
    if (!row.taxNumber?.trim()) {
      blockers.push(
        `${row.name} (${row.employeeId}) has no tax (BP) number — the P2 cannot report them.`,
      );
    }
    if (!row.nssaNumber?.trim()) {
      blockers.push(
        `${row.name} (${row.employeeId}) has no NSSA number — the NSSA schedule cannot report them.`,
      );
    }
  }
  return blockers;
}

/** Convert a slice's net pay to base currency, for the ledger. */
export function netInBaseCurrency(slice: {
  netAmount: Prisma.Decimal;
  exchangeRate: Prisma.Decimal;
}) {
  return toBaseAmount(slice.netAmount, slice.exchangeRate);
}

export { clampAtZero };
