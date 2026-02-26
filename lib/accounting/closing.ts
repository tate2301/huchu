import { prisma } from "@/lib/prisma";
import { getNextEntryNumber, toMoney } from "@/lib/accounting/ledger";

type OpeningLineInput = {
  accountId: string;
  debit?: number;
  credit?: number;
  memo?: string | null;
  costCenterId?: string | null;
};

function totalsBalanced(lines: OpeningLineInput[]) {
  const totals = lines.reduce(
    (acc, line) => ({
      debit: toMoney(acc.debit + toMoney(line.debit)),
      credit: toMoney(acc.credit + toMoney(line.credit)),
    }),
    { debit: 0, credit: 0 },
  );
  return Math.abs(totals.debit - totals.credit) <= 0.01;
}

function linesStructurallyValid(lines: OpeningLineInput[]) {
  return lines.every((line) => {
    const debit = toMoney(line.debit);
    const credit = toMoney(line.credit);
    if (debit < 0 || credit < 0) return false;
    if (debit === 0 && credit === 0) return false;
    if (debit > 0 && credit > 0) return false;
    return true;
  });
}

export async function importOpeningBalances(input: {
  companyId: string;
  effectiveDate: Date;
  createdById: string;
  sourceReference?: string | null;
  notes?: string | null;
  lines: OpeningLineInput[];
}) {
  if (input.lines.length < 2) {
    throw new Error("At least two opening balance lines are required.");
  }
  if (!linesStructurallyValid(input.lines)) {
    throw new Error("Each opening balance line must contain either debit or credit, not both.");
  }
  if (!totalsBalanced(input.lines)) {
    throw new Error("Opening balances must be balanced.");
  }

  const accountIds = Array.from(new Set(input.lines.map((line) => line.accountId)));
  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      companyId: input.companyId,
      id: { in: accountIds },
    },
    select: {
      id: true,
      isActive: true,
      nodeType: true,
    },
  });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const invalidAccountIds = accountIds.filter((id) => !accountMap.has(id));
  if (invalidAccountIds.length > 0) {
    throw new Error("One or more opening balance accounts are invalid for this company.");
  }
  const blockedAccountIds = accountIds.filter((id) => {
    const account = accountMap.get(id);
    if (!account) return true;
    if (!account.isActive) return true;
    return account.nodeType !== "LEDGER";
  });
  if (blockedAccountIds.length > 0) {
    throw new Error("Opening balances can only post to active LEDGER accounts.");
  }

  const costCenterIds = Array.from(
    new Set(
      input.lines
        .map((line) => line.costCenterId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  if (costCenterIds.length > 0) {
    const ownedCostCenters = await prisma.costCenter.findMany({
      where: {
        companyId: input.companyId,
        id: { in: costCenterIds },
      },
      select: { id: true },
    });
    const ownedSet = new Set(ownedCostCenters.map((center) => center.id));
    const invalidCostCenterIds = costCenterIds.filter((id) => !ownedSet.has(id));
    if (invalidCostCenterIds.length > 0) {
      throw new Error("One or more opening balance cost centers are invalid for this company.");
    }
  }

  const [period, entryNumber] = await Promise.all([
    prisma.accountingPeriod.findFirst({
      where: {
        companyId: input.companyId,
        startDate: { lte: input.effectiveDate },
        endDate: { gte: input.effectiveDate },
      },
      orderBy: { startDate: "asc" },
    }),
    getNextEntryNumber(input.companyId),
  ]);

  const targetPeriod =
    period ??
    (await prisma.accountingPeriod.create({
      data: {
        companyId: input.companyId,
        startDate: new Date(input.effectiveDate.getFullYear(), input.effectiveDate.getMonth(), 1),
        endDate: new Date(input.effectiveDate.getFullYear(), input.effectiveDate.getMonth() + 1, 0),
        status: "OPEN",
      },
    }));

  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryNumber,
        entryDate: input.effectiveDate,
        description: "Opening balances import",
        status: "POSTED",
        periodId: targetPeriod.id,
        sourceType: "MANUAL",
        sourceId: `opening:${entryNumber}`,
        createdById: input.createdById,
        postedById: input.createdById,
        postedAt: new Date(),
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: toMoney(line.debit),
            credit: toMoney(line.credit),
            memo: line.memo ?? "Opening balance",
            costCenterId: line.costCenterId ?? undefined,
          })),
        },
      },
      include: { lines: true },
    });

    const totals = input.lines.reduce(
      (acc, line) => ({
        debit: toMoney(acc.debit + toMoney(line.debit)),
        credit: toMoney(acc.credit + toMoney(line.credit)),
      }),
      { debit: 0, credit: 0 },
    );

    const openingImport = await tx.openingBalanceImport.create({
      data: {
        companyId: input.companyId,
        effectiveDate: input.effectiveDate,
        sourceReference: input.sourceReference ?? undefined,
        notes: input.notes ?? undefined,
        totalDebit: totals.debit,
        totalCredit: totals.credit,
        journalEntryId: entry.id,
        createdById: input.createdById,
      },
    });

    return { entry, openingImport };
  });
}

export async function setFreezeBeforeDate(input: {
  companyId: string;
  freezeBeforeDate?: Date | null;
}) {
  return prisma.accountingSettings.upsert({
    where: { companyId: input.companyId },
    update: { freezeBeforeDate: input.freezeBeforeDate ?? null },
    create: { companyId: input.companyId, freezeBeforeDate: input.freezeBeforeDate ?? null },
  });
}

export async function closePeriodWithVoucher(input: {
  companyId: string;
  periodId: string;
  createdById: string;
  closingDate?: Date;
  retainedEarningsAccountId: string;
  notes?: string | null;
}) {
  const period = await prisma.accountingPeriod.findUnique({
    where: { id: input.periodId },
  });
  if (!period || period.companyId !== input.companyId) {
    throw new Error("Accounting period not found.");
  }

  const existing = await prisma.periodCloseVoucher.findFirst({
    where: { companyId: input.companyId, periodId: input.periodId },
    select: { id: true },
  });
  if (existing) {
    throw new Error("Period close voucher already exists for this period.");
  }

  const retainedEarningsAccount = await prisma.chartOfAccount.findFirst({
    where: {
      id: input.retainedEarningsAccountId,
      companyId: input.companyId,
    },
    select: {
      id: true,
      type: true,
      isActive: true,
    },
  });
  if (!retainedEarningsAccount || !retainedEarningsAccount.isActive) {
    throw new Error("Retained earnings account is invalid or inactive for this company.");
  }
  if (retainedEarningsAccount.type !== "EQUITY") {
    throw new Error("Retained earnings account must be an equity account.");
  }

  const grouped = await prisma.journalLine.groupBy({
    by: ["accountId"],
    where: {
      entry: {
        companyId: input.companyId,
        periodId: input.periodId,
        status: "POSTED",
      },
      account: {
        type: { in: ["INCOME", "EXPENSE"] },
      },
    },
    _sum: {
      debit: true,
      credit: true,
    },
  });
  if (grouped.length === 0) {
    throw new Error("No posted income or expense entries found for this period.");
  }

  const accounts = await prisma.chartOfAccount.findMany({
    where: {
      id: { in: grouped.map((row) => row.accountId) },
    },
    select: { id: true, type: true, name: true },
  });
  const accountMap = new Map(accounts.map((account) => [account.id, account]));

  const voucherLines: Array<{
    accountId: string;
    debit: number;
    credit: number;
    memo: string;
  }> = [];

  let incomeTotal = 0;
  let expenseTotal = 0;
  grouped.forEach((row) => {
    const account = accountMap.get(row.accountId);
    if (!account) return;
    const debit = toMoney(row._sum.debit);
    const credit = toMoney(row._sum.credit);

    if (account.type === "INCOME") {
      const balance = toMoney(credit - debit);
      if (balance > 0) {
        incomeTotal = toMoney(incomeTotal + balance);
        voucherLines.push({
          accountId: row.accountId,
          debit: balance,
          credit: 0,
          memo: `Period close: ${account.name}`,
        });
      }
      return;
    }

    if (account.type === "EXPENSE") {
      const balance = toMoney(debit - credit);
      if (balance > 0) {
        expenseTotal = toMoney(expenseTotal + balance);
        voucherLines.push({
          accountId: row.accountId,
          debit: 0,
          credit: balance,
          memo: `Period close: ${account.name}`,
        });
      }
    }
  });

  const netResult = toMoney(incomeTotal - expenseTotal);
  if (netResult > 0) {
    voucherLines.push({
      accountId: input.retainedEarningsAccountId,
      debit: 0,
      credit: netResult,
      memo: "Period close transfer (profit)",
    });
  } else if (netResult < 0) {
    voucherLines.push({
      accountId: input.retainedEarningsAccountId,
      debit: Math.abs(netResult),
      credit: 0,
      memo: "Period close transfer (loss)",
    });
  }

  if (!totalsBalanced(voucherLines)) {
    throw new Error("Generated period close voucher is unbalanced.");
  }

  const closingDate = input.closingDate ?? period.endDate;
  const entryNumber = await getNextEntryNumber(input.companyId);

  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryNumber,
        entryDate: closingDate,
        description: input.notes?.trim() || `Period close voucher for ${period.startDate.toISOString().slice(0, 10)}`,
        status: "POSTED",
        periodId: input.periodId,
        sourceType: "MANUAL",
        sourceId: `period-close:${period.id}`,
        createdById: input.createdById,
        postedById: input.createdById,
        postedAt: new Date(),
        lines: {
          create: voucherLines,
        },
      },
      include: { lines: true },
    });

    const voucher = await tx.periodCloseVoucher.create({
      data: {
        companyId: input.companyId,
        periodId: input.periodId,
        closingDate,
        retainedEarningsAccountId: input.retainedEarningsAccountId,
        netResult,
        journalEntryId: entry.id,
        createdById: input.createdById,
      },
    });

    await tx.accountingPeriod.update({
      where: { id: input.periodId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closedById: input.createdById,
      },
    });

    return { voucher, entry };
  });
}
