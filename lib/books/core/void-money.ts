import type { AccountingSourceType, Prisma } from "@prisma/client";

import { getNextEntryNumber } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, type BooksActor } from "./can-do";

/**
 * `voidMoney`: cancel a posting by posting its mirror (books-final §4.1 rule 3).
 *
 * The original stays POSTED, stamped `voidedAt` / `voidedById`; the mirror is
 * the same source type under `void:<sourceId>`, every debit a credit, linked
 * by `reversalOfEntryId`, dated today, or the first open day when today's
 * month is closed. In the same transaction the sub-ledger line becomes VOIDED
 * and the bank side goes: deleted while unreconciled, else mirrored. An audit
 * event keeps who, why and (for a superuser) the operator.
 *
 * Safe to run twice: a source already voided returns its mirror.
 */

export class VoidRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "VoidRefused";
  }
}

export type VoidMoneyInput = {
  companyId: string;
  sourceType: AccountingSourceType;
  sourceId: string;
  reason: string;
  date?: Date;
  actor: BooksActor;
  /** The audit event's type, "books.write-off.voided"; "books.posting.voided" when not given. */
  eventType?: string;
};

export type VoidMoneyResult = { mirrorEntryId: string; originalEntryId: string; date: Date; already: boolean };

const dayStart = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

/** Today, or the first day of the next open month when today's is closed. */
async function voidDate(companyId: string, wanted: Date): Promise<Date> {
  const period = await prisma.accountingPeriod.findFirst({
    where: { companyId, startDate: { lte: wanted }, endDate: { gte: dayStart(wanted) } },
    select: { status: true },
  });
  if (period?.status !== "CLOSED") return wanted;
  const next = await prisma.accountingPeriod.findFirst({
    where: { companyId, status: "OPEN", startDate: { gt: wanted } },
    orderBy: { startDate: "asc" },
    select: { startDate: true },
  });
  if (!next) throw new VoidRefused("This month is closed and no later month is open, so there is nowhere to date the void. Open next month first.");
  return next.startDate;
}

export async function voidMoney(input: VoidMoneyInput): Promise<VoidMoneyResult> {
  const reason = input.reason.trim();
  if (reason.length < 3) throw new VoidRefused("Say why, in a few words. The reason is kept in the audit trail.", 400);
  const voidKey = `void:${input.sourceId}`;

  const already = await prisma.journalEntry.findFirst({
    where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: voidKey },
    select: { id: true, entryDate: true, reversalOfEntryId: true },
  });
  const original = await prisma.journalEntry.findFirst({
    where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId, status: "POSTED" },
    include: { lines: true },
  });
  if (already) {
    return { mirrorEntryId: already.id, originalEntryId: already.reversalOfEntryId ?? original?.id ?? "", date: already.entryDate, already: true };
  }
  if (!original) throw new VoidRefused("Nothing was posted for this, so there is nothing to void.", 404);
  if (original.reversedAt) throw new VoidRefused("This posting was reversed already.");
  // A closed reconciliation locks its transactions (§4.13): reopen it first.
  const locked = await prisma.bankTransaction.findFirst({
    where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId, reconciliation: { status: "CLOSED" } },
    select: { reconciliation: { select: { statementEndDate: true, endDate: true } } },
  });
  if (locked) {
    const end = locked.reconciliation?.statementEndDate ?? locked.reconciliation?.endDate;
    throw new VoidRefused(`Its bank transaction is in a closed reconciliation${end ? ` to ${end.toISOString().slice(0, 10)}` : ""}. The owner reopens it first.`);
  }

  const date = await voidDate(input.companyId, input.date ?? new Date());
  const period = await resolvePostingPeriod({
    companyId: input.companyId,
    entryDate: date,
    actorRole: input.actor.role,
    overrideReason: reason,
  });
  if (!period.allowed) throw new VoidRefused(period.message ?? "That month is locked.");

  const now = new Date();
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const entryNumber = await getNextEntryNumber(input.companyId, tx);
    const mirror = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryNumber,
        entryDate: date,
        description: `Void: ${original.description} (${reason})`,
        status: "POSTED",
        periodId: period.period.id,
        sourceType: input.sourceType,
        sourceId: voidKey,
        createdById: input.actor.userId,
        postedById: input.actor.userId,
        postedAt: now,
        periodOverrideReason: period.requiresOverride ? period.overrideReason : undefined,
        periodOverrideById: period.requiresOverride ? input.actor.userId : undefined,
        periodOverrideAt: period.requiresOverride ? now : undefined,
        reversalOfEntryId: original.id,
        lines: {
          create: original.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.credit,
            credit: line.debit,
            memo: line.memo ? `Void: ${line.memo}` : "Void",
            costCenterId: line.costCenterId ?? undefined,
            currency: line.currency ?? undefined,
            amountInCurrency: line.amountInCurrency ?? undefined,
            exchangeRate: line.exchangeRate ?? undefined,
          })),
        },
      },
      select: { id: true },
    });
    await tx.journalEntry.update({ where: { id: original.id }, data: { voidedAt: now, voidedById: input.actor.userId } });

    // The sub-ledger stops counting it: aged debt and balances read POSTED lines only.
    await tx.paymentLedgerEntry.updateMany({
      where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId },
      data: { status: "VOIDED" },
    });

    // The bank side: gone while nobody has reconciled it, mirrored once somebody has.
    const bank = await tx.bankTransaction.findMany({
      where: { companyId: input.companyId, sourceType: input.sourceType, sourceId: input.sourceId },
    });
    for (const row of bank) {
      if (!row.reconciliationId && !row.reconciledAt) {
        await tx.bankStatementLine.updateMany({ where: { matchedTransactionId: row.id }, data: { matchedTransactionId: null } });
        await tx.bankTransaction.delete({ where: { id: row.id } });
      } else {
        await tx.bankTransaction.create({
          data: {
            companyId: input.companyId,
            bankAccountId: row.bankAccountId,
            txnDate: date,
            description: `Void: ${row.description}`,
            reference: row.reference,
            amount: row.amount,
            direction: row.direction === "DEBIT" ? "CREDIT" : "DEBIT",
            sourceType: input.sourceType,
            sourceId: voidKey,
          },
        });
      }
    }

    await writePlatformAuditEvent(
      {
        companyId: input.companyId,
        actorId: input.actor.userId,
        eventType: input.eventType ?? "books.posting.voided",
        entityType: input.sourceType,
        entityId: input.sourceId,
        reason,
        payload: { by: auditActor(input.actor), originalEntryId: original.id, mirrorEntryId: mirror.id, date: date.toISOString(), bankTransactions: bank.length },
      },
      tx,
    );
    return { mirrorEntryId: mirror.id, originalEntryId: original.id, date, already: false };
  });
}

/**
 * The void markers on a pair posted another way (a rule re-posted inverted
 * under `void:<id>`, as Books' invoice and payment voids do): the original is
 * stamped void, and the mirror points at it, so Journals' Voided tab and the
 * reports read one convention.
 */
export async function markVoided(originalEntryId: string, mirrorEntryId: string, userId: string, at = new Date()) {
  await prisma.journalEntry.updateMany({ where: { id: originalEntryId, voidedAt: null }, data: { voidedAt: at, voidedById: userId } });
  await prisma.journalEntry.updateMany({ where: { id: mirrorEntryId, reversalOfEntryId: null }, data: { reversalOfEntryId: originalEntryId } });
}
