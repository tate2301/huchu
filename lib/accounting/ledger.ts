import { prisma } from "@/lib/prisma";
import type { AccountingPeriod } from "@prisma/client";

export function toMoney(value: unknown) {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return parsed;
}

export async function getLatestEntryNumber(companyId: string) {
  const latest = await prisma.journalEntry.findFirst({
    where: { companyId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  return latest?.entryNumber ?? 0;
}

export async function getNextEntryNumber(companyId: string) {
  const latest = await getLatestEntryNumber(companyId);
  return latest + 1;
}

export async function findOpenPeriodForDate(companyId: string, date: Date): Promise<AccountingPeriod | null> {
  return prisma.accountingPeriod.findFirst({
    where: {
      companyId,
      status: "OPEN",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    orderBy: [{ startDate: "asc" }],
  });
}

export async function findPeriodForDate(companyId: string, date: Date): Promise<AccountingPeriod | null> {
  return prisma.accountingPeriod.findFirst({
    where: {
      companyId,
      startDate: { lte: date },
      endDate: { gte: date },
    },
    orderBy: [{ startDate: "asc" }],
  });
}

export async function ensurePeriodForDate(companyId: string, date: Date): Promise<AccountingPeriod> {
  const existing = await findPeriodForDate(companyId, date);
  if (existing) return existing;

  const periodStart = new Date(date.getFullYear(), date.getMonth(), 1);
  const periodEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return prisma.accountingPeriod.create({
    data: {
      companyId,
      startDate: periodStart,
      endDate: periodEnd,
      status: "OPEN",
    },
  });
}

export async function getTrialBalance(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const baseEntryWhere: Record<string, unknown> = {
    companyId: input.companyId,
    status: "POSTED",
  };

  let openingBeforeDate: Date | null = null;
  let periodEntryWhere: Record<string, unknown> = { ...baseEntryWhere };

  if (input.periodId) {
    periodEntryWhere = {
      ...baseEntryWhere,
      periodId: input.periodId,
    };
    const period = await prisma.accountingPeriod.findFirst({
      where: { id: input.periodId, companyId: input.companyId },
      select: { startDate: true },
    });
    openingBeforeDate = period?.startDate ?? null;
  } else if (input.startDate || input.endDate) {
    periodEntryWhere = {
      ...baseEntryWhere,
      entryDate: {
        ...(input.startDate ? { gte: input.startDate } : null),
        ...(input.endDate ? { lte: input.endDate } : null),
      },
    };
    openingBeforeDate = input.startDate ?? null;
  }

  const [periodGrouped, openingGrouped] = await Promise.all([
    prisma.journalLine.groupBy({
      by: ["accountId"],
      where: {
        entry: periodEntryWhere,
      },
      _sum: {
        debit: true,
        credit: true,
      },
    }),
    openingBeforeDate
      ? prisma.journalLine.groupBy({
          by: ["accountId"],
          where: {
            entry: {
              ...baseEntryWhere,
              entryDate: {
                lt: openingBeforeDate,
              },
            },
          },
          _sum: {
            debit: true,
            credit: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const openingByAccount = new Map(
    openingGrouped.map((row) => [
      row.accountId,
      {
        debit: toMoney(row._sum.debit),
        credit: toMoney(row._sum.credit),
      },
    ]),
  );
  const periodByAccount = new Map(
    periodGrouped.map((row) => [
      row.accountId,
      {
        debit: toMoney(row._sum.debit),
        credit: toMoney(row._sum.credit),
      },
    ]),
  );

  const accountIds = Array.from(new Set([...openingByAccount.keys(), ...periodByAccount.keys()]));
  const accounts = await prisma.chartOfAccount.findMany({
    where: { id: { in: accountIds } },
  });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  const rows = accountIds.map((accountId) => {
    const account = accountMap.get(accountId);
    const opening = openingByAccount.get(accountId) ?? { debit: 0, credit: 0 };
    const period = periodByAccount.get(accountId) ?? { debit: 0, credit: 0 };

    const openingBalance = opening.debit - opening.credit;
    const openingDebit = openingBalance >= 0 ? openingBalance : 0;
    const openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;

    const closingBalance = openingBalance + period.debit - period.credit;
    const closingDebit = closingBalance >= 0 ? closingBalance : 0;
    const closingCredit = closingBalance < 0 ? Math.abs(closingBalance) : 0;

    return {
      accountId,
      code: account?.code ?? "",
      name: account?.name ?? "Unknown",
      type: account?.type ?? "ASSET",
      category: account?.category ?? null,
      openingDebit,
      openingCredit,
      debit: period.debit,
      credit: period.credit,
      balance: period.debit - period.credit,
      closingDebit,
      closingCredit,
      total: closingDebit + closingCredit,
    };
  });

  const totals = rows.reduce(
    (acc, row) => ({
      openingDebit: acc.openingDebit + row.openingDebit,
      openingCredit: acc.openingCredit + row.openingCredit,
      debit: acc.debit + row.debit,
      credit: acc.credit + row.credit,
      closingDebit: acc.closingDebit + row.closingDebit,
      closingCredit: acc.closingCredit + row.closingCredit,
      total: acc.total + row.total,
    }),
    {
      openingDebit: 0,
      openingCredit: 0,
      debit: 0,
      credit: 0,
      closingDebit: 0,
      closingCredit: 0,
      total: 0,
    },
  );

  return { rows, totals };
}

export async function getFinancialStatements(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const trialBalance = await getTrialBalance(input);

  const incomeRows = trialBalance.rows.filter((row) => row.type === "INCOME");
  const expenseRows = trialBalance.rows.filter((row) => row.type === "EXPENSE");
  const assetRows = trialBalance.rows.filter((row) => row.type === "ASSET");
  const liabilityRows = trialBalance.rows.filter((row) => row.type === "LIABILITY");
  const equityRows = trialBalance.rows.filter((row) => row.type === "EQUITY");

  const incomeTotal = incomeRows.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const expenseTotal = expenseRows.reduce((sum, row) => sum + (row.debit - row.credit), 0);
  const netIncome = incomeTotal - expenseTotal;

  const assetTotal = assetRows.reduce((sum, row) => sum + row.balance, 0);
  const liabilityTotal = liabilityRows.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const equityTotal = equityRows.reduce((sum, row) => sum + (row.credit - row.debit), 0) + netIncome;

  return {
    trialBalance,
    profitAndLoss: {
      income: incomeRows,
      expenses: expenseRows,
      totals: {
        income: incomeTotal,
        expenses: expenseTotal,
        netIncome,
      },
    },
    balanceSheet: {
      assets: assetRows,
      liabilities: liabilityRows,
      equity: equityRows,
      totals: {
        assets: assetTotal,
        liabilities: liabilityTotal,
        equity: equityTotal,
      },
    },
  };
}

export async function getCashFlowReport(input: {
  companyId: string;
  periodId?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
}) {
  const trialBalance = await getTrialBalance(input);
  const cashKeywords = ["cash", "bank"];

  const isCashAccount = (name: string, category?: string | null) => {
    const haystack = `${name} ${category ?? ""}`.toLowerCase();
    return cashKeywords.some((keyword) => haystack.includes(keyword));
  };

  const operating = trialBalance.rows.filter((row) => ["INCOME", "EXPENSE"].includes(row.type));
  const investing = trialBalance.rows.filter(
    (row) => row.type === "ASSET" && !isCashAccount(row.name, row.category),
  );
  const financing = trialBalance.rows.filter((row) => ["LIABILITY", "EQUITY"].includes(row.type));

  const operatingTotal = operating.reduce((sum, row) => sum + (row.credit - row.debit), 0);
  const investingTotal = investing.reduce((sum, row) => sum + row.balance, 0);
  const financingTotal = financing.reduce((sum, row) => sum + (row.credit - row.debit), 0);

  return {
    operating,
    investing,
    financing,
    totals: {
      operating: operatingTotal,
      investing: investingTotal,
      financing: financingTotal,
      netCash: operatingTotal + investingTotal + financingTotal,
    },
  };
}
