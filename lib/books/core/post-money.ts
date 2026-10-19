import type { AccountingSourceType, Prisma, PrismaClient } from "@prisma/client";

import { createJournalEntryFromSource, type PostingContext, type PostingResult } from "@/lib/accounting/posting";
import { toNumberOrZero, type MoneyLike } from "@/lib/money";
import { prisma } from "@/lib/prisma";

/**
 * `postMoney`: the one way a module puts money on the ledger (books-final
 * §1.1). It writes the integration event as PENDING and posts it now through
 * the posting engine (`createJournalEntryFromSource`, idempotent on the
 * source), which syncs the sub-ledger for every type with a party. A missing
 * rule or account leaves the event FAILED (or PENDING, for a missing account)
 * with its reason, for the drain and Needs posting; it is never dropped.
 *
 * When the money moved through one of the workspace's money accounts
 * (`money.bankAccountId`), that account's ledger account is what the rule's
 * "money account" line posts to, rather than a fixed 1010, and a bank
 * transaction is written for it once the entry has posted.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type EventAccountKey = "moneyAccount" | "expenseAccount" | "changeAccount";

export type MoneyEvent = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  sourceSubtype?: string | null;
  date: Date;
  description: string;
  amount: MoneyLike;
  netAmount?: MoneyLike;
  taxAmount?: MoneyLike;
  grossAmount?: MoneyLike;
  deductionsAmount?: MoneyLike;
  allowancesAmount?: MoneyLike;
  currency?: string | null;
  /** The rate frozen on the document, kept with the event until the ledger keeps currency (D3, D4). */
  rate?: MoneyLike;
  costCenterId?: string | null;
  siteId?: string | null;
  registerCode?: string | null;
  /** Ledger accounts the rule's EVENT_ACCOUNT lines post to, by key. */
  accounts?: Partial<Record<EventAccountKey, string | null>>;
  /** The money account it went through, and which way. */
  money?: { bankAccountId?: string | null; direction: "IN" | "OUT"; reference?: string | null };
  invertDirection?: boolean;
  payload?: Record<string, unknown>;
  payments?: PostingContext["payments"];
  inventory?: PostingContext["inventory"];
  statutory?: PostingContext["statutory"];
  actor: { userId: string; role?: string | null };
  periodOverrideReason?: string | null;
  /** A shop that posts at the end of the day defers its retail events; true posts now regardless. */
  postNow?: boolean;
};

export type PostMoneyResult = PostingResult & { bankTransactionId?: string };

/**
 * The ledger account behind a money account: its own (`BankAccount.ledgerAccountId`),
 * else the workspace's default money account's, else 1010 Operating bank.
 */
export async function moneyLedgerAccount(companyId: string, bankAccountId: string | null | undefined, db: Db = prisma): Promise<string | null> {
  if (bankAccountId) {
    const bank = await db.bankAccount.findFirst({ where: { id: bankAccountId, companyId }, select: { ledgerAccountId: true } });
    if (bank?.ledgerAccountId) return bank.ledgerAccountId;
  }
  const settings = await db.accountingSettings.findUnique({
    where: { companyId },
    select: { defaultBankAccount: { select: { ledgerAccountId: true } } },
  });
  if (settings?.defaultBankAccount?.ledgerAccountId) return settings.defaultBankAccount.ledgerAccountId;
  const bank = await db.chartOfAccount.findFirst({ where: { companyId, code: "1010", nodeType: "LEDGER", isActive: true }, select: { id: true } });
  return bank?.id ?? null;
}

export async function postMoney(db: Db, event: MoneyEvent): Promise<PostMoneyResult> {
  const accounts: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.accounts ?? {})) if (value) accounts[key] = value;
  if (event.money && !accounts.moneyAccount) {
    const ledger = await moneyLedgerAccount(event.companyId, event.money.bankAccountId, db);
    if (ledger) accounts.moneyAccount = ledger;
  }

  const payload: Record<string, unknown> = {
    ...(event.payload ?? {}),
    ...(Object.keys(accounts).length ? { accounts } : {}),
    ...(event.money?.bankAccountId ? { bankAccountId: event.money.bankAccountId, moneyDirection: event.money.direction } : {}),
    ...(event.rate !== undefined && event.rate !== null ? { exchangeRate: toNumberOrZero(event.rate) } : {}),
  };

  const result = await createJournalEntryFromSource(
    {
      companyId: event.companyId,
      sourceType: event.sourceType,
      sourceId: event.sourceId,
      sourceSubtype: event.sourceSubtype ?? null,
      siteId: event.siteId ?? null,
      registerCode: event.registerCode ?? null,
      entryDate: event.date,
      description: event.description,
      createdById: event.actor.userId,
      actorRole: event.actor.role ?? undefined,
      periodOverrideReason: event.periodOverrideReason ?? undefined,
      amount: event.amount,
      netAmount: event.netAmount ?? event.amount,
      taxAmount: event.taxAmount ?? 0,
      grossAmount: event.grossAmount ?? event.amount,
      deductionsAmount: event.deductionsAmount,
      allowancesAmount: event.allowancesAmount,
      statutory: event.statutory,
      currency: event.currency ?? undefined,
      costCenterId: event.costCenterId ?? undefined,
      invertDirection: event.invertDirection,
      payload,
      payments: event.payments,
      inventory: event.inventory,
    },
    db,
    { postNow: event.postNow },
  );

  if (result.entryId && event.money?.bankAccountId) {
    const bankTransactionId = await recordBankMove(db, event);
    return { ...result, bankTransactionId };
  }
  return result;
}

/** The bank side of money that moved through a money account: once per source. */
async function recordBankMove(db: Db, event: MoneyEvent): Promise<string | undefined> {
  if (!event.money?.bankAccountId) return undefined;
  const existing = await db.bankTransaction.findFirst({
    where: { companyId: event.companyId, sourceType: event.sourceType, sourceId: event.sourceId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await db.bankTransaction.create({
    data: {
      companyId: event.companyId,
      bankAccountId: event.money.bankAccountId,
      txnDate: event.date,
      description: event.description,
      reference: event.money.reference ?? undefined,
      amount: toNumberOrZero(event.amount),
      direction: event.money.direction === "IN" ? "DEBIT" : "CREDIT",
      sourceType: event.sourceType,
      sourceId: event.sourceId,
    },
    select: { id: true },
  });
  return created.id;
}
