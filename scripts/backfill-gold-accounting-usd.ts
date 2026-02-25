import "dotenv/config";

import { AccountingSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Summary = {
  companyId: string;
  inspectedEntries: number;
  updatedEntries: number;
  skippedNoSource: number;
  skippedNoValue: number;
  skippedNoLines: number;
};

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function allocateSide(
  lines: Array<{ id: string; amount: number }>,
  targetAmount: number,
): Array<{ id: string; amount: number }> {
  if (lines.length === 0) return [];
  const roundedTarget = roundMoney(targetAmount);
  const sourceTotal = lines.reduce((sum, line) => sum + line.amount, 0);

  if (sourceTotal <= 0) {
    const [first, ...rest] = lines;
    return [
      { id: first.id, amount: roundedTarget },
      ...rest.map((line) => ({ id: line.id, amount: 0 })),
    ];
  }

  const allocated = lines.map((line) => ({
    id: line.id,
    amount: roundMoney((line.amount / sourceTotal) * roundedTarget),
  }));

  const allocatedTotal = allocated.reduce((sum, line) => sum + line.amount, 0);
  const diff = roundMoney(roundedTarget - allocatedTotal);
  if (diff !== 0) {
    let pivotIndex = 0;
    for (let i = 1; i < allocated.length; i += 1) {
      if (allocated[i].amount > allocated[pivotIndex].amount) pivotIndex = i;
    }
    allocated[pivotIndex] = {
      ...allocated[pivotIndex],
      amount: roundMoney(allocated[pivotIndex].amount + diff),
    };
  }

  return allocated;
}

async function backfillCompany(companyId: string, dryRun: boolean): Promise<Summary> {
  const sourceTypes: AccountingSourceType[] = [
    "GOLD_PURCHASE",
    "GOLD_RECEIPT",
    "GOLD_DISPATCH",
  ];

  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId,
      status: "POSTED",
      sourceType: { in: sourceTypes },
      sourceId: { not: null },
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      lines: {
        select: {
          id: true,
          debit: true,
          credit: true,
        },
      },
    },
  });

  const purchaseIds = entries
    .filter((entry) => entry.sourceType === "GOLD_PURCHASE" && typeof entry.sourceId === "string")
    .map((entry) => entry.sourceId as string);
  const receiptIds = entries
    .filter((entry) => entry.sourceType === "GOLD_RECEIPT" && typeof entry.sourceId === "string")
    .map((entry) => entry.sourceId as string);
  const dispatchIds = entries
    .filter((entry) => entry.sourceType === "GOLD_DISPATCH" && typeof entry.sourceId === "string")
    .map((entry) => entry.sourceId as string);

  const [purchases, receipts, dispatches] = await Promise.all([
    purchaseIds.length === 0
      ? Promise.resolve([])
      : prisma.goldPurchase.findMany({
          where: { id: { in: purchaseIds } },
          select: {
            id: true,
            paidAmount: true,
          },
        }),
    receiptIds.length === 0
      ? Promise.resolve([])
      : prisma.buyerReceipt.findMany({
          where: { id: { in: receiptIds } },
          select: {
            id: true,
            paidValueUsd: true,
            paidAmount: true,
            goldPriceUsdPerGram: true,
          },
        }),
    dispatchIds.length === 0
      ? Promise.resolve([])
      : prisma.goldDispatch.findMany({
          where: { id: { in: dispatchIds } },
          select: {
            id: true,
            valueUsd: true,
            goldPriceUsdPerGram: true,
            goldPour: {
              select: {
                valueUsd: true,
                grossWeight: true,
                goldPriceUsdPerGram: true,
              },
            },
          },
        }),
  ]);

  const purchaseById = new Map(purchases.map((row) => [row.id, row]));
  const receiptById = new Map(receipts.map((row) => [row.id, row]));
  const dispatchById = new Map(dispatches.map((row) => [row.id, row]));

  const summary: Summary = {
    companyId,
    inspectedEntries: entries.length,
    updatedEntries: 0,
    skippedNoSource: 0,
    skippedNoValue: 0,
    skippedNoLines: 0,
  };

  for (const entry of entries) {
    const sourceId = entry.sourceId;
    if (!sourceId) {
      summary.skippedNoSource += 1;
      continue;
    }

    let targetAmountUsd: number | null = null;

    if (entry.sourceType === "GOLD_PURCHASE") {
      const purchase = purchaseById.get(sourceId);
      if (purchase) targetAmountUsd = purchase.paidAmount;
    } else if (entry.sourceType === "GOLD_RECEIPT") {
      const receipt = receiptById.get(sourceId);
      if (receipt) {
        targetAmountUsd =
          receipt.paidValueUsd ??
          (isFinitePositive(receipt.goldPriceUsdPerGram)
            ? roundMoney(receipt.paidAmount * receipt.goldPriceUsdPerGram)
            : null);
      }
    } else if (entry.sourceType === "GOLD_DISPATCH") {
      const dispatch = dispatchById.get(sourceId);
      if (dispatch) {
        targetAmountUsd =
          dispatch.valueUsd ??
          dispatch.goldPour.valueUsd ??
          (isFinitePositive(dispatch.goldPriceUsdPerGram)
            ? roundMoney(dispatch.goldPour.grossWeight * dispatch.goldPriceUsdPerGram)
            : isFinitePositive(dispatch.goldPour.goldPriceUsdPerGram)
              ? roundMoney(dispatch.goldPour.grossWeight * dispatch.goldPour.goldPriceUsdPerGram)
              : null);
      }
    }

    if (!isFinitePositive(targetAmountUsd)) {
      summary.skippedNoValue += 1;
      continue;
    }

    const debitLines = entry.lines
      .filter((line) => line.debit > 0)
      .map((line) => ({ id: line.id, amount: line.debit }));
    const creditLines = entry.lines
      .filter((line) => line.credit > 0)
      .map((line) => ({ id: line.id, amount: line.credit }));

    if (debitLines.length === 0 || creditLines.length === 0) {
      summary.skippedNoLines += 1;
      continue;
    }

    const debitTotal = roundMoney(debitLines.reduce((sum, line) => sum + line.amount, 0));
    const creditTotal = roundMoney(creditLines.reduce((sum, line) => sum + line.amount, 0));
    const roundedTarget = roundMoney(targetAmountUsd);

    if (debitTotal === roundedTarget && creditTotal === roundedTarget) {
      continue;
    }

    const debitAllocations = allocateSide(debitLines, roundedTarget);
    const creditAllocations = allocateSide(creditLines, roundedTarget);

    if (!dryRun) {
      await prisma.$transaction([
        ...debitAllocations.map((line) =>
          prisma.journalLine.update({
            where: { id: line.id },
            data: { debit: line.amount },
          }),
        ),
        ...creditAllocations.map((line) =>
          prisma.journalLine.update({
            where: { id: line.id },
            data: { credit: line.amount },
          }),
        ),
        prisma.accountingIntegrationEvent.updateMany({
          where: {
            companyId,
            sourceType: entry.sourceType,
            sourceId,
          },
          data: {
            amount: roundedTarget,
            netAmount: roundedTarget,
            grossAmount: roundedTarget,
          },
        }),
      ]);
    }

    summary.updatedEntries += 1;
  }

  return summary;
}

async function main() {
  const companyId = parseArg("--company-id");
  const dryRun = process.argv.includes("--dry-run");

  const companyIds = companyId
    ? [companyId]
    : (
        await prisma.company.findMany({
          select: { id: true },
        })
      ).map((company) => company.id);

  for (const id of companyIds) {
    const summary = await backfillCompany(id, dryRun);
    console.log(`[${id}]`, summary);
  }
}

main()
  .catch((error) => {
    console.error("[backfill-gold-accounting-usd] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
