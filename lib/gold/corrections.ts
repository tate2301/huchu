import type { GoldCorrectionType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { captureAccountingEvent } from "@/lib/accounting/integration";

type Db = PrismaClient | Prisma.TransactionClient;

export type SupportedEntityType = "GoldPour" | "GoldPurchase" | "GoldDispatch" | "GoldShiftAllocation";

export type CreateGoldLedgerCorrectionInput = {
  companyId: string;
  entityType: SupportedEntityType;
  entityId: string;
  type: GoldCorrectionType;
  reason: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  deltaUsd?: number | null;
  deltaGrams?: number | null;
  createdById: string;
};

export type CreateBuyerReceiptCorrectionInput = {
  buyerReceiptId: string;
  companyId: string;
  type: GoldCorrectionType;
  reason: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  deltaAmountUsd?: number | null;
  deltaAssay?: number | null;
  createdById: string;
};

export async function verifyEntityOwnership(
  companyId: string,
  entityType: SupportedEntityType,
  entityId: string,
): Promise<boolean> {
  switch (entityType) {
    case "GoldPour": {
      const row = await prisma.goldPour.findUnique({
        where: { id: entityId },
        select: { companyId: true },
      });
      return row?.companyId === companyId;
    }
    case "GoldPurchase": {
      const row = await prisma.goldPurchase.findUnique({
        where: { id: entityId },
        select: { companyId: true },
      });
      return row?.companyId === companyId;
    }
    case "GoldDispatch": {
      const row = await prisma.goldDispatch.findUnique({
        where: { id: entityId },
        select: { companyId: true },
      });
      return row?.companyId === companyId;
    }
    case "GoldShiftAllocation": {
      const row = await prisma.goldShiftAllocation.findUnique({
        where: { id: entityId },
        select: { companyId: true },
      });
      return row?.companyId === companyId;
    }
    default:
      return false;
  }
}

export async function createGoldLedgerCorrection(
  input: CreateGoldLedgerCorrectionInput,
  db: Db = prisma,
) {
  const correction = await (db as PrismaClient).goldLedgerCorrection.create({
    data: {
      companyId: input.companyId,
      entityType: input.entityType,
      entityId: input.entityId,
      type: input.type,
      reason: input.reason,
      beforeJson: input.beforeJson !== undefined ? (input.beforeJson as Prisma.InputJsonValue) : undefined,
      afterJson: input.afterJson !== undefined ? (input.afterJson as Prisma.InputJsonValue) : undefined,
      deltaUsd: input.deltaUsd ?? null,
      deltaGrams: input.deltaGrams ?? null,
      // TODO(Epic 7b): Create AdjustmentEntry and link via adjustmentEntryId once
      // AdjustmentTargetType enum gains a GOLD_CORRECTION value in schema.prisma.
      // Until then, captureAccountingEvent provides the finance signal.
      adjustmentEntryId: null,
      createdById: input.createdById,
    },
  });
  return correction;
}

export async function createBuyerReceiptCorrection(
  input: CreateBuyerReceiptCorrectionInput,
  db: Db = prisma,
) {
  const correction = await (db as PrismaClient).buyerReceiptCorrection.create({
    data: {
      buyerReceiptId: input.buyerReceiptId,
      companyId: input.companyId,
      type: input.type,
      reason: input.reason,
      beforeJson: input.beforeJson !== undefined ? (input.beforeJson as Prisma.InputJsonValue) : undefined,
      afterJson: input.afterJson !== undefined ? (input.afterJson as Prisma.InputJsonValue) : undefined,
      deltaAmountUsd: input.deltaAmountUsd ?? null,
      deltaAssay: input.deltaAssay ?? null,
      // TODO(Epic 7b): Link AdjustmentEntry once AdjustmentTargetType has GOLD_CORRECTION.
      adjustmentEntryId: null,
      createdById: input.createdById,
    },
  });
  return correction;
}

export async function captureGoldCorrectionAccountingEvent(
  input: {
    companyId: string;
    correctionId: string;
    entityType: string;
    entityId: string;
    deltaUsd?: number | null;
    createdById: string;
    label: string;
  },
  db: Db = prisma,
) {
  if (!input.deltaUsd) return null;
  return captureAccountingEvent(
    {
      companyId: input.companyId,
      sourceDomain: "gold",
      sourceAction: "correction-created",
      sourceId: input.correctionId,
      description: `Gold correction on ${input.entityType} ${input.entityId}: ${input.label}`,
      amount: input.deltaUsd,
      payload: {
        correctionId: input.correctionId,
        entityType: input.entityType,
        entityId: input.entityId,
      },
      createdById: input.createdById,
      status: "PENDING",
    },
    db,
  );
}
