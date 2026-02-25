import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { captureAccountingEvent } from "@/lib/accounting/integration";

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function getBackfillStartDate() {
  const date = new Date();
  date.setMonth(date.getMonth() - 12);
  return date;
}

async function backfillCompany(companyId: string, dryRun: boolean) {
  const startDate = getBackfillStartDate();
  let captured = 0;

  const [stockMovements, payrollRuns, disbursementBatches, buyerReceipts, completedWorkOrders] =
    await Promise.all([
      prisma.stockMovement.findMany({
        where: {
          createdAt: { gte: startDate },
          item: { site: { companyId } },
        },
        include: {
          item: { select: { name: true } },
        },
      }),
      prisma.payrollRun.findMany({
        where: {
          companyId,
          domain: "PAYROLL",
          status: { in: ["APPROVED", "POSTED"] },
          approvedAt: { gte: startDate },
        },
      }),
      prisma.disbursementBatch.findMany({
        where: {
          companyId,
          payrollRun: { is: { domain: "PAYROLL" } },
          status: "PAID",
          paidAt: { gte: startDate },
        },
      }),
      prisma.buyerReceipt.findMany({
        where: {
          receiptDate: { gte: startDate },
          goldDispatch: { goldPour: { site: { companyId } } },
        },
      }),
      prisma.workOrder.findMany({
        where: {
          status: "COMPLETED",
          downtimeEnd: { gte: startDate },
          equipment: { site: { companyId } },
        },
      }),
    ]);

  if (dryRun) {
    return {
      companyId,
      captured,
      stockMovements: stockMovements.length,
      payrollRuns: payrollRuns.length,
      disbursementBatches: disbursementBatches.length,
      buyerReceipts: buyerReceipts.length,
      completedWorkOrders: completedWorkOrders.length,
    };
  }

  for (const movement of stockMovements) {
    await captureAccountingEvent({
      companyId,
      sourceDomain: "inventory",
      sourceAction: "movement-backfill",
      sourceType:
        movement.movementType === "RECEIPT"
          ? "STOCK_RECEIPT"
          : movement.movementType === "ISSUE"
            ? "STOCK_ISSUE"
            : movement.movementType === "TRANSFER"
              ? "STOCK_TRANSFER"
              : "STOCK_ADJUSTMENT",
      sourceId: movement.id,
      entryDate: movement.createdAt,
      description: `Backfill stock ${movement.movementType.toLowerCase()} - ${movement.item.name}`,
      payload: {
        movementType: movement.movementType,
        quantity: movement.quantity,
        unit: movement.unit,
      },
      createdById: movement.issuedById,
      status: "PENDING",
    });
    captured += 1;
  }

  for (const run of payrollRuns) {
    await captureAccountingEvent({
      companyId,
      sourceDomain: "payroll",
      sourceAction: "run-approved-backfill",
      sourceType: "PAYROLL_RUN",
      sourceId: run.id,
      entryDate: run.approvedAt ?? run.updatedAt,
      description: `Backfill payroll run #${run.runNumber} approved`,
      amount: run.netTotal,
      grossAmount: run.grossTotal,
      netAmount: run.netTotal,
      deductionsAmount: run.deductionsTotal,
      allowancesAmount: run.allowancesTotal,
      createdById: run.approvedById,
      status: "PENDING",
    });
    captured += 1;
  }

  for (const batch of disbursementBatches) {
    await captureAccountingEvent({
      companyId,
      sourceDomain: "disbursements",
      sourceAction: "batch-paid-backfill",
      sourceType: "PAYROLL_DISBURSEMENT",
      sourceId: batch.id,
      entryDate: batch.paidAt ?? batch.updatedAt,
      description: `Backfill disbursement batch ${batch.code} paid`,
      amount: batch.totalAmount,
      netAmount: batch.totalAmount,
      grossAmount: batch.totalAmount,
      createdById: batch.approvedById ?? batch.createdById,
      status: "PENDING",
    });
    captured += 1;
  }

  for (const receipt of buyerReceipts) {
    const receiptUsdAmount =
      receipt.paidValueUsd ??
      ((receipt.goldPriceUsdPerGram ?? 0) > 0
        ? receipt.paidAmount * (receipt.goldPriceUsdPerGram ?? 0)
        : receipt.paidAmount);
    await captureAccountingEvent({
      companyId,
      sourceDomain: "gold",
      sourceAction: "receipt-backfill",
      sourceType: "GOLD_RECEIPT",
      sourceId: receipt.id,
      entryDate: receipt.receiptDate,
      description: `Backfill gold receipt ${receipt.receiptNumber}`,
      amount: receiptUsdAmount,
      netAmount: receiptUsdAmount,
      grossAmount: receiptUsdAmount,
      status: "PENDING",
    });
    captured += 1;
  }

  for (const order of completedWorkOrders) {
    const totalCost = (order.partsCost ?? 0) + (order.laborCost ?? 0);
    if (totalCost <= 0) continue;
    await captureAccountingEvent({
      companyId,
      sourceDomain: "maintenance",
      sourceAction: "work-order-completed-backfill",
      sourceType: "MAINTENANCE_COMPLETION",
      sourceId: order.id,
      entryDate: order.downtimeEnd ?? order.updatedAt,
      description: `Backfill maintenance completion ${order.id}`,
      amount: totalCost,
      netAmount: totalCost,
      grossAmount: totalCost,
      status: "PENDING",
    });
    captured += 1;
  }

  return {
    companyId,
    captured,
    stockMovements: stockMovements.length,
    payrollRuns: payrollRuns.length,
    disbursementBatches: disbursementBatches.length,
    buyerReceipts: buyerReceipts.length,
    completedWorkOrders: completedWorkOrders.length,
  };
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
    console.error("[accounting-backfill-events] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
