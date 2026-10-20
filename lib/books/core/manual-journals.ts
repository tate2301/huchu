import type { Prisma, PrismaClient } from "@prisma/client";

import { reverseJournalEntry, JournalReversalError } from "@/lib/accounting/journals";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { moneyLimits } from "./approvals";
import { auditActor, canDo, tierOf, type BooksActor } from "./can-do";
import { nextJournalNumber } from "./numbering";
import { rateFor } from "./rate";

/**
 * Manual journals (books-final §4.14): Draft → Post → Posted, or Draft →
 * Submit → To approve → Approve and post when the journal is over the second
 * person limit (D10 `journalSecondOver`); Posted → Reverse with a mirror.
 *
 * - A draft carries no number (D8): it holds a placeholder below zero, and
 *   the gapless journal number is given when it posts.
 * - "To approve" is a draft whose last `ApprovalAction` (MANUAL_JOURNAL, D9)
 *   is a SUBMIT: the approver is read from the APPROVE row, so no new column.
 * - System journals (from documents) are never reversed here: they are undone
 *   from their document.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class JournalRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "JournalRefused";
  }
}

export type JournalLineInput = { accountId: string; costCenterId?: string | null; debit: number; credit: number; memo?: string | null };

export type ManualJournalInput = {
  /** "2026-10-18". */
  date: string;
  memo: string;
  /** The currency the lines are typed in; the base currency when left out. */
  currency?: string | null;
  lines: JournalLineInput[];
  attachment?: { url: string; name: string; contentType: string; size: number } | null;
  /** Post now (or send for approval when over the limit); a draft otherwise. */
  post: boolean;
  periodOverrideReason?: string | null;
};

export type JournalOutcome = { id: string; state: "draft" | "to-approve" | "posted"; ref: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "JE-0421"; a draft's placeholder (zero or below) has no number yet. */
export const journalNumber = (entryNumber: number): string | null => (entryNumber > 0 ? `JE-${String(entryNumber).padStart(4, "0")}` : null);

/** The amount a journal moves: its debits (which equal its credits). */
export const journalAmount = (lines: Array<{ debit: number; credit: number }>) => round2(Math.max(lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0)));

/** Lines as the ledger takes them: each one side only, more than nothing, and the two sides equal. Pure. */
export function checkLines(lines: JournalLineInput[]): string | null {
  const used = lines.filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
  if (used.length < 2) return "A journal needs two lines or more, each with an account and an amount.";
  if (used.some((line) => line.debit < 0 || line.credit < 0)) return "Amounts are never below zero: put a credit in the Credit column.";
  if (used.some((line) => line.debit > 0 && line.credit > 0)) return "Each line is a debit or a credit, not both.";
  const debit = round2(used.reduce((sum, line) => sum + line.debit, 0));
  const credit = round2(used.reduce((sum, line) => sum + line.credit, 0));
  if (Math.abs(debit - credit) > 0.005) return `The debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) must be equal.`;
  return null;
}

/** Does this journal need a second person before it posts? The owner never does. Pure. */
export function needsSecondPerson(actor: Pick<BooksActor, "role" | "signInAs">, amount: number, limit: number): boolean {
  if (tierOf(actor) === "owner") return false;
  return limit > 0 && amount > limit;
}

/** The journals waiting for a second person: each draft's last approval row, when it is a SUBMIT. */
export async function journalsToApprove(db: Db, companyId: string): Promise<Map<string, { submittedById: string; at: Date }>> {
  const rows = await db.approvalAction.findMany({
    where: { companyId, entityType: "MANUAL_JOURNAL" },
    select: { entityId: true, action: true, actedById: true, actedAt: true },
    orderBy: { actedAt: "asc" },
  });
  const last = new Map<string, { action: string; actedById: string; at: Date }>();
  for (const row of rows) last.set(row.entityId, { action: row.action, actedById: row.actedById, at: row.actedAt });
  const waiting = new Map<string, { submittedById: string; at: Date }>();
  for (const [id, row] of last) if (row.action === "SUBMIT") waiting.set(id, { submittedById: row.actedById, at: row.at });
  if (waiting.size === 0) return waiting;
  // Only drafts still wait: a posted or deleted journal is not to approve.
  const drafts = await db.journalEntry.findMany({ where: { companyId, id: { in: [...waiting.keys()] }, status: "DRAFT" }, select: { id: true } });
  const still = new Set(drafts.map((draft) => draft.id));
  for (const id of [...waiting.keys()]) if (!still.has(id)) waiting.delete(id);
  return waiting;
}

/** The placeholder a draft holds instead of a number: below every other placeholder. */
async function draftPlaceholder(db: Db, companyId: string): Promise<number> {
  const lowest = await db.journalEntry.aggregate({ where: { companyId }, _min: { entryNumber: true } });
  const min = lowest._min.entryNumber ?? 0;
  return Math.min(min, 0) - 1;
}

async function checkAccounts(companyId: string, lines: JournalLineInput[]) {
  const accountIds = [...new Set(lines.map((line) => line.accountId))];
  const accounts = await prisma.chartOfAccount.findMany({ where: { companyId, id: { in: accountIds } }, select: { id: true, nodeType: true, isActive: true } });
  const byId = new Map(accounts.map((account) => [account.id, account]));
  for (const id of accountIds) {
    const account = byId.get(id);
    if (!account) throw new JournalRefused("One of the accounts is not in this workspace's chart.");
    if (!account.isActive || account.nodeType !== "LEDGER") throw new JournalRefused("Journals post to active accounts only, not to a heading.");
  }
  const centreIds = [...new Set(lines.map((line) => line.costCenterId).filter((id): id is string => Boolean(id)))];
  if (centreIds.length) {
    const found = await prisma.costCenter.count({ where: { companyId, id: { in: centreIds } } });
    if (found !== centreIds.length) throw new JournalRefused("One of the cost centres is not in this workspace.");
  }
}

/** The lines in the base currency, with the typed currency kept beside each (D4). */
async function baseLines(companyId: string, input: Pick<ManualJournalInput, "currency" | "lines" | "date">) {
  const frozen = await rateFor(companyId, input.currency ?? null, new Date(`${input.date}T00:00:00.000Z`));
  const foreign = frozen.currency !== frozen.baseCurrency;
  const used = input.lines.filter((line) => line.accountId && (line.debit > 0 || line.credit > 0));
  return used.map((line) => ({
    accountId: line.accountId,
    costCenterId: line.costCenterId || undefined,
    debit: round2(line.debit / frozen.rate),
    credit: round2(line.credit / frozen.rate),
    memo: line.memo?.trim() || undefined,
    ...(foreign ? { currency: frozen.currency, amountInCurrency: round2(line.debit || line.credit), exchangeRate: frozen.rate } : {}),
  }));
}

async function audit(db: Db, actor: BooksActor, entryId: string, verb: string, reason: string | null, payload: Record<string, unknown>) {
  await writePlatformAuditEvent(
    { companyId: actor.companyId, actorId: actor.userId, eventType: `books.journal.${verb}`, entityType: "JournalEntry", entityId: entryId, reason: reason ?? undefined, payload: { by: auditActor(actor), at: new Date().toISOString(), ...payload } },
    db as Prisma.TransactionClient,
  );
}

async function approvalRow(db: Db, actor: BooksActor, entryId: string, action: "CREATE" | "SUBMIT" | "APPROVE" | "REJECT", from: string, to: string, note?: string | null) {
  await db.approvalAction.create({ data: { companyId: actor.companyId, entityType: "MANUAL_JOURNAL", entityId: entryId, action, fromStatus: from, toStatus: to, note: note ?? undefined, actedById: actor.userId } });
}

/** Post a draft inside a transaction: the period's lock, the gapless number, who and when. */
async function postDraft(tx: Prisma.TransactionClient, actor: BooksActor, entry: { id: string; entryDate: Date; entryNumber: number; description: string }, overrideReason: string | null | undefined) {
  const decision = await resolvePostingPeriod({ companyId: actor.companyId, entryDate: entry.entryDate, actorRole: actor.role, overrideReason });
  if (!decision.allowed) throw new JournalRefused(decision.message ?? "That month is locked.", decision.code === "PERIOD_OVERRIDE_REASON_REQUIRED" ? 409 : 400);
  const now = new Date();
  const entryNumber = entry.entryNumber > 0 ? entry.entryNumber : await nextJournalNumber(tx, actor.companyId);
  await tx.journalEntry.update({
    where: { id: entry.id },
    data: {
      status: "POSTED",
      entryNumber,
      postedAt: now,
      postedById: actor.userId,
      periodId: decision.period.id,
      periodOverrideReason: decision.requiresOverride ? decision.overrideReason : undefined,
      periodOverrideById: decision.requiresOverride ? actor.userId : undefined,
      periodOverrideAt: decision.requiresOverride ? now : undefined,
    },
  });
  if (decision.requiresOverride) await audit(tx, actor, entry.id, "posted-into-closed-month", decision.overrideReason ?? null, { number: journalNumber(entryNumber), memo: entry.description });
  return journalNumber(entryNumber);
}

/** New journal: kept as a draft, posted, or sent for a second person when it is over the limit. */
export async function saveManualJournal(actor: BooksActor, input: ManualJournalInput): Promise<JournalOutcome> {
  const problem = checkLines(input.lines);
  if (problem) throw new JournalRefused(problem);
  if (!input.memo.trim()) throw new JournalRefused("Say what the journal is for in the memo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new JournalRefused("Choose the journal's date.");
  const created = canDo(actor, "draft.create", { kind: "journal" });
  if (!created.allowed) throw new JournalRefused(created.reason, 403);
  await checkAccounts(actor.companyId, input.lines);
  const lines = await baseLines(actor.companyId, input);
  const amount = journalAmount(lines);
  const limits = await moneyLimits(actor.companyId);
  const second = input.post && needsSecondPerson(actor, amount, limits.journalSecondOver);
  if (input.post && !second) {
    const decision = canDo(actor, "journal.post", { kind: "journal" });
    if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  }
  const entryDate = new Date(`${input.date}T00:00:00.000Z`);
  return prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.create({
      data: {
        companyId: actor.companyId,
        entryNumber: await draftPlaceholder(tx, actor.companyId),
        entryDate,
        description: input.memo.trim(),
        status: "DRAFT",
        sourceType: "MANUAL",
        createdById: actor.userId,
        lines: { create: lines },
      },
      select: { id: true, entryDate: true, entryNumber: true, description: true },
    });
    if (input.attachment) {
      await tx.retailAttachment.create({ data: { companyId: actor.companyId, entityType: "JournalEntry", entityId: entry.id, kind: "RECEIPT", url: input.attachment.url, name: input.attachment.name, contentType: input.attachment.contentType, size: input.attachment.size, addedById: actor.userId } });
    }
    if (!input.post) return { id: entry.id, state: "draft" as const, ref: null };
    if (second) {
      await approvalRow(tx, actor, entry.id, "SUBMIT", "DRAFT", "TO_APPROVE", `Over ${limits.journalSecondOver.toFixed(2)}: a second person approves it.`);
      return { id: entry.id, state: "to-approve" as const, ref: null };
    }
    const ref = await postDraft(tx, actor, entry, input.periodOverrideReason);
    return { id: entry.id, state: "posted" as const, ref };
  });
}

async function loadManual(companyId: string, id: string) {
  const entry = await prisma.journalEntry.findFirst({ where: { id, companyId }, select: { id: true, entryDate: true, entryNumber: true, description: true, status: true, sourceType: true, createdById: true, reversedAt: true, lines: { select: { debit: true, credit: true } } } });
  if (!entry) throw new JournalRefused("That journal is not here any more.", 404);
  return entry;
}

/** Post a draft: straight away, or To approve when it is over the limit and the poster is not the owner. */
export async function postManualJournal(actor: BooksActor, id: string, overrideReason?: string | null): Promise<JournalOutcome> {
  const entry = await loadManual(actor.companyId, id);
  if (entry.status !== "DRAFT") throw new JournalRefused("Only a draft can be posted.");
  const waiting = (await journalsToApprove(prisma, actor.companyId)).get(id);
  if (waiting) return approveManualJournal(actor, id, overrideReason);
  const amount = journalAmount(entry.lines);
  const limits = await moneyLimits(actor.companyId);
  if (needsSecondPerson(actor, amount, limits.journalSecondOver)) {
    const decision = canDo(actor, "draft.edit", { kind: "journal", ownerId: entry.createdById });
    if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
    await approvalRow(prisma, actor, id, "SUBMIT", "DRAFT", "TO_APPROVE", `Over ${limits.journalSecondOver.toFixed(2)}: a second person approves it.`);
    return { id, state: "to-approve", ref: null };
  }
  const decision = canDo(actor, "journal.post", { kind: "journal" });
  if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  const ref = await prisma.$transaction((tx) => postDraft(tx, actor, entry, overrideReason));
  return { id, state: "posted", ref };
}

/** Approve and post: another person with journal rights, never the one who sent it. */
export async function approveManualJournal(actor: BooksActor, id: string, overrideReason?: string | null): Promise<JournalOutcome> {
  const entry = await loadManual(actor.companyId, id);
  const waiting = (await journalsToApprove(prisma, actor.companyId)).get(id);
  if (entry.status !== "DRAFT" || !waiting) throw new JournalRefused("This journal is not waiting for approval.");
  if (waiting.submittedById === actor.userId || entry.createdById === actor.userId) throw new JournalRefused("Somebody else has to approve your own journal.", 403);
  const decision = canDo(actor, "journal.post", { kind: "journal" });
  if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  const ref = await prisma.$transaction(async (tx) => {
    const number = await postDraft(tx, actor, entry, overrideReason);
    await approvalRow(tx, actor, id, "APPROVE", "TO_APPROVE", "POSTED");
    return number;
  });
  return { id, state: "posted", ref };
}

/** Withdraw a journal waiting for approval (its maker) or send it back (an approver): a draft again. */
export async function withdrawManualJournal(actor: BooksActor, id: string, note?: string | null): Promise<JournalOutcome> {
  const entry = await loadManual(actor.companyId, id);
  const waiting = (await journalsToApprove(prisma, actor.companyId)).get(id);
  if (entry.status !== "DRAFT" || !waiting) throw new JournalRefused("This journal is not waiting for approval.");
  const own = waiting.submittedById === actor.userId || entry.createdById === actor.userId;
  const decision = own ? canDo(actor, "draft.edit", { kind: "journal", ownerId: entry.createdById }) : canDo(actor, "journal.post", { kind: "journal" });
  if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  await approvalRow(prisma, actor, id, "REJECT", "TO_APPROVE", "DRAFT", note ?? (own ? "Withdrawn" : "Sent back"));
  return { id, state: "draft", ref: null };
}

/** Delete a draft: free, it carries no number (§4.1 rule 5). */
export async function deleteDraftJournal(actor: BooksActor, id: string): Promise<void> {
  const entry = await loadManual(actor.companyId, id);
  if (entry.status !== "DRAFT") throw new JournalRefused("A posted journal is reversed, not deleted.");
  const decision = canDo(actor, "draft.delete", { kind: "journal", ownerId: entry.createdById });
  if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  await prisma.$transaction(async (tx) => {
    await tx.retailAttachment.deleteMany({ where: { companyId: actor.companyId, entityType: "JournalEntry", entityId: id } });
    await tx.journalEntry.delete({ where: { id } });
  });
}

/**
 * Reverse a posted manual journal: the mirror dated today (or the date
 * given), the original stamped `reversedAt`, and an audit event. The P4 rule
 * holds: the owner, or a manager or accountant with the void grant.
 */
export async function reverseManualJournal(actor: BooksActor, id: string, input: { reason?: string | null; date?: Date | null; periodOverrideReason?: string | null } = {}): Promise<JournalOutcome> {
  const entry = await loadManual(actor.companyId, id);
  if (entry.sourceType !== "MANUAL") throw new JournalRefused("This journal came from a document: undo it from that document.");
  const decision = canDo(actor, "void", { kind: "journal" });
  if (!decision.allowed) throw new JournalRefused(decision.reason, 403);
  const reason = input.reason?.trim() || null;
  try {
    const reversal = await prisma.$transaction(async (tx) => {
      const mirror = await reverseJournalEntry(tx, { companyId: actor.companyId, entryId: id, actorId: actor.userId, actorRole: actor.role, reversalDate: input.date ?? undefined, reason, periodOverrideReason: input.periodOverrideReason });
      await audit(tx, actor, id, "reversed", reason, { number: journalNumber(entry.entryNumber), memo: entry.description, mirror: journalNumber(mirror.entryNumber), amount: journalAmount(entry.lines) });
      return mirror;
    });
    return { id: reversal.id, state: "posted", ref: journalNumber(reversal.entryNumber) };
  } catch (error) {
    if (error instanceof JournalReversalError) throw new JournalRefused(error.message, error.status);
    throw error;
  }
}
