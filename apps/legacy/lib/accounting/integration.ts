import type { AccountingSourceType, PrismaClient, Prisma } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import {
  createJournalEntryFromSource,
  type PostingInventoryLine,
  type PostingPaymentSplit,
} from "@/lib/accounting/posting";
import { buildAccountingEventKey } from "@/lib/accounting/integration-keys";
import { buildRetailPostingPayload } from "@/lib/accounting/retail-posting";
import { isPositive, money, sumMoney, toNumber, toNumberOrZero, type MoneyLike } from "@/lib/money";

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
  // `MoneyLike`, not `number`, because callers increasingly hold a
  // `Prisma.Decimal` — every school fee column is one and the HR payroll
  // columns became ones. The event table itself is still `Float`, so the
  // crossing happens once, here, rather than at each of the twenty-odd call
  // sites where it is easy to get wrong or forget.
  amount?: MoneyLike;
  netAmount?: MoneyLike;
  taxAmount?: MoneyLike;
  grossAmount?: MoneyLike;
  deductionsAmount?: MoneyLike;
  allowancesAmount?: MoneyLike;
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
      amount: toNumber(input.amount),
      netAmount: toNumber(input.netAmount),
      taxAmount: toNumber(input.taxAmount),
      grossAmount: toNumber(input.grossAmount),
      deductionsAmount: toNumber(input.deductionsAmount),
      allowancesAmount: toNumber(input.allowancesAmount),
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
      amount: toNumber(input.amount),
      netAmount: toNumber(input.netAmount),
      taxAmount: toNumber(input.taxAmount),
      grossAmount: toNumber(input.grossAmount),
      deductionsAmount: toNumber(input.deductionsAmount),
      allowancesAmount: toNumber(input.allowancesAmount),
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

    // Retail money is `Decimal` since R-1.1, and the posting contract takes
    // `number` — so the arithmetic happens in `Decimal` and the conversion happens
    // once, here at the boundary. Both `context` and `payload` used to build these
    // two lists separately with `Math.abs` on what is now a `Decimal`; they share
    // them now, because two copies of the same sum are two chances to disagree.
    const postingPayments = sale.payments.map((payment) => ({
      tenderType: payment.tenderType,
      amount: toNumberOrZero(money(payment.amount).abs()),
      reference: payment.reference,
    }));

    const postingInventoryLines = sale.lines.map((line) => {
      const fallbackUnitCost = unitCostByItemId.get(line.inventoryItemId) ?? 0;
      const lineUnitCost = money(line.costUnit);
      const unitCost = lineUnitCost.isZero() ? money(fallbackUnitCost).abs() : lineUnitCost.abs();
      const lineTotalCost = money(line.costTotal);
      const totalCost = lineTotalCost.isZero()
        ? money(line.quantity).abs().times(unitCost)
        : lineTotalCost.abs();
      return {
        inventoryItemId: line.inventoryItemId,
        itemName: line.itemName,
        quantity: toNumberOrZero(money(line.quantity).abs()),
        unitCost: toNumberOrZero(unitCost),
        totalCost: toNumberOrZero(totalCost),
      };
    });

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
        amount: toNumberOrZero(money(sale.totalAmount).abs()),
        netAmount: toNumberOrZero(money(sale.subtotal).minus(sale.discountAmount).abs()),
        taxAmount: toNumberOrZero(money(sale.taxAmount).abs()),
        grossAmount: toNumberOrZero(money(sale.totalAmount).abs()),
        invertDirection: sale.saleType === "REFUND" || sale.saleType === "VOID",
        actorRole: input.actorRole ?? undefined,
        periodOverrideReason: input.periodOverrideReason ?? undefined,
        payments: postingPayments,
        inventory: { lines: postingInventoryLines },
        payload: buildRetailPostingPayload({
          siteId: sale.siteId,
          registerCode: shift?.registerCode ?? null,
          saleType: sale.saleType,
          payments: postingPayments,
          inventory: {
            lines: postingInventoryLines,
            // Summed from the same lines the payload carries. It used to be a
            // third re-derivation of unit cost from the fallback map, which is
            // one more place for the total to stop matching its own lines.
            totalCost: postingInventoryLines.reduce((total, line) => total + line.totalCost, 0),
          },
        }),
      },
    });
  }

  for (const receipt of receipts) {
    if (journalKeySet.has(`RETAIL_GOODS_RECEIPT:${receipt.id}`)) continue;
    const receiptTotal = sumMoney(receipt.lines.map((line) => line.lineTotal));
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
        // Accumulated in `Decimal` and rounded once, rather than summed three
        // separate times in floating point as this did before.
        amount: toNumberOrZero(receiptTotal),
        netAmount: toNumberOrZero(receiptTotal),
        taxAmount: 0,
        grossAmount: toNumberOrZero(receiptTotal),
        actorRole: input.actorRole ?? undefined,
        periodOverrideReason: input.periodOverrideReason ?? undefined,
        inventory: {
          lines: receipt.lines.map((line) => ({
            inventoryItemId: line.inventoryItemId,
            itemName: line.itemName,
            quantity: toNumberOrZero(line.quantity),
            unitCost: toNumberOrZero(line.unitCost),
            totalCost: toNumberOrZero(line.lineTotal),
          })),
        },
      },
    });
  }

  for (const shift of shifts) {
    // `openingFloat` and `variance` are `Decimal` since R-1.1, so the comparisons
    // go through `lib/money.ts` rather than JavaScript's operators — `>` on a
    // `Decimal` is a type error, and `!== 0` would have been true for every shift
    // because an object is never equal to a number.
    const openingFloat = money(shift.openingFloat);
    const variance = money(shift.variance ?? 0);

    if (isPositive(openingFloat) && !journalKeySet.has(`RETAIL_SHIFT_OPEN:${shift.id}`)) {
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
          amount: toNumberOrZero(openingFloat.abs()),
          netAmount: toNumberOrZero(openingFloat.abs()),
          taxAmount: 0,
          grossAmount: toNumberOrZero(openingFloat.abs()),
          actorRole: input.actorRole ?? undefined,
          periodOverrideReason: input.periodOverrideReason ?? undefined,
        },
      });
    }

    if (!variance.isZero() && shift.closedAt && !journalKeySet.has(`RETAIL_SHIFT_VARIANCE:${shift.id}`)) {
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
          amount: toNumberOrZero(variance.abs()),
          netAmount: toNumberOrZero(variance.abs()),
          taxAmount: 0,
          grossAmount: toNumberOrZero(variance.abs()),
          invertDirection: variance.isNegative(),
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
