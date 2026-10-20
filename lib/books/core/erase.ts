import type { Prisma } from "@prisma/client";

import { postingWhere, type Postings } from "./undo-docs";

/**
 * Permanent delete's ledger side (books-final §2.5): everything a document
 * posted goes, as if it had never been posted. Its journals (their voids and
 * rounds too, mirrors before what they mirror), its sub-ledger lines, its
 * integration events and its bank transactions; a statement line matched to
 * one of those is open again. Inside the caller's transaction, after the
 * caller has written the snapshot. Reads first, so the snapshot can hold
 * what is about to go.
 */

export type ErasePlan = {
  journals: Array<{ id: string; entryNumber: number; sourceType: string; sourceId: string | null; reversalOfEntryId: string | null; lines: unknown[] }>;
  ledger: unknown[];
  bank: Array<{ id: string; reconciliationId: string | null }>;
  events: Array<{ id: string }>;
};

const sourceIds = (postings: Postings) => postings.flatMap((posting) => posting.ids.flatMap((id) => [id, `void:${id}`]));

function sourceWhere(postings: Postings) {
  return postings.flatMap((posting) =>
    posting.ids.flatMap((id) => [
      { sourceType: posting.sourceType, sourceId: { in: [id, `void:${id}`] } },
      { sourceType: posting.sourceType, sourceId: { startsWith: `${id}:` } },
      { sourceType: posting.sourceType, sourceId: { startsWith: `void:${id}:` } },
    ]),
  );
}

export async function planErase(tx: Prisma.TransactionClient, companyId: string, postings: Postings): Promise<ErasePlan> {
  if (!postings.length || !sourceIds(postings).length) return { journals: [], ledger: [], bank: [], events: [] };
  const where = sourceWhere(postings);
  const [journals, ledger, bank, events] = await Promise.all([
    tx.journalEntry.findMany({ where: postingWhere(companyId, postings), include: { lines: true } }),
    tx.paymentLedgerEntry.findMany({ where: { companyId, OR: where } }),
    tx.bankTransaction.findMany({ where: { companyId, OR: where } }),
    tx.accountingIntegrationEvent.findMany({ where: { companyId, OR: where }, select: { id: true } }),
  ]);
  return { journals, ledger, bank, events };
}

/** Removes what `planErase` found. A journal reversed by a manual reversal takes that mirror with it. */
export async function erase(tx: Prisma.TransactionClient, plan: ErasePlan): Promise<{ journals: number; ledger: number; bank: number; events: number }> {
  const ids = new Set(plan.journals.map((entry) => entry.id));
  const outside = await tx.journalEntry.findMany({ where: { reversalOfEntryId: { in: [...ids] }, id: { notIn: [...ids] } }, select: { id: true } });
  const mirrors = [...plan.journals.filter((entry) => entry.reversalOfEntryId).map((entry) => entry.id), ...outside.map((entry) => entry.id)];
  if (mirrors.length) await tx.journalEntry.deleteMany({ where: { id: { in: mirrors } } });
  const rest = plan.journals.map((entry) => entry.id).filter((id) => !mirrors.includes(id));
  if (rest.length) await tx.journalEntry.deleteMany({ where: { id: { in: rest } } });
  const ledgerIds = (plan.ledger as Array<{ id: string }>).map((row) => row.id);
  if (ledgerIds.length) await tx.paymentLedgerEntry.deleteMany({ where: { id: { in: ledgerIds } } });
  if (plan.events.length) await tx.accountingIntegrationEvent.deleteMany({ where: { id: { in: plan.events.map((row) => row.id) } } });
  if (plan.bank.length) {
    const bankIds = plan.bank.map((row) => row.id);
    await tx.bankStatementLine.updateMany({ where: { matchedTransactionId: { in: bankIds } }, data: { matchedTransactionId: null } });
    await tx.bankTransaction.deleteMany({ where: { id: { in: bankIds } } });
  }
  return { journals: mirrors.length + rest.length, ledger: ledgerIds.length, bank: plan.bank.length, events: plan.events.length };
}
