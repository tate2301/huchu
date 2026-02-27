import "dotenv/config";

import { prisma } from "@/lib/prisma";
import { AUTO_BATCH_NOTE_PREFIX } from "@/lib/gold-payouts";

type Summary = {
  companyId: string;
  inspectedPours: number;
  matchedAutoBatches: number;
  allocationMissing: number;
  invalidNotes: number;
  companyMismatch: number;
  updatedPours: number;
  updatedLinks: number;
  updatedGrossWeight: number;
  updatedCreatedBy: number;
  updatedValueUsd: number;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseArg(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function extractAllocationIdFromBatchNotes(notes: string | null | undefined) {
  if (!notes || !notes.startsWith(AUTO_BATCH_NOTE_PREFIX)) return null;
  const remainder = notes.slice(AUTO_BATCH_NOTE_PREFIX.length).trim();
  const [candidate] = remainder.split(/\s+/);
  if (!candidate) return null;
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

async function backfillCompany(companyId: string, dryRun: boolean): Promise<Summary> {
  const pours = await prisma.goldPour.findMany({
    where: {
      site: { companyId },
      notes: { startsWith: AUTO_BATCH_NOTE_PREFIX },
    },
    select: {
      id: true,
      notes: true,
      grossWeight: true,
      valueUsd: true,
      goldPriceUsdPerGram: true,
      createdById: true,
      goldShiftAllocationId: true,
      site: { select: { companyId: true } },
    },
  });

  const summary: Summary = {
    companyId,
    inspectedPours: pours.length,
    matchedAutoBatches: 0,
    allocationMissing: 0,
    invalidNotes: 0,
    companyMismatch: 0,
    updatedPours: 0,
    updatedLinks: 0,
    updatedGrossWeight: 0,
    updatedCreatedBy: 0,
    updatedValueUsd: 0,
  };

  const parsedPairs = pours.map((pour) => ({
    pour,
    allocationId: extractAllocationIdFromBatchNotes(pour.notes),
  }));

  const validAllocationIds = Array.from(
    new Set(
      parsedPairs
        .map((pair) => pair.allocationId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const allocations = validAllocationIds.length
    ? await prisma.goldShiftAllocation.findMany({
        where: { id: { in: validAllocationIds } },
        select: {
          id: true,
          totalWeight: true,
          totalWeightValueUsd: true,
          createdById: true,
          site: { select: { companyId: true } },
        },
      })
    : [];

  const allocationById = new Map(allocations.map((allocation) => [allocation.id, allocation]));

  for (const pair of parsedPairs) {
    const { pour, allocationId } = pair;
    if (!allocationId) {
      summary.invalidNotes += 1;
      continue;
    }

    summary.matchedAutoBatches += 1;
    const allocation = allocationById.get(allocationId);
    if (!allocation) {
      summary.allocationMissing += 1;
      continue;
    }

    if (allocation.site.companyId !== companyId || pour.site.companyId !== companyId) {
      summary.companyMismatch += 1;
      continue;
    }

    const nextData: {
      goldShiftAllocationId?: string;
      grossWeight?: number;
      createdById?: string;
      valueUsd?: number;
    } = {};

    if (pour.goldShiftAllocationId !== allocation.id) {
      nextData.goldShiftAllocationId = allocation.id;
      summary.updatedLinks += 1;
    }

    if (Math.abs(pour.grossWeight - allocation.totalWeight) > 0.000001) {
      nextData.grossWeight = allocation.totalWeight;
      summary.updatedGrossWeight += 1;
    }

    if (!pour.createdById) {
      nextData.createdById = allocation.createdById;
      summary.updatedCreatedBy += 1;
    }

    const targetValueUsd = isFiniteNumber(allocation.totalWeightValueUsd)
      ? roundUsd(allocation.totalWeightValueUsd)
      : isFiniteNumber(pour.goldPriceUsdPerGram)
        ? roundUsd(allocation.totalWeight * pour.goldPriceUsdPerGram)
        : null;

    if (
      targetValueUsd !== null &&
      (!isFiniteNumber(pour.valueUsd) || Math.abs(pour.valueUsd - targetValueUsd) > 0.005)
    ) {
      nextData.valueUsd = targetValueUsd;
      summary.updatedValueUsd += 1;
    }

    if (Object.keys(nextData).length === 0) continue;
    summary.updatedPours += 1;
    if (!dryRun) {
      await prisma.goldPour.update({
        where: { id: pour.id },
        data: nextData,
      });
    }
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
    console.error("[backfill-gold-shift-batches] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
