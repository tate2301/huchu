import { reverseJournalEntry } from "@/lib/accounting/journals";
import { importOpeningBalances } from "@/lib/accounting/closing";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, canDo, type BooksActor } from "./can-do";

/**
 * Opening balances (Settings › Opening balances, Set up the books): posted
 * once as a journal on the day before the books start. Revising them never
 * edits that journal: its mirror is posted and the new balances are posted
 * after it, with an audit event holding the old ones (books-final §4.1).
 */

export class OpeningRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OpeningRefused";
  }
}

export type OpeningLine = { accountId: string; debit: number; credit: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lines that balance, each one side, two at least. Pure. */
export function openingProblem(lines: OpeningLine[]): string | null {
  const used = lines.filter((line) => line.debit > 0 || line.credit > 0);
  if (used.length < 2) return "Opening balances need two accounts or more.";
  if (used.some((line) => line.debit > 0 && line.credit > 0)) return "Each account is a debit or a credit, not both.";
  const debit = round2(used.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(used.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(debit - credit) > 0.005) return `The debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) must be equal.`;
  return null;
}

export async function postOpeningBalances(actor: BooksActor, input: { date: string; lines: OpeningLine[]; reason?: string | null; sourceReference?: string | null }) {
  const decision = canDo(actor, "setup");
  if (!decision.allowed) throw new OpeningRefused(decision.reason, 403);
  const problem = openingProblem(input.lines);
  if (problem) throw new OpeningRefused(problem);
  const previous = await prisma.openingBalanceImport.findMany({ where: { companyId: actor.companyId, journalEntryId: { not: null } }, select: { id: true, journalEntryId: true, effectiveDate: true, totalDebit: true } });
  const live = (await prisma.journalEntry.findMany({ where: { id: { in: previous.map((row) => row.journalEntryId!) }, status: "POSTED", reversedAt: null }, select: { id: true, entryNumber: true, lines: { select: { debit: true, credit: true, account: { select: { code: true } } } } } }));
  if (live.length && !input.reason?.trim()) throw new OpeningRefused("Say why the opening balances change. The old ones are kept in the audit trail.");
  for (const entry of live) {
    await prisma.$transaction(async (tx) => {
      await reverseJournalEntry(tx, { companyId: actor.companyId, entryId: entry.id, actorId: actor.userId, actorRole: actor.role, reversalDate: new Date(`${input.date}T00:00:00.000Z`), reason: `Opening balances revised: ${input.reason!.trim()}`, periodOverrideReason: input.reason });
      await writePlatformAuditEvent(
        {
          companyId: actor.companyId,
          actorId: actor.userId,
          eventType: "books.opening-balances.revised",
          entityType: "JournalEntry",
          entityId: entry.id,
          reason: input.reason!.trim(),
          payload: { number: `JE-${String(entry.entryNumber).padStart(4, "0")}`, by: auditActor(actor), at: new Date().toISOString(), was: entry.lines.map((line) => `${line.account.code} ${line.debit ? `Dr ${line.debit.toFixed(2)}` : `Cr ${line.credit.toFixed(2)}`}`).join(", ") },
        },
        tx,
      );
    });
  }
  return importOpeningBalances({
    companyId: actor.companyId,
    effectiveDate: new Date(`${input.date}T00:00:00.000Z`),
    createdById: actor.userId,
    sourceReference: input.sourceReference ?? (live.length ? "Revised in Books" : "Set up in Books"),
    lines: input.lines.filter((line) => line.debit > 0 || line.credit > 0).map((line) => ({ accountId: line.accountId, debit: round2(line.debit), credit: round2(line.credit) })),
  });
}
