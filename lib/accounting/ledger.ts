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

export async function getGeneralLedger(input: {
  companyId: string;
  startDate?: Date | null;
  endDate?: Date | null;
  accountId?: string | null;
  periodId?: string | null;
  skip?: number;
  take?: number;
}) {
  const entryWhere: Record<string, unknown> = {
    companyId: input.companyId,
    status: "POSTED",
    ...(input.periodId ? { periodId: input.periodId } : {}),
    ...(input.startDate || input.endDate
      ? {
          entryDate: {
            ...(input.startDate ? { gte: input.startDate } : null),
            ...(input.endDate ? { lte: input.endDate } : null),
          },
        }
      : {}),
  };

  const where: Record<string, unknown> = {
    ...(input.accountId ? { accountId: input.accountId } : {}),
    entry: entryWhere,
  };

  const [rows, total] = await Promise.all([
    prisma.journalLine.findMany({
      where,
      include: {
        entry: {
          select: {
            id: true,
            entryNumber: true,
            entryDate: true,
            description: true,
            sourceType: true,
            sourceId: true,
          },
        },
        account: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
      orderBy: [{ entry: { entryDate: "desc" } }, { createdAt: "desc" }],
      skip: input.skip ?? 0,
      take: input.take ?? 100,
    }),
    prisma.journalLine.count({ where }),
  ]);

  return { rows, total };
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

  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId: input.companyId, isActive: true },
    orderBy: [{ code: "asc" }],
  });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  const sourceMetrics = new Map(
    accounts.map((account) => {
      const opening = openingByAccount.get(account.id) ?? { debit: 0, credit: 0 };
      const period = periodByAccount.get(account.id) ?? { debit: 0, credit: 0 };
      return [
        account.id,
        {
          openingDebit: toMoney(opening.debit),
          openingCredit: toMoney(opening.credit),
          debit: toMoney(period.debit),
          credit: toMoney(period.credit),
        },
      ];
    }),
  );

  const aggregatedMetrics = new Map(
    Array.from(sourceMetrics.entries()).map(([accountId, metrics]) => [accountId, { ...metrics }]),
  );

  for (const account of accounts) {
    const own = sourceMetrics.get(account.id);
    if (!own) continue;
    if (
      own.openingDebit === 0 &&
      own.openingCredit === 0 &&
      own.debit === 0 &&
      own.credit === 0
    ) {
      continue;
    }

    let parentId = account.parentAccountId;
    while (parentId) {
      const parentAgg = aggregatedMetrics.get(parentId);
      if (!parentAgg) break;
      parentAgg.openingDebit = toMoney(parentAgg.openingDebit + own.openingDebit);
      parentAgg.openingCredit = toMoney(parentAgg.openingCredit + own.openingCredit);
      parentAgg.debit = toMoney(parentAgg.debit + own.debit);
      parentAgg.credit = toMoney(parentAgg.credit + own.credit);
      parentId = accountMap.get(parentId)?.parentAccountId ?? null;
    }
  }

  const rows = accounts.map((account) => {
    const metrics = aggregatedMetrics.get(account.id) ?? {
      openingDebit: 0,
      openingCredit: 0,
      debit: 0,
      credit: 0,
    };

    const openingBalance = metrics.openingDebit - metrics.openingCredit;
    const openingDebit = openingBalance >= 0 ? openingBalance : 0;
    const openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0;

    const closingBalance = openingBalance + metrics.debit - metrics.credit;
    const closingDebit = closingBalance >= 0 ? closingBalance : 0;
    const closingCredit = closingBalance < 0 ? Math.abs(closingBalance) : 0;

    return {
      accountId: account.id,
      code: account.code,
      name: account.name,
      type: account.type,
      nodeType: account.nodeType,
      parentAccountId: account.parentAccountId,
      level: account.level,
      category: account.category ?? null,
      openingDebit,
      openingCredit,
      debit: metrics.debit,
      credit: metrics.credit,
      balance: metrics.debit - metrics.credit,
      closingDebit,
      closingCredit,
      total: closingDebit + closingCredit,
    };
  });

  const totals = rows
    .filter((row) => row.nodeType !== "GROUP")
    .reduce(
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
