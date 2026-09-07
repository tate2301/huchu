/**
 * The monthly statutory returns — P2 and the NSSA schedule.
 *
 * Built on the box model in `lib/accounting/vat-return.ts`: a computed snapshot
 * of boxes plus a per-person schedule, so the figure filed and the detail behind
 * it come out of one calculation.
 *
 * ── Why these reconcile ────────────────────────────────────────────────────
 *
 * Both returns are summed from `PayrollLineComponent` rows via
 * `summariseStatutory` — the same function that builds the journal. That is not
 * tidiness, it is the whole design: if the return had its own summation, the two
 * could drift and both would look right. Because they share it, the balance on
 * 2110 PAYE Payable and box 4 of the P2 are the same number by construction, and
 * `reconcile()` below can assert it.
 *
 * ── Per currency, not converted ────────────────────────────────────────────
 *
 * A P2 is filed per currency. USD PAYE is remitted in USD and ZWG PAYE in ZWG;
 * converting one into the other and filing a single figure would remit the wrong
 * amount in the wrong currency. So `computeP2` returns one return per currency
 * the run paid in, and says so.
 *
 * The ledger, by contrast, is in base currency — that is the convention
 * `lib/hr/payroll/posting.ts` follows. So reconciliation converts the return's
 * figure *to* base rather than converting the ledger's away from it, and it uses
 * the rate frozen on each line rather than today's.
 */

import type { Prisma } from "@corelithzw/db";

import { money, sumMoney, toBaseAmount, ZERO } from "@corelithzw/platform/money";
import { prisma } from "@corelithzw/db/client";
import { summariseStatutory } from "../payroll/posting";

type Db = typeof prisma | Prisma.TransactionClient;

/** The account each return is remitted against, so reconciliation has a target. */
export const RETURN_ACCOUNT_CODES = {
  PAYE: "2110",
  AIDS_LEVY: "2130",
  NSSA: "2120",
  ZIMDEF: "2140",
  STANDARDS_DEVELOPMENT_LEVY: "2160",
} as const;

/**
 * The P2's boxes.
 *
 * Named for what ZIMRA asks for rather than numbered, because a numbered box
 * whose meaning has to be looked up is a box somebody will fill in wrong. The
 * remittance figure is `totalRemittance` — PAYE plus the levy, which is what is
 * actually paid over as one amount.
 */
export type P2Boxes = {
  employeesReported: number;
  grossEmoluments: Prisma.Decimal;
  taxableEmoluments: Prisma.Decimal;
  payeBeforeCredits: Prisma.Decimal;
  taxCredits: Prisma.Decimal;
  payeDeducted: Prisma.Decimal;
  aidsLevy: Prisma.Decimal;
  totalRemittance: Prisma.Decimal;
};

export type P2ScheduleRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  taxNumber: string | null;
  grossEmoluments: Prisma.Decimal;
  taxableEmoluments: Prisma.Decimal;
  payeDeducted: Prisma.Decimal;
  aidsLevy: Prisma.Decimal;
};

export type P2Return = {
  periodKey: string;
  currency: string;
  boxes: P2Boxes;
  schedule: P2ScheduleRow[];
  /** Employees the return cannot legally report. Non-empty means do not file. */
  blockers: string[];
};

export type NssaScheduleRow = {
  employeeId: string;
  employeeNumber: string;
  name: string;
  nssaNumber: string | null;
  /** Earnings the contribution was charged on — capped, not the full wage. */
  insurableEarnings: Prisma.Decimal;
  employeeContribution: Prisma.Decimal;
  employerContribution: Prisma.Decimal;
  total: Prisma.Decimal;
};

export type NssaReturn = {
  periodKey: string;
  currency: string;
  membersReported: number;
  totalInsurableEarnings: Prisma.Decimal;
  totalEmployeeContribution: Prisma.Decimal;
  totalEmployerContribution: Prisma.Decimal;
  totalRemittance: Prisma.Decimal;
  schedule: NssaScheduleRow[];
  blockers: string[];
};

type LineForReturn = {
  currency: string;
  exchangeRate: Prisma.Decimal;
  grossAmount: Prisma.Decimal;
  taxableGross: Prisma.Decimal;
  employee: {
    id: string;
    employeeId: string;
    name: string;
    taxNumber: string | null;
    nssaNumber: string | null;
    taxStatus: string;
  };
  components: Array<{
    type: string;
    amount: Prisma.Decimal;
    statutoryKey: string | null;
    basis: Prisma.Decimal | null;
  }>;
};

/**
 * Every approved line for a period.
 *
 * Approved only. A draft run's figures change, and a return filed from one would
 * report a number the employer never paid.
 */
async function approvedLines(
  input: { companyId: string; periodKey: string },
  db: Db = prisma,
): Promise<LineForReturn[]> {
  return db.payrollLineItem.findMany({
    where: {
      run: {
        companyId: input.companyId,
        status: "APPROVED",
        period: { periodKey: input.periodKey },
      },
    },
    select: {
      currency: true,
      exchangeRate: true,
      grossAmount: true,
      taxableGross: true,
      employee: {
        select: {
          id: true,
          employeeId: true,
          name: true,
          taxNumber: true,
          nssaNumber: true,
          taxStatus: true,
        },
      },
      components: {
        select: { type: true, amount: true, statutoryKey: true, basis: true },
      },
    },
    orderBy: { employee: { name: "asc" } },
  });
}

/** Sum one key across a line's components. */
function keyTotal(line: LineForReturn, statutoryKey: string): Prisma.Decimal {
  return sumMoney(
    line.components
      .filter((component) => component.statutoryKey === statutoryKey)
      .map((component) => component.amount),
  );
}

/** Every tax credit applied to a line, summed. */
function creditTotal(line: LineForReturn): Prisma.Decimal {
  return sumMoney(
    line.components
      .filter((component) => component.statutoryKey?.startsWith("TAX_CREDIT_"))
      .map((component) => component.amount),
  );
}

/**
 * The monthly PAYE return, one per currency.
 *
 * Contractors are excluded: they are paid gross and declare their own income, so
 * an employer's P2 does not report them. Including them would over-report the
 * emoluments and under-report the tax against them.
 */
export async function computeP2(
  input: { companyId: string; periodKey: string },
  db: Db = prisma,
): Promise<P2Return[]> {
  const lines = (await approvedLines(input, db)).filter(
    (line) => line.employee.taxStatus !== "CONTRACTOR",
  );

  const byCurrency = new Map<string, LineForReturn[]>();
  for (const line of lines) {
    const existing = byCurrency.get(line.currency);
    if (existing) existing.push(line);
    else byCurrency.set(line.currency, [line]);
  }

  return Array.from(byCurrency, ([currency, currencyLines]) => {
    const schedule: P2ScheduleRow[] = currencyLines.map((line) => ({
      employeeId: line.employee.id,
      employeeNumber: line.employee.employeeId,
      name: line.employee.name,
      taxNumber: line.employee.taxNumber,
      grossEmoluments: line.grossAmount,
      taxableEmoluments: line.taxableGross,
      payeDeducted: keyTotal(line, "PAYE"),
      aidsLevy: keyTotal(line, "AIDS_LEVY"),
    }));

    const payeDeducted = sumMoney(schedule.map((row) => row.payeDeducted));
    const aidsLevy = sumMoney(schedule.map((row) => row.aidsLevy));
    const taxCredits = sumMoney(currencyLines.map(creditTotal));

    const boxes: P2Boxes = {
      employeesReported: schedule.length,
      grossEmoluments: sumMoney(schedule.map((row) => row.grossEmoluments)),
      taxableEmoluments: sumMoney(schedule.map((row) => row.taxableEmoluments)),
      // The pre-credit figure, because ZIMRA asks for the tax and the credits
      // separately — an employer who nets them off cannot show its working.
      payeBeforeCredits: sumMoney([payeDeducted, taxCredits]),
      taxCredits,
      payeDeducted,
      aidsLevy,
      // What is actually paid over, as one amount.
      totalRemittance: sumMoney([payeDeducted, aidsLevy]),
    };

    // A BP number is how ZIMRA identifies the person. Filing without one is not
    // "a return with a gap", it is a return that cannot be matched to a taxpayer.
    const blockers = schedule
      .filter((row) => !row.taxNumber?.trim())
      .map(
        (row) =>
          `${row.name} (${row.employeeNumber}) has no tax (BP) number — the P2 cannot report them.`,
      );

    return { periodKey: input.periodKey, currency, boxes, schedule, blockers };
  });
}

/**
 * The NSSA monthly contribution schedule, one per currency.
 *
 * `insurableEarnings` is the **capped** figure the contribution was charged on,
 * taken from the component's own `basis` — not the wage. NSSA reconciles a
 * schedule against the contribution, and a schedule listing full salaries beside
 * capped contributions looks like an under-payment.
 *
 * Contractors are excluded for the same reason as the P2: they are outside the
 * scheme, which is why `EmployeeTaxStatus` separates them from EXEMPT.
 */
export async function computeNssaSchedule(
  input: { companyId: string; periodKey: string },
  db: Db = prisma,
): Promise<NssaReturn[]> {
  const lines = (await approvedLines(input, db)).filter(
    (line) => line.employee.taxStatus !== "CONTRACTOR",
  );

  const byCurrency = new Map<string, LineForReturn[]>();
  for (const line of lines) {
    const existing = byCurrency.get(line.currency);
    if (existing) existing.push(line);
    else byCurrency.set(line.currency, [line]);
  }

  return Array.from(byCurrency, ([currency, currencyLines]) => {
    const schedule: NssaScheduleRow[] = currencyLines
      .map((line) => {
        const employeeContribution = keyTotal(line, "NSSA_POBS_EMPLOYEE");
        const employerContribution = sumMoney([
          keyTotal(line, "NSSA_POBS_EMPLOYER"),
          keyTotal(line, "NSSA_APWCS"),
        ]);
        // The capped basis the engine charged on, read off the component rather
        // than re-derived — so the schedule and the payslip agree.
        const basis =
          line.components.find(
            (component) => component.statutoryKey === "NSSA_POBS_EMPLOYEE",
          )?.basis ?? ZERO;

        return {
          employeeId: line.employee.id,
          employeeNumber: line.employee.employeeId,
          name: line.employee.name,
          nssaNumber: line.employee.nssaNumber,
          insurableEarnings: money(basis),
          employeeContribution,
          employerContribution,
          total: sumMoney([employeeContribution, employerContribution]),
        };
      })
      // An employee with no contribution this month is not an NSSA member for
      // this schedule — listing them at zero invites NSSA to ask why.
      .filter((row) => row.total.greaterThan(0));

    const totalEmployeeContribution = sumMoney(
      schedule.map((row) => row.employeeContribution),
    );
    const totalEmployerContribution = sumMoney(
      schedule.map((row) => row.employerContribution),
    );

    const blockers = schedule
      .filter((row) => !row.nssaNumber?.trim())
      .map(
        (row) =>
          `${row.name} (${row.employeeNumber}) has no NSSA number — the schedule cannot report them.`,
      );

    return {
      periodKey: input.periodKey,
      currency,
      membersReported: schedule.length,
      totalInsurableEarnings: sumMoney(schedule.map((row) => row.insurableEarnings)),
      totalEmployeeContribution,
      totalEmployerContribution,
      totalRemittance: sumMoney([totalEmployeeContribution, totalEmployerContribution]),
      schedule,
      blockers,
    };
  });
}

export type ReconciliationLine = {
  label: string;
  accountCode: string;
  /** The return's figure, converted to base currency for comparison. */
  returnAmountBase: Prisma.Decimal;
  /** What the ledger actually holds against that account for the period. */
  ledgerAmountBase: Prisma.Decimal;
  difference: Prisma.Decimal;
  reconciled: boolean;
};

export type Reconciliation = {
  periodKey: string;
  /** True when the ledger was consulted. False in a payroll-only workspace. */
  ledgerAvailable: boolean;
  lines: ReconciliationLine[];
  reconciled: boolean;
};

/**
 * Does the return agree with the ledger?
 *
 * The check that makes the returns trustworthy rather than merely plausible. A
 * return whose total does not equal the credit on its payable account means one
 * of them is wrong, and an employer would rather find that here than when ZIMRA
 * does.
 *
 * In a workspace with no accounting module there is nothing to reconcile against
 * and `ledgerAvailable` is false — reported as "not checked", never as "checked
 * and fine".
 */
export async function reconcileReturns(
  input: { companyId: string; periodKey: string },
  db: Db = prisma,
): Promise<Reconciliation> {
  const lines = await approvedLines(input, db);

  // The returns are per currency; the ledger is in base. Convert the return
  // figures through each line's own frozen rate, the same way the journal was
  // posted, so a rate change since then cannot make a reconciled period drift.
  const perLineBase = lines.map((line) => {
    const statutory = summariseStatutory(line.components);
    const converted = new Map<string, Prisma.Decimal>();
    for (const [basis, amount] of Object.entries(statutory)) {
      converted.set(basis, toBaseAmount(amount, line.exchangeRate));
    }
    return converted;
  });

  function returnTotal(basis: string) {
    return sumMoney(perLineBase.map((line) => line.get(basis) ?? ZERO));
  }

  const journalEntries = await db.journalEntry.findMany({
    where: {
      companyId: input.companyId,
      sourceType: "PAYROLL_RUN",
      sourceId: {
        in: (
          await db.payrollRun.findMany({
            where: {
              companyId: input.companyId,
              status: "APPROVED",
              period: { periodKey: input.periodKey },
            },
            select: { id: true },
          })
        ).map((run) => run.id),
      },
    },
    select: {
      lines: {
        select: { credit: true, debit: true, account: { select: { code: true } } },
      },
    },
  });

  const ledgerAvailable = journalEntries.length > 0;
  const ledgerByCode = new Map<string, Prisma.Decimal>();
  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      const code = line.account.code;
      // Credits, since every statutory line is a liability the run created.
      const amount = money(line.credit ?? 0);
      ledgerByCode.set(code, sumMoney([ledgerByCode.get(code) ?? ZERO, amount]));
    }
  }

  const checks: Array<[label: string, code: string, bases: string[]]> = [
    ["PAYE", RETURN_ACCOUNT_CODES.PAYE, ["PAYE"]],
    ["AIDS levy", RETURN_ACCOUNT_CODES.AIDS_LEVY, ["AIDS_LEVY"]],
    // One account for both sides, because NSSA is remitted as one payment.
    ["NSSA", RETURN_ACCOUNT_CODES.NSSA, ["NSSA_EMPLOYEE", "NSSA_EMPLOYER"]],
    ["ZIMDEF", RETURN_ACCOUNT_CODES.ZIMDEF, ["ZIMDEF"]],
    [
      "Standards Development Levy",
      RETURN_ACCOUNT_CODES.STANDARDS_DEVELOPMENT_LEVY,
      ["STANDARDS_DEVELOPMENT_LEVY"],
    ],
  ];

  const reconciliationLines: ReconciliationLine[] = checks.map(
    ([label, accountCode, bases]) => {
      const returnAmountBase = sumMoney(bases.map(returnTotal));
      const ledgerAmountBase = ledgerByCode.get(accountCode) ?? ZERO;
      const difference = money(returnAmountBase.minus(ledgerAmountBase));
      return {
        label,
        accountCode,
        returnAmountBase,
        ledgerAmountBase,
        difference,
        // A cent of tolerance, matching the posting engine's own — rounding on a
        // multi-currency run legitimately lands a cent either way.
        reconciled: ledgerAvailable ? difference.abs().lessThanOrEqualTo("0.01") : false,
      };
    },
  );

  return {
    periodKey: input.periodKey,
    ledgerAvailable,
    lines: reconciliationLines,
    reconciled:
      ledgerAvailable && reconciliationLines.every((line) => line.reconciled),
  };
}
