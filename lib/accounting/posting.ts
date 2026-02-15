import type { AccountingSourceType, PostingBasis, PostingRuleLine } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasFeature } from "@/lib/platform/features";
import { ensurePeriodForDate, getNextEntryNumber, toMoney } from "@/lib/accounting/ledger";

const BALANCE_TOLERANCE = 0.01;

type PostingContext = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId?: string | null;
  entryDate: Date;
  description: string;
  createdById: string;
  amount: number;
  netAmount?: number;
  taxAmount?: number;
  grossAmount?: number;
  deductionsAmount?: number;
  allowancesAmount?: number;
  currency?: string;
};

function resolveBasisAmount(basis: PostingBasis, context: PostingContext): number {
  switch (basis) {
    case "NET":
      return toMoney(context.netAmount ?? context.amount);
    case "TAX":
      return toMoney(context.taxAmount ?? 0);
    case "GROSS":
      return toMoney(context.grossAmount ?? context.amount);
    case "DEDUCTIONS":
      return toMoney(context.deductionsAmount ?? 0);
    case "ALLOWANCES":
      return toMoney(context.allowancesAmount ?? 0);
    case "AMOUNT":
    default:
      return toMoney(context.amount);
  }
}

function resolveLineAmount(line: PostingRuleLine, context: PostingContext): number {
  const base = resolveBasisAmount(line.basis, context);
  if (line.allocationType === "FIXED") {
    return toMoney(line.allocationValue);
  }
  return (base * toMoney(line.allocationValue)) / 100;
}

function totalsBalanced(totalDebit: number, totalCredit: number) {
  return Math.abs(totalDebit - totalCredit) <= BALANCE_TOLERANCE;
}

export async function createJournalEntryFromSource(context: PostingContext): Promise<{ entryId?: string; skipped?: boolean; error?: string }> {
  const accountingEnabled = await hasFeature(context.companyId, "accounting.core");
  const postingEnabled = await hasFeature(context.companyId, "accounting.posting-rules");
  if (!accountingEnabled || !postingEnabled) {
    return { skipped: true };
  }

  if (context.sourceId) {
    const existing = await prisma.journalEntry.findFirst({
      where: {
        companyId: context.companyId,
        sourceType: context.sourceType,
        sourceId: context.sourceId,
      },
      select: { id: true },
    });
    if (existing) return { entryId: existing.id, skipped: true };
  }

  const rule = await prisma.postingRule.findFirst({
    where: {
      companyId: context.companyId,
      sourceType: context.sourceType,
      isActive: true,
    },
    include: { lines: true },
  });

  if (!rule || rule.lines.length === 0) {
    return { skipped: true };
  }

  const lines = rule.lines.map((line) => {
    const amount = resolveLineAmount(line, context);
    return {
      accountId: line.accountId,
      debit: line.direction === "DEBIT" ? amount : 0,
      credit: line.direction === "CREDIT" ? amount : 0,
      memo: context.description,
    };
  });

  const totals = lines.reduce(
    (acc, line) => ({
      debit: acc.debit + toMoney(line.debit),
      credit: acc.credit + toMoney(line.credit),
    }),
    { debit: 0, credit: 0 },
  );

  if (!totalsBalanced(totals.debit, totals.credit)) {
    return {
      error: `Unbalanced entry (debit ${totals.debit.toFixed(2)} vs credit ${totals.credit.toFixed(2)})`,
    };
  }

  const period = await ensurePeriodForDate(context.companyId, context.entryDate);
  const entryNumber = await getNextEntryNumber(context.companyId);

  const entry = await prisma.journalEntry.create({
    data: {
      companyId: context.companyId,
      entryNumber,
      entryDate: context.entryDate,
      description: context.description,
      status: "POSTED",
      periodId: period.id,
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? undefined,
      createdById: context.createdById,
      postedById: context.createdById,
      postedAt: new Date(),
      lines: {
        create: lines,
      },
    },
    select: { id: true },
  });

  return { entryId: entry.id };
}
