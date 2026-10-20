import type { AccountingSourceType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { moneyLedgerAccount } from "./post-money";

/**
 * The accounts an event names, filled in for one written before it named
 * them: a CRM requisition's money posts to the account it was paid from
 * (`CrmRequisition.bankAccountId`), not a fixed 1010, so an event re-queued
 * from the old IGNORED captures (D14) or captured before the core gets its
 * money account here, as the drain posts it.
 */

const REQUISITION_MONEY: ReadonlySet<AccountingSourceType> = new Set([
  "CRM_REQUISITION_DISBURSEMENT",
  "CRM_REQUISITION_REFUND",
  "CRM_REQUISITION_TOPUP",
]);

type EventRow = { companyId: string; sourceType: AccountingSourceType | null; sourceId: string | null };

export async function withEventAccounts(event: EventRow, payload: Record<string, unknown> | null): Promise<Record<string, unknown> | null> {
  if (!event.sourceType || !event.sourceId || !REQUISITION_MONEY.has(event.sourceType)) return payload;
  const accounts = (payload?.accounts && typeof payload.accounts === "object" ? payload.accounts : {}) as Record<string, unknown>;
  if (typeof accounts.moneyAccount === "string" && accounts.moneyAccount) return payload;
  const requisition = await prisma.crmRequisition.findFirst({
    where: { id: event.sourceId, companyId: event.companyId },
    select: { bankAccountId: true },
  });
  const moneyAccount = await moneyLedgerAccount(event.companyId, requisition?.bankAccountId ?? null);
  if (!moneyAccount) return payload;
  return { ...(payload ?? {}), accounts: { ...accounts, moneyAccount } };
}
