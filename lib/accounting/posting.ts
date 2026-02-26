import type { AccountingSourceType, PostingBasis, PostingRuleLine } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { buildAccountingEventKey } from "@/lib/accounting/integration-keys";
import { getNextEntryNumber, toMoney } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { syncPaymentLedgerEntryForSource } from "@/lib/accounting/payment-ledger";
import { ensureLedgerAccountIds } from "@/lib/accounting/chart-of-accounts";

const BALANCE_TOLERANCE = 0.01;
const BASE_RETRY_DELAY_MINUTES = 5;
const MAX_RETRY_DELAY_MINUTES = 24 * 60;

export type PostingContext = {
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
  actorRole?: string | null;
  periodOverrideReason?: string | null;
  invertDirection?: boolean;
};

type PostingResult = {
  entryId?: string;
  skipped?: boolean;
  error?: string;
  code?: string;
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

function nextRetryDate(attemptCount: number) {
  const backoffMultiplier = 2 ** Math.max(attemptCount - 1, 0);
  const delayMinutes = Math.min(BASE_RETRY_DELAY_MINUTES * backoffMultiplier, MAX_RETRY_DELAY_MINUTES);
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function truncateErrorMessage(message: string) {
  return message.length > 1000 ? message.slice(0, 1000) : message;
}

async function createOrRefreshIntegrationEvent(context: PostingContext) {
  const eventKey = buildAccountingEventKey({
    companyId: context.companyId,
    sourceDomain: "accounting",
    sourceAction: "auto-post",
    sourceType: context.sourceType,
    sourceId: context.sourceId,
    fallback: `${context.entryDate.toISOString()}:${context.description}`,
  });

  return prisma.accountingIntegrationEvent.upsert({
    where: { eventKey },
    update: {
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? null,
      entryDate: context.entryDate,
      description: context.description,
      amount: context.amount,
      netAmount: context.netAmount ?? null,
      taxAmount: context.taxAmount ?? null,
      grossAmount: context.grossAmount ?? null,
      deductionsAmount: context.deductionsAmount ?? null,
      allowancesAmount: context.allowancesAmount ?? null,
      currency: context.currency ?? null,
      createdById: context.createdById,
      payloadJson: JSON.stringify(context),
      status: "PENDING",
      lastError: null,
    },
    create: {
      eventKey,
      companyId: context.companyId,
      sourceDomain: "accounting",
      sourceAction: "auto-post",
      sourceType: context.sourceType,
      sourceId: context.sourceId ?? null,
      entryDate: context.entryDate,
      description: context.description,
      amount: context.amount,
      netAmount: context.netAmount ?? null,
      taxAmount: context.taxAmount ?? null,
      grossAmount: context.grossAmount ?? null,
      deductionsAmount: context.deductionsAmount ?? null,
      allowancesAmount: context.allowancesAmount ?? null,
      currency: context.currency ?? null,
      createdById: context.createdById,
      payloadJson: JSON.stringify(context),
      status: "PENDING",
    },
    select: { id: true, attemptCount: true },
  });
}

async function markIntegrationEventPosted(eventId: string, entryId: string) {
  await prisma.accountingIntegrationEvent.update({
    where: { id: eventId },
    data: {
      status: "POSTED",
      journalEntryId: entryId,
      nextRetryAt: null,
      lastError: null,
    },
  });
}

async function markIntegrationEventFailure(eventId: string, attemptCount: number, error: string) {
  await prisma.accountingIntegrationEvent.update({
    where: { id: eventId },
    data: {
      status: "FAILED",
      attemptCount: { increment: 1 },
      lastError: truncateErrorMessage(error),
      nextRetryAt: nextRetryDate(attemptCount + 1),
    },
  });
}

export async function createJournalEntryFromSource(context: PostingContext): Promise<PostingResult> {
  const integrationEvent = await createOrRefreshIntegrationEvent(context);

  try {
    await ensureAccountingDefaults(context.companyId);

    if (context.sourceId) {
      const existing = await prisma.journalEntry.findFirst({
        where: {
          companyId: context.companyId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
        },
        select: { id: true },
      });
      if (existing) {
        await markIntegrationEventPosted(integrationEvent.id, existing.id);
        await syncPaymentLedgerEntryForSource({
          companyId: context.companyId,
          sourceType: context.sourceType,
          sourceId: context.sourceId,
          journalEntryId: existing.id,
        });
        return { entryId: existing.id, skipped: true };
      }
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
      const error = `Posting rule missing for source type ${context.sourceType}`;
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return { error, code: "POSTING_RULE_MISSING" };
    }

    const nonLedgerAccounts = await ensureLedgerAccountIds(
      context.companyId,
      rule.lines.map((line) => line.accountId),
    );
    if (nonLedgerAccounts.length > 0) {
      const error = "Posting rule contains inactive or non-ledger accounts";
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return { error, code: "POSTING_RULE_INVALID_ACCOUNTS" };
    }

    const lines = rule.lines.map((line) => {
      const amount = resolveLineAmount(line, context);
      const direction = context.invertDirection
        ? line.direction === "DEBIT"
          ? "CREDIT"
          : "DEBIT"
        : line.direction;
      return {
        accountId: line.accountId,
        debit: direction === "DEBIT" ? amount : 0,
        credit: direction === "CREDIT" ? amount : 0,
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
      const error = `Unbalanced entry (debit ${totals.debit.toFixed(2)} vs credit ${totals.credit.toFixed(2)})`;
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return { error, code: "UNBALANCED_POSTING" };
    }

    const postingPeriod = await resolvePostingPeriod({
      companyId: context.companyId,
      entryDate: context.entryDate,
      actorRole: context.actorRole,
      overrideReason: context.periodOverrideReason,
    });
    if (!postingPeriod.allowed) {
      const error = postingPeriod.message ?? "Posting period is locked";
      await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, error);
      return {
        error,
        code: postingPeriod.code ?? "PERIOD_LOCKED",
      };
    }

    const entryNumber = await getNextEntryNumber(context.companyId);

    const entry = await prisma.journalEntry.create({
      data: {
        companyId: context.companyId,
        entryNumber,
        entryDate: context.entryDate,
        description: context.description,
        status: "POSTED",
        periodId: postingPeriod.period.id,
        sourceType: context.sourceType,
        sourceId: context.sourceId ?? undefined,
        createdById: context.createdById,
        postedById: context.createdById,
        postedAt: new Date(),
        periodOverrideReason: postingPeriod.requiresOverride ? postingPeriod.overrideReason : undefined,
        periodOverrideById: postingPeriod.requiresOverride ? context.createdById : undefined,
        periodOverrideAt: postingPeriod.requiresOverride ? new Date() : undefined,
        lines: {
          create: lines,
        },
      },
      select: { id: true },
    });

    await markIntegrationEventPosted(integrationEvent.id, entry.id);
    await syncPaymentLedgerEntryForSource({
      companyId: context.companyId,
      sourceType: context.sourceType,
      sourceId: context.sourceId,
      journalEntryId: entry.id,
    });
    return { entryId: entry.id };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown posting failure";
    await markIntegrationEventFailure(integrationEvent.id, integrationEvent.attemptCount, errorMessage);
    return { error: errorMessage, code: "POSTING_EXCEPTION" };
  }
}
