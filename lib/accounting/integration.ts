import type { AccountingSourceType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createJournalEntryFromSource } from "@/lib/accounting/posting";
import { buildAccountingEventKey } from "@/lib/accounting/integration-keys";

type CaptureAccountingEventInput = {
  companyId: string;
  sourceDomain: string;
  sourceAction: string;
  sourceType?: AccountingSourceType | null;
  sourceId?: string | null;
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

export async function captureAccountingEvent(input: CaptureAccountingEventInput) {
  const eventKey = buildAccountingEventKey({
    companyId: input.companyId,
    sourceDomain: input.sourceDomain,
    sourceAction: input.sourceAction,
    sourceType: input.sourceType ?? null,
    sourceId: input.sourceId ?? null,
    fallback: input.description ?? input.entryDate?.toISOString() ?? "event",
  });

  return prisma.accountingIntegrationEvent.upsert({
    where: { eventKey },
    update: {
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
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
    let payload: Record<string, unknown> | null = null;
    if (event.payloadJson) {
      try {
        payload = JSON.parse(event.payloadJson) as Record<string, unknown>;
      } catch {
        payload = null;
      }
    }

    let createdById = event.createdById ?? null;
    if (!createdById) {
      const fallbackUser = await prisma.user.findFirst({
        where: {
          companyId: event.companyId,
          isActive: true,
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      createdById = fallbackUser?.id ?? null;
      if (!createdById) {
        failed += 1;
        continue;
      }
    }

    const result = await createJournalEntryFromSource({
      companyId: event.companyId,
      sourceType: event.sourceType as AccountingSourceType,
      sourceId: event.sourceId,
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
