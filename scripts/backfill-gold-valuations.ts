import "dotenv/config";

import { prisma } from "@/lib/prisma";

type PriceRow = {
  effectiveDate: Date;
  priceUsdPerGram: number;
};

type BackfillSummary = {
  companyId: string;
  employeePaymentsUpdated: number;
  goldPoursUpdated: number;
  goldDispatchesUpdated: number;
  buyerReceiptsUpdated: number;
  goldShiftAllocationsUpdated: number;
  goldShiftWorkerSharesUpdated: number;
  skippedNoPrice: number;
};

function parseArg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function startOfDayUtc(input: Date | string): Date {
  const date = new Date(input);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function toNum(value: number | { toNumber(): number } | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : value.toNumber();
}

function isValidRate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function resolveSnapshot(prices: PriceRow[], businessDate: Date): PriceRow | null {
  if (prices.length === 0) return null;
  const target = startOfDayUtc(businessDate).getTime();
  let effective: PriceRow | null = null;
  for (const price of prices) {
    if (price.effectiveDate.getTime() <= target) {
      effective = price;
      continue;
    }
    break;
  }
  return effective ?? prices[prices.length - 1];
}

async function backfillCompany(companyId: string, dryRun: boolean): Promise<BackfillSummary> {
  const rawPrices = await prisma.goldPrice.findMany({
    where: { companyId },
    orderBy: [{ effectiveDate: "asc" }, { createdAt: "asc" }],
    select: { effectiveDate: true, priceUsdPerGram: true },
  });
  const prices: PriceRow[] = rawPrices.map((p) => ({
    effectiveDate: p.effectiveDate,
    priceUsdPerGram: Number(p.priceUsdPerGram),
  }));

  const summary: BackfillSummary = {
    companyId,
    employeePaymentsUpdated: 0,
    goldPoursUpdated: 0,
    goldDispatchesUpdated: 0,
    buyerReceiptsUpdated: 0,
    goldShiftAllocationsUpdated: 0,
    goldShiftWorkerSharesUpdated: 0,
    skippedNoPrice: 0,
  };

  const employeePayments = await prisma.employeePayment.findMany({
    where: {
      type: "GOLD",
      employee: { companyId },
      OR: [
        { goldWeightGrams: null },
        { goldPriceUsdPerGram: null },
        { valuationDate: null },
        { amountUsd: null },
        { paidAmountUsd: null },
      ],
    },
    select: {
      id: true,
      periodEnd: true,
      amount: true,
      paidAmount: true,
      goldWeightGrams: true,
      goldPriceUsdPerGram: true,
      valuationDate: true,
    },
  });

  for (const payment of employeePayments) {
    const grams = payment.goldWeightGrams ?? payment.amount;
    const fallbackSnapshot = resolveSnapshot(prices, payment.periodEnd);
    const rawRate = payment.goldPriceUsdPerGram != null ? Number(payment.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;
    const valuationDate =
      payment.valuationDate ??
      fallbackSnapshot?.effectiveDate ??
      startOfDayUtc(payment.periodEnd);

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    const amountUsd = roundUsd(grams * goldPriceUsdPerGram);
    const paidAmountUsd = roundUsd((payment.paidAmount ?? 0) * goldPriceUsdPerGram);

    if (!dryRun) {
      await prisma.employeePayment.update({
        where: { id: payment.id },
        data: {
          goldWeightGrams: grams,
          goldPriceUsdPerGram,
          valuationDate,
          amountUsd,
          paidAmountUsd,
        },
      });
    }
    summary.employeePaymentsUpdated += 1;
  }

  const pours = await prisma.goldPour.findMany({
    where: {
      site: { companyId },
      OR: [
        { goldPriceUsdPerGram: null },
        { valuationDate: null },
        { valueUsd: null },
      ],
    },
    select: {
      id: true,
      pourDate: true,
      grossWeight: true,
      goldPriceUsdPerGram: true,
      valuationDate: true,
    },
  });

  for (const pour of pours) {
    const fallbackSnapshot = resolveSnapshot(prices, pour.pourDate);
    const rawRate = pour.goldPriceUsdPerGram != null ? Number(pour.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;
    const valuationDate =
      pour.valuationDate ??
      fallbackSnapshot?.effectiveDate ??
      startOfDayUtc(pour.pourDate);

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.goldPour.update({
        where: { id: pour.id },
        data: {
          goldPriceUsdPerGram,
          valuationDate,
          valueUsd: roundUsd(Number(pour.grossWeight) * goldPriceUsdPerGram),
        },
      });
    }
    summary.goldPoursUpdated += 1;
  }

  const dispatches = await prisma.goldDispatch.findMany({
    where: {
      goldPour: { site: { companyId } },
      OR: [
        { goldPriceUsdPerGram: null },
        { valuationDate: null },
        { valueUsd: null },
      ],
    },
    select: {
      id: true,
      dispatchDate: true,
      goldPriceUsdPerGram: true,
      valuationDate: true,
      goldPour: { select: { grossWeight: true } },
    },
  });

  for (const dispatch of dispatches) {
    const fallbackSnapshot = resolveSnapshot(prices, dispatch.dispatchDate);
    const rawRate = dispatch.goldPriceUsdPerGram != null ? Number(dispatch.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;
    const valuationDate =
      dispatch.valuationDate ??
      fallbackSnapshot?.effectiveDate ??
      startOfDayUtc(dispatch.dispatchDate);

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.goldDispatch.update({
        where: { id: dispatch.id },
        data: {
          goldPriceUsdPerGram,
          valuationDate,
          valueUsd: roundUsd(Number(dispatch.goldPour.grossWeight) * goldPriceUsdPerGram),
        },
      });
    }
    summary.goldDispatchesUpdated += 1;
  }

  const receipts = await prisma.buyerReceipt.findMany({
    where: {
      OR: [
        { goldPour: { is: { site: { companyId } } } },
        { goldDispatch: { is: { goldPour: { site: { companyId } } } } },
      ],
      AND: [
        {
          OR: [
            { goldPriceUsdPerGram: null },
            { valuationDate: null },
            { paidValueUsd: null },
          ],
        },
      ],
    },
    select: {
      id: true,
      receiptDate: true,
      paidAmount: true,
      goldPriceUsdPerGram: true,
      valuationDate: true,
    },
  });

  for (const receipt of receipts) {
    const fallbackSnapshot = resolveSnapshot(prices, receipt.receiptDate);
    const rawRate = receipt.goldPriceUsdPerGram != null ? Number(receipt.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;
    const valuationDate =
      receipt.valuationDate ??
      fallbackSnapshot?.effectiveDate ??
      startOfDayUtc(receipt.receiptDate);

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.buyerReceipt.update({
        where: { id: receipt.id },
        data: {
          goldPriceUsdPerGram,
          valuationDate,
          paidValueUsd: roundUsd(Number(receipt.paidAmount) * goldPriceUsdPerGram),
        },
      });
    }
    summary.buyerReceiptsUpdated += 1;
  }

  const allocations = await prisma.goldShiftAllocation.findMany({
    where: {
      site: { companyId },
      OR: [
        { goldPriceUsdPerGram: null },
        { valuationDate: null },
        { totalWeightValueUsd: null },
        { netWeightValueUsd: null },
        { workerShareValueUsd: null },
        { companyShareValueUsd: null },
        { perWorkerValueUsd: null },
      ],
    },
    select: {
      id: true,
      date: true,
      totalWeight: true,
      netWeight: true,
      workerShareWeight: true,
      companyShareWeight: true,
      perWorkerWeight: true,
      goldPriceUsdPerGram: true,
      valuationDate: true,
    },
  });

  for (const allocation of allocations) {
    const fallbackSnapshot = resolveSnapshot(prices, allocation.date);
    const rawRate = allocation.goldPriceUsdPerGram != null ? Number(allocation.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;
    const valuationDate =
      allocation.valuationDate ??
      fallbackSnapshot?.effectiveDate ??
      startOfDayUtc(allocation.date);

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.goldShiftAllocation.update({
        where: { id: allocation.id },
        data: {
          goldPriceUsdPerGram,
          valuationDate,
          totalWeightValueUsd: roundUsd(Number(allocation.totalWeight) * goldPriceUsdPerGram),
          netWeightValueUsd: roundUsd(Number(allocation.netWeight) * goldPriceUsdPerGram),
          workerShareValueUsd: roundUsd(Number(allocation.workerShareWeight) * goldPriceUsdPerGram),
          companyShareValueUsd: roundUsd(Number(allocation.companyShareWeight) * goldPriceUsdPerGram),
          perWorkerValueUsd: roundUsd(Number(allocation.perWorkerWeight) * goldPriceUsdPerGram),
        },
      });
    }
    summary.goldShiftAllocationsUpdated += 1;
  }

  const workerShares = await prisma.goldShiftWorkerShare.findMany({
    where: {
      allocation: { site: { companyId } },
      shareValueUsd: null,
    },
    select: {
      id: true,
      shareWeight: true,
      allocation: {
        select: {
          date: true,
          goldPriceUsdPerGram: true,
        },
      },
    },
  });

  for (const share of workerShares) {
    const fallbackSnapshot = resolveSnapshot(prices, share.allocation.date);
    const rawRate = share.allocation.goldPriceUsdPerGram != null ? Number(share.allocation.goldPriceUsdPerGram) : null;
    const goldPriceUsdPerGram = isValidRate(rawRate)
      ? rawRate
      : fallbackSnapshot?.priceUsdPerGram;

    if (!isValidRate(goldPriceUsdPerGram)) {
      summary.skippedNoPrice += 1;
      continue;
    }

    if (!dryRun) {
      await prisma.goldShiftWorkerShare.update({
        where: { id: share.id },
        data: {
          shareValueUsd: roundUsd(Number(share.shareWeight) * goldPriceUsdPerGram),
        },
      });
    }
    summary.goldShiftWorkerSharesUpdated += 1;
  }

  return summary;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const companyId = parseArg("--company-id");

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
    console.error("[backfill-gold-valuations] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
