/**
 * Reversing a posted journal, and naming a posting that replaces another.
 *
 * A posted entry is a fact about the books and stays one. Reversing it writes
 * a second, mirror entry — every debit a credit, every credit a debit — and
 * links the two, so the pair nets to nothing and both remain on the record.
 *
 * ── Why the original stays POSTED ──────────────────────────────────────────
 *
 * The reverse route used to mark the original REVERSED and post the mirror as
 * POSTED. Every ledger report — the trial balance, the general ledger, the
 * financial statements, the period close — counts POSTED entries only, so a
 * reversal removed the original *and* added its mirror: the accounts moved by
 * twice the amount, the wrong way, and the books still "balanced" because each
 * entry balanced on its own. The period-reopen reversal in `closing.ts` had
 * already done it the way the reports expect: the original stays POSTED and is
 * stamped `reversedAt` / `reversedById`, and the mirror carries
 * `reversalOfEntryId`. That is the one convention now, and "reversed" is read
 * off `reversedAt`, not off the status.
 */
import type { Prisma } from "@prisma/client";

import { getNextEntryNumber } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";

type Tx = Prisma.TransactionClient;

/** A refusal the caller can hand straight back: what went wrong, and its HTTP status. */
export class JournalReversalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "JournalReversalError";
  }
}

export type ReverseJournalInput = {
  companyId: string;
  entryId: string;
  actorId: string;
  actorRole?: string | null;
  /** When the reversal is dated. Defaults to now: a correction is booked when it is made. */
  reversalDate?: Date;
  /** Why, for the audit trail. Printed on the mirror's description. */
  reason?: string | null;
  periodOverrideReason?: string | null;
};

/**
 * Post the mirror of a posted entry, inside the caller's transaction.
 *
 * Refuses an entry that is not posted, one already reversed, and a reversal
 * date in a locked period. Everything is read and numbered through `tx`, so a
 * caller that goes on to post again in the same transaction — an invoice edit
 * does — sees this entry and numbers after it.
 */
export async function reverseJournalEntry(tx: Tx, input: ReverseJournalInput) {
  const entry = await tx.journalEntry.findUnique({
    where: { id: input.entryId },
    include: { lines: true, reversalEntry: { select: { id: true } } },
  });
  if (!entry || entry.companyId !== input.companyId) {
    throw new JournalReversalError("Journal entry not found", 404);
  }
  if (entry.status !== "POSTED") {
    throw new JournalReversalError("Only posted journal entries can be reversed", 400);
  }
  if (entry.reversalEntry || entry.reversedAt) {
    throw new JournalReversalError("Journal entry is already reversed", 400);
  }

  const reversalDate = input.reversalDate ?? new Date();
  const periodDecision = await resolvePostingPeriod({
    companyId: input.companyId,
    entryDate: reversalDate,
    actorRole: input.actorRole,
    overrideReason: input.periodOverrideReason,
  });
  if (!periodDecision.allowed) {
    throw new JournalReversalError(
      periodDecision.message ?? "Posting period is locked",
      400,
      periodDecision.code ?? "PERIOD_LOCKED",
    );
  }

  const entryNumber = await getNextEntryNumber(input.companyId, tx);
  const reasonSuffix = input.reason?.trim() ? ` (${input.reason.trim()})` : "";
  const now = new Date();

  const reversal = await tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      entryNumber,
      entryDate: reversalDate,
      description: `Reversal of JE-${entry.entryNumber}${reasonSuffix}`,
      status: "POSTED",
      periodId: periodDecision.period.id,
      sourceType: "MANUAL",
      createdById: input.actorId,
      postedById: input.actorId,
      postedAt: now,
      periodOverrideReason: periodDecision.requiresOverride ? periodDecision.overrideReason : undefined,
      periodOverrideById: periodDecision.requiresOverride ? input.actorId : undefined,
      periodOverrideAt: periodDecision.requiresOverride ? now : undefined,
      reversalOfEntryId: entry.id,
      lines: {
        create: entry.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          memo: line.memo ? `Reversal: ${line.memo}` : "Reversal entry",
          costCenterId: line.costCenterId ?? undefined,
        })),
      },
    },
    include: { lines: true },
  });

  // Stamped, not re-statused: see the header. The pair nets to nothing in
  // every report that counts POSTED entries, which is all of them.
  await tx.journalEntry.update({
    where: { id: entry.id },
    data: { reversedById: input.actorId, reversedAt: now },
  });

  return reversal;
}

/**
 * The source id a sales invoice's posting is filed under.
 *
 * Revision 0 is the invoice's own id — what every invoice posted as before an
 * issued invoice could be edited, so nothing on the books is re-keyed. Each
 * edit bumps `SalesInvoice.revision` and posts under a key of its own: the
 * journal source is unique per (companyId, sourceType, sourceId), the
 * reversed entry keeps its claim on the previous key, and the posting engine
 * reads an existing entry under a key as "already posted" and skips.
 */
export function salesInvoicePostingKey(invoice: { id: string; revision: number }): string {
  return invoice.revision > 0 ? `${invoice.id}:revision-${invoice.revision}` : invoice.id;
}
