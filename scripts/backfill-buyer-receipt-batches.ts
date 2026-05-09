/**
 * Backfill BuyerReceiptBatch + BuyerReceiptDispatch from legacy single-FK
 * BuyerReceipt rows.
 *
 * Run after `prisma db push` introduces the new join models.
 *
 *   npx tsx scripts/backfill-buyer-receipt-batches.ts          # report only
 *   npx tsx scripts/backfill-buyer-receipt-batches.ts --apply  # write rows
 *
 * Idempotent: every insert uses upsert/skipDuplicates so re-running is safe.
 */
import "dotenv/config";

import { prisma } from "@/lib/prisma";

const APPLY = process.argv.includes("--apply");

type LegacyReceipt = {
  id: string;
  goldPourId: string | null;
  goldDispatchId: string | null;
  paidAmount: number;
  paidValueUsd: number | null;
  goldPriceUsdPerGram: number | null;
  goldPour: { id: string; grossWeight: number } | null;
};

async function main() {
  console.log(`[backfill] mode=${APPLY ? "APPLY" : "DRY-RUN"}`);

  const receipts = (await prisma.buyerReceipt.findMany({
    select: {
      id: true,
      goldPourId: true,
      goldDispatchId: true,
      paidAmount: true,
      paidValueUsd: true,
      goldPriceUsdPerGram: true,
      goldPour: { select: { id: true, grossWeight: true } },
    },
    orderBy: { createdAt: "asc" },
  })) as LegacyReceipt[];

  let batchInserts = 0;
  let dispatchInserts = 0;
  let skippedNoPour = 0;
  let alreadyHadBatch = 0;
  let alreadyHadDispatch = 0;

  for (const r of receipts) {
    if (r.goldPourId && r.goldPour) {
      const existing = await prisma.buyerReceiptBatch.findUnique({
        where: {
          buyerReceiptId_goldPourId: {
            buyerReceiptId: r.id,
            goldPourId: r.goldPourId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        alreadyHadBatch += 1;
      } else if (APPLY) {
        await prisma.buyerReceiptBatch.create({
          data: {
            buyerReceiptId: r.id,
            goldPourId: r.goldPourId,
            grams: r.goldPour.grossWeight,
            valueUsd: r.paidValueUsd,
            goldPriceUsdPerGram: r.goldPriceUsdPerGram,
            notes: "Backfilled from legacy BuyerReceipt.goldPourId",
          },
        });
        batchInserts += 1;
      } else {
        batchInserts += 1;
      }
    } else if (!r.goldPourId && !r.goldDispatchId) {
      skippedNoPour += 1;
    }

    if (r.goldDispatchId) {
      const existing = await prisma.buyerReceiptDispatch.findUnique({
        where: {
          buyerReceiptId_goldDispatchId: {
            buyerReceiptId: r.id,
            goldDispatchId: r.goldDispatchId,
          },
        },
        select: { id: true },
      });
      if (existing) {
        alreadyHadDispatch += 1;
      } else if (APPLY) {
        await prisma.buyerReceiptDispatch.create({
          data: {
            buyerReceiptId: r.id,
            goldDispatchId: r.goldDispatchId,
          },
        });
        dispatchInserts += 1;
      } else {
        dispatchInserts += 1;
      }
    }
  }

  console.log("[backfill] receipts inspected:", receipts.length);
  console.log("[backfill] would-create BuyerReceiptBatch rows:", batchInserts);
  console.log("[backfill] already-present BuyerReceiptBatch rows:", alreadyHadBatch);
  console.log("[backfill] would-create BuyerReceiptDispatch rows:", dispatchInserts);
  console.log("[backfill] already-present BuyerReceiptDispatch rows:", alreadyHadDispatch);
  console.log("[backfill] receipts without pour or dispatch (skipped):", skippedNoPour);
  if (!APPLY) {
    console.log("[backfill] DRY-RUN — re-run with --apply to write.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
