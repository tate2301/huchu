import type { AccountingSourceType, PrismaClient, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createJournalEntryFromSource,
  type PostingInventoryLine,
  type PostingPaymentSplit,
} from "@/lib/accounting/posting";
import { buildAccountingEventKey } from "@/lib/accounting/integration-keys";
import { buildRetailPostingPayload } from "@/lib/accounting/retail-posting";

type Db = PrismaClient | Prisma.TransactionClient;

type CaptureAccountingEventInput = {
  companyId: string;
  sourceDomain: string;
  sourceAction: string;
  sourceType?: AccountingSourceType | null;
  sourceId?: string | null;
  sourceSubtype?: string | null;
  siteId?: string | null;
  registerCode?: string | null;
  causationKey?: string | null;
  entryDate?: Date | null;
  description?: string | null;
  amount?: number | null;
  netAmount?: number | null;
  taxAmount?: number | null;
  grossAmount?: number | null;
  deductionsAmount?: number | null;
  allowancesAmount?: number | null;
  currency?: string | null;
  payload?: unknown;
  createdById?: string | null;
  status?: "PENDING" | "POSTED" | "FAILED" | "IGNORED";
};

function parsePayload(payloadJson: string | null) {
  if (!payloadJson) return null;
  try {
    return JSON.parse(payloadJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parsePostingPayments(payload: Record<string, unknown> | null) {
  if (!Array.isArray(payload?.payments)) return undefined;
  return payload.payments as PostingPaymentSplit[];
}

function parsePostingInventory(payload: Record<string, unknown> | null) {
  if (!payload?.inventory || typeof payload.inventory !== "object") return undefined;
  const inventory = payload.inventory as {
    lines?: PostingInventoryLine[];
    totalCost?: number;
  };
  return Array.isArray(inventory.lines)
    ? {
        lines: inventory.lines,
        totalCost: inventory.totalCost,
      }
    : undefined;
}

async function resolveFallbackActorId(companyId: string) {
  const fallbackUser = await prisma.user.findFirst({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return fallbackUser?.id ?? null;
}

export async function captureAccountingEvent(input: CaptureAccountingEventInput, db: Db = prisma) {
  const eventKey = buildAccountingEventKey({
    companyId: input.companyId,
    sourceDomain: input.sourceDomain,
    sourceAction: input.sourceAction,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? input.causationKey ?? null,
    fallback: input.description ?? input.entryDate?.toISOString() ?? "event",
  });

  return db.accountingIntegrationEvent.upsert({
    where: { eventKey },
    update: {
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      sourceSubtype: input.sourceSubtype ?? null,
      siteId: input.siteId ?? null,
      registerCode: input.registerCode ?? null,
      causationKey: input.causationKey ?? null,
      entryDate: input.entryDate ?? null,
      description: input.description ?? null,
      amount: input.amount ?? null,
      netAmount: input.netAmount ?? null,
      taxAmount: input.taxAmount ?? null,
      grossAmount: input.grossAmount ?? null,
      deductionsAmount: input.deductionsAmount ?? null,
      allowancesAmount: input.allowancesAmount ?? null,
      currency: input.currency ?? null,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      createdById: input.createdById ?? null,
      status: input.status ?? "IGNORED",
      lastError: null,
      nextRetryAt: null,
    },
    create: {
      companyId: input.companyId,
      sourceDomain: input.sourceDomain,
      sourceAction: input.sourceAction,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      sourceSubtype: input.sourceSubtype ?? null,
      siteId: input.siteId ?? null,
      registerCode: input.registerCode ?? null,
      causationKey: input.causationKey ?? null,
      eventKey,
      entryDate: input.entryDate ?? null,
      description: input.description ?? null,
      amount: input.amount ?? null,
      netAmount: input.netAmount ?? null,
      taxAmount: input.taxAmount ?? null,
      grossAmount: input.grossAmount ?? null,
      deductionsAmount: input.deductionsAmount ?? null,
      allowancesAmount: input.allowancesAmount ?? null,
      currency: input.currency ?? null,
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
      createdById: input.createdById ?? null,
      status: input.status ?? "IGNORED",
    },
    select: {
      id: true,
      eventKey: true,
      status: true,
      sourceType: true,
      sourceId: true,
    },
  });
}

export async function retryPendingAccountingEvents(input: {
  companyId: string;
  limit?: number;
  actorRole?: string | null;
  periodOverrideReason?: string | null;
}) {
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 1000);
  const now = new Date();

  const events = await prisma.accountingIntegrationEvent.findMany({
    where: {
      companyId: input.companyId,
      sourceType: { not: null },
      sourceId: { not: null },
      status: { in: ["FAILED", "PENDING"] },
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
    },
    orderBy: [{ nextRetryAt: "asc" }, { updatedAt: "asc" }],
    take: limit,
  });

  let posted = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const payload = parsePayload(event.payloadJson);
    const createdById = event.createdById ?? (await resolveFallbackActorId(event.companyId));
    if (!createdById) {
      failed += 1;
      continue;
    }

    const result = await createJournalEntryFromSource({
      companyId: event.companyId,
      sourceType: event.sourceType as AccountingSourceType,
      sourceId: event.sourceId,
      sourceSubtype: event.sourceSubtype,
      siteId: event.siteId,
      registerCode: event.registerCode,
      causationKey: event.causationKey,
      entryDate: event.entryDate ?? new Date(),
      description: event.description ?? `${event.sourceDomain}:${event.sourceAction}`,
      createdById,
      amount: event.amount ?? 0,
      netAmount: event.netAmount ?? undefined,
      taxAmount: event.taxAmount ?? undefined,
      grossAmount: event.grossAmount ?? undefined,
      deductionsAmount: event.deductionsAmount ?? undefined,
      allowancesAmount: event.allowancesAmount ?? undefined,
      currency: event.currency ?? undefined,
      invertDirection: payload?.invertDirection === true,
      actorRole: input.actorRole ?? undefined,
      periodOverrideReason: input.periodOverrideReason ?? undefined,
      payload,
      payments: parsePostingPayments(payload),
      inventory: parsePostingInventory(payload),
    });

    if (result.entryId) {
      posted += 1;
    } else if (result.skipped) {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return {
    processed: events.length,
    posted,
    skipped,
    failed,
  };
}

type BackfillTask = {
  key: string;
  label: string;
  entryDate: Date;
  context: Parameters<typeof createJournalEntryFromSource>[0];
};

export async function backfillRetailAccounting(input: {
  companyId: string;
  actorId?: string | null;
  actorRole?: string | null;
  periodOverrideReason?: string | null;
  dryRun?: boolean;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000);
  const actorId = input.actorId ?? (await resolveFallbackActorId(input.companyId));
  if (!actorId) {
    throw new Error("No active actor is available for retail accounting backfill");
  }

  const [sales, receipts, shifts, journalEntries, inventoryItems] = await Promise.all([
    prisma.retailSale.findMany({
      where: { companyId: input.companyId, status: "POSTED" },
      include: { lines: true, payments: true },
      orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    }),
    prisma.retailGoodsReceipt.findMany({
      where: { companyId: input.companyId, status: "POSTED" },
      include: { lines: true },
      orderBy: [{ postedAt: "asc" }, { createdAt: "asc" }],
      take: limit,
    }),
    prisma.retailShift.findMany({
      where: { companyId: input.companyId },
      orderBy: [{ openedAt: "asc" }],
      take: limit,
    }),
    prisma.journalEntry.findMany({
      where: {
        companyId: input.companyId,
        sourceType: {
          in: [
            "RETAIL_SHIFT_OPEN",
            "RETAIL_SALE",
            "RETAIL_REFUND",
            "RETAIL_VOID",
            "RETAIL_GOODS_RECEIPT",
            "RETAIL_SHIFT_VARIANCE",
          ],
        },
      },
      select: { sourceType: true, sourceId: true },
    }),
    prisma.inventoryItem.findMany({
      where: { site: { companyId: input.companyId } },
      select: { id: true, unitCost: true },
    }),
  ]);

  const journalKeySet = new Set(
    journalEntries
      .filter((entry) => entry.sourceId)
      .map((entry) => `${entry.sourceType}:${entry.sourceId}`),
  );
  const unitCostByItemId = new Map(inventoryItems.map((item) => [item.id, item.unitCost ?? 0]));
  const shiftMap = new Map(shifts.map((shift) => [shift.id, shift]));
  const tasks: BackfillTask[] = [];

  for (const sale of sales) {
    const sourceType =
      sale.saleType === "REFUND"
        ? "RETAIL_REFUND"
        : sale.saleType === "VOID"
          ? "RETAIL_VOID"
          : "RETAIL_SALE";
    if (journalKeySet.has(`${sourceType}:${sale.id}`)) continue;
    const shift = sale.shiftId ? shiftMap.get(sale.shiftId) ?? null : null;
    tasks.push({
      key: `${sourceType}:${sale.id}`,
      label: `${sourceType} ${sale.saleNo}`,
      entryDate: sale.postedAt ?? sale.createdAt,
      context: {
        companyId: input.companyId,
        sourceType,
        sourceId: sale.id,
        siteId: sale.siteId,
        registerCode: shift?.registerCode ?? null,
        sourceSubtype: sale.saleType,
        entryDate: sale.postedAt ?? sale.createdAt,
        description: `Retail ${sale.saleType.toLowerCase()} ${sale.saleNo}`,
        createdById: actorId,
        amount: Math.abs(sale.totalAmount),
        netAmount: Math.abs(sale.subtotal - sale.discountAmount),
        taxAmount: Math.abs(sale.taxAmount),
        grossAmount: Math.abs(sale.totalAmount),
        invertDirection: sale.saleType === "REFUND" || sale.saleType === "VOID",
        actorRole: input.actorRole ?? undefined,
        periodOverrideReason: input.periodOverrideReason ?? undefined,
        payments: sale.payments.map((payment) => ({
          tenderType: payment.tenderType,
          amount: Math.abs(payment.amount),
          reference: payment.reference,
        })),
        inventory: {
          lines: sale.lines.map((line) => {
            const fallbackUnitCost = unitCostByItemId.get(line.inventoryItemId) ?? 0;
            const unitCost = Math.abs(line.costUnit || fallbackUnitCost);
            const totalCost = Math.abs(
              line.costTotal || Math.abs(line.quantity) * unitCost,
            );
            return {
              inventoryItemId: line.inventoryItemId,
              itemName: line.itemName,
              quantity: Math.abs(line.quantity),
              unitCost,
              totalCost,
            };
          }),
        },
        payload: buildRetailPostingPayload({
          siteId: sale.siteId,
          registerCode: shift?.registerCode ?? null,
          saleType: sale.saleType,
          payments: sale.payments.map((payment) => ({
            tenderType: payment.tenderType,
            amount: Math.abs(payment.amount),
            reference: payment.reference,
          })),
          inventory: {
            lines: sale.lines.map((line) => {
              const fallbackUnitCost = unitCostByItemId.get(line.inventoryItemId) ?? 0;
              const unitCost = Math.abs(line.costUnit || fallbackUnitCost);
              const totalCost = Math.abs(
                line.costTotal || Math.abs(line.quantity) * unitCost,
              );
              return {
                inventoryItemId: line.inventoryItemId,
                itemName: line.itemName,
                quantity: Math.abs(line.quantity),
                unitCost,
                totalCost,
              };
            }),
            totalCost: sale.lines.reduce(
              (total, line) => {
                const fallbackUnitCost = unitCostByItemId.get(line.inventoryItemId) ?? 0;
                const unitCost = Math.abs(line.costUnit || fallbackUnitCost);
                return total + Math.abs(line.costTotal || Math.abs(line.quantity) * unitCost);
              },
              0,
            ),
          },
        }),
      },
    });
  }

  for (const receipt of receipts) {
    if (journalKeySet.has(`RETAIL_GOODS_RECEIPT:${receipt.id}`)) continue;
    tasks.push({
      key: `RETAIL_GOODS_RECEIPT:${receipt.id}`,
      label: `RETAIL_GOODS_RECEIPT ${receipt.receiptNo}`,
      entryDate: receipt.postedAt ?? receipt.createdAt,
      context: {
        companyId: input.companyId,
        sourceType: "RETAIL_GOODS_RECEIPT",
        sourceId: receipt.id,
        siteId: receipt.siteId,
        sourceSubtype: "RECEIPT",
        entryDate: receipt.postedAt ?? receipt.createdAt,
        description: `Retail goods receipt ${receipt.receiptNo}`,
        createdById: actorId,
        amount: receipt.lines.reduce((total, line) => total + line.lineTotal, 0),
        netAmount: receipt.lines.reduce((total, line) => total + line.lineTotal, 0),
        taxAmount: 0,
        grossAmount: receipt.lines.reduce((total, line) => total + line.lineTotal, 0),
        actorRole: input.actorRole ?? undefined,
        periodOverrideReason: input.periodOverrideReason ?? undefined,
        inventory: {
          lines: receipt.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            itemName: line.itemName,
            quantity: line.quantity,
            unitCost: line.unitCost,
            totalCost: line.lineTotal,
          })),
        },
      },
    });
  }

  for (const shift of shifts) {
    if (shift.openingFloat > 0 && !journalKeySet.has(`RETAIL_SHIFT_OPEN:${shift.id}`)) {
      tasks.push({
        key: `RETAIL_SHIFT_OPEN:${shift.id}`,
        label: `RETAIL_SHIFT_OPEN ${shift.shiftNo}`,
        entryDate: shift.openedAt,
        context: {
          companyId: input.companyId,
          sourceType: "RETAIL_SHIFT_OPEN",
          sourceId: shift.id,
          siteId: shift.siteId,
          registerCode: shift.registerCode,
          entryDate: shift.openedAt,
          description: `Retail shift open ${shift.shiftNo}`,
          createdById: actorId,
          amount: Math.abs(shift.openingFloat),
          netAmount: Math.abs(shift.openingFloat),
          taxAmount: 0,
          grossAmount: Math.abs(shift.openingFloat),
          actorRole: input.actorRole ?? undefined,
          periodOverrideReason: input.periodOverrideReason ?? undefined,
        },
      });
    }

    if ((shift.variance ?? 0) !== 0 && shift.closedAt && !journalKeySet.has(`RETAIL_SHIFT_VARIANCE:${shift.id}`)) {
      tasks.push({
        key: `RETAIL_SHIFT_VARIANCE:${shift.id}`,
        label: `RETAIL_SHIFT_VARIANCE ${shift.shiftNo}`,
        entryDate: shift.closedAt,
        context: {
          companyId: input.companyId,
          sourceType: "RETAIL_SHIFT_VARIANCE",
          sourceId: shift.id,
          siteId: shift.siteId,
          registerCode: shift.registerCode,
          entryDate: shift.closedAt,
          description: `Retail shift variance ${shift.shiftNo}`,
          createdById: actorId,
          amount: Math.abs(shift.variance ?? 0),
          netAmount: Math.abs(shift.variance ?? 0),
          taxAmount: 0,
          grossAmount: Math.abs(shift.variance ?? 0),
          invertDirection: (shift.variance ?? 0) < 0,
          actorRole: input.actorRole ?? undefined,
          periodOverrideReason: input.periodOverrideReason ?? undefined,
        },
      });
    }
  }

  const ordered = tasks.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime()).slice(0, limit);
  if (input.dryRun ?? true) {
    return {
      mode: "DRY_RUN",
      discovered: ordered.length,
      candidates: ordered.map((task) => ({
        key: task.key,
        label: task.label,
        entryDate: task.entryDate.toISOString(),
      })),
    };
  }

  let posted = 0;
  let failed = 0;
  let skipped = 0;
  const failures: Array<{ key: string; error: string }> = [];

  for (const task of ordered) {
    const result = await createJournalEntryFromSource(task.context);
    if (result.entryId) {
      posted += 1;
    } else if (result.skipped) {
      skipped += 1;
    } else {
      failed += 1;
      failures.push({ key: task.key, error: result.error ?? "Unknown backfill failure" });
    }
  }

  return {
    mode: "APPLY",
    discovered: ordered.length,
    posted,
    skipped,
    failed,
    failures,
  };
}
