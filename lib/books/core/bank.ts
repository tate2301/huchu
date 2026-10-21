import { randomUUID } from "node:crypto";

import type { Prisma, PrismaClient } from "@prisma/client";

import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { prisma } from "@/lib/prisma";

import { auditActor, canDo, type BooksActor } from "./can-do";
import { moneyLedgerAccount, postMoney } from "./post-money";
import type { TaxSettings } from "./tax-settings";
import { voidMoney } from "./void-money";

/**
 * Bank and cash (books-final §4.13, §5.8, D15): statement lines that are
 * matched, or excluded with a reason; reconciliations started against a
 * statement's end date and balance, closed when the difference is 0.00 and
 * nothing up to the end date is left to match, reopened only by the owner;
 * and bank entries (a charge, IMTT, interest, a transfer, a tax payment),
 * which post `BANK_TRANSACTION` through the core and are voided like any
 * other posting.
 *
 * A bank transaction's amount and direction read as the bank's statement
 * does: money in is CREDIT, money out DEBIT.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export class BankRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "BankRefused";
  }
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const signed = (row: { amount: number; direction: string }) => (row.direction === "CREDIT" ? row.amount : -row.amount);
const endOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
const day = (date: Date) => date.toISOString().slice(0, 10);

function allow(actor: BooksActor, action: Parameters<typeof canDo>[1]) {
  const decision = canDo(actor, action, { kind: "bank" });
  if (!decision.allowed) throw new BankRefused(decision.reason, 403);
}

function reasonOf(reason: string | null | undefined) {
  const text = (reason ?? "").trim();
  if (text.length < 3) throw new BankRefused("Say why, in a few words. The reason is kept.", 400);
  return text.slice(0, 500);
}

async function lineOf(companyId: string, lineId: string) {
  const line = await prisma.bankStatementLine.findFirst({
    where: { id: lineId, reconciliation: { companyId } },
    include: { reconciliation: { select: { id: true, status: true, bankAccountId: true } } },
  });
  if (!line) throw new BankRefused("That bank line is not in this workspace.", 404);
  return line;
}

const closedWords = "It is in a closed reconciliation: the owner reopens it first.";

// ── Statement lines ──────────────────────────────────────────────────────────

/** Exclude a line from matching, with who and why (D15). */
export async function excludeLine(actor: BooksActor, lineId: string, reason: string, at = new Date()) {
  allow(actor, "bank.match");
  const why = reasonOf(reason);
  const line = await lineOf(actor.companyId, lineId);
  if (line.reconciliation.status === "CLOSED") throw new BankRefused(closedWords);
  if (line.matchedTransactionId) throw new BankRefused("That line is matched. Unmatch it first.");
  if (line.excludedAt) return line;
  return prisma.bankStatementLine.update({ where: { id: line.id }, data: { excludedAt: at, excludedById: actor.userId, excludeReason: why } });
}

/** Put an excluded line back in To match. */
export async function includeLine(actor: BooksActor, lineId: string) {
  allow(actor, "bank.match");
  const line = await lineOf(actor.companyId, lineId);
  if (line.reconciliation.status === "CLOSED") throw new BankRefused(closedWords);
  return prisma.bankStatementLine.update({ where: { id: line.id }, data: { excludedAt: null, excludedById: null, excludeReason: null } });
}

/** Unmatch: the line goes back to To match and its transaction is no longer reconciled. Refused in a closed reconciliation. */
export async function unmatchLine(actor: BooksActor, lineId: string) {
  allow(actor, "bank.match");
  const line = await lineOf(actor.companyId, lineId);
  if (line.reconciliation.status === "CLOSED") throw new BankRefused(closedWords);
  if (!line.matchedTransactionId) return line;
  return prisma.$transaction(async (tx) => {
    await tx.bankTransaction.updateMany({ where: { id: line.matchedTransactionId!, companyId: actor.companyId }, data: { reconciliationId: null, reconciledAt: null } });
    return tx.bankStatementLine.update({ where: { id: line.id }, data: { matchedTransactionId: null } });
  });
}

/** Link a line to a transaction already in the books (the same account, way and amount). */
export async function matchLine(actor: BooksActor, lineId: string, transactionId: string, db: Db = prisma) {
  allow(actor, "bank.match");
  const line = await lineOf(actor.companyId, lineId);
  if (line.reconciliation.status === "CLOSED") throw new BankRefused(closedWords);
  if (line.matchedTransactionId) throw new BankRefused("That line is already matched.");
  if (line.excludedAt) throw new BankRefused("That line is excluded. Put it back first.");
  const txn = await db.bankTransaction.findFirst({ where: { id: transactionId, companyId: actor.companyId, bankAccountId: line.reconciliation.bankAccountId } });
  if (!txn) throw new BankRefused("That transaction is not in this account.", 404);
  if (txn.direction !== line.direction || Math.abs(txn.amount - line.amount) >= 0.005) throw new BankRefused("That transaction is for a different amount or the other way.");
  await db.bankTransaction.update({ where: { id: txn.id }, data: { reconciliationId: line.reconciliationId, reconciledAt: new Date() } });
  return db.bankStatementLine.update({ where: { id: line.id }, data: { matchedTransactionId: txn.id } });
}

// ── Reconciliations ──────────────────────────────────────────────────────────

export type ReconciliationSummary = {
  id: string;
  status: "OPEN" | "CLOSED" | "VOIDED";
  bankAccountId: string;
  currency: string;
  statementEndDate: string | null;
  statementBalance: number;
  /** Opening balance and every transaction to the end date. */
  bookBalance: number;
  matched: number;
  toMatch: number;
  excluded: number;
  /** Book transactions to the end date no statement line has: cheques not yet cleared, deposits in transit. */
  outstanding: number;
  /** Excluded lines' net effect on the statement. */
  excludedNet: number;
  /** Statement balance less (book balance less outstanding plus excluded). Closes at 0.00. */
  difference: number;
  canClose: boolean;
  /** Why not, in words. */
  blocker: string | null;
};

/**
 * Start a reconciliation against a statement: its closing date and balance
 * (§5.8.4). The account's open one takes them when there is one, since
 * uploaded lines collect there; one open per account.
 */
export async function startReconciliation(actor: BooksActor, input: { bankAccountId: string; statementEndDate: Date; statementBalance: number }) {
  allow(actor, "bank.match");
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId }, select: { id: true } });
  if (!account) throw new BankRefused("That account is not in this workspace.", 404);
  const end = new Date(`${day(input.statementEndDate)}T00:00:00.000Z`);
  const lastClosed = await prisma.bankReconciliation.findFirst({
    where: { companyId: actor.companyId, bankAccountId: account.id, status: "CLOSED" },
    orderBy: [{ statementEndDate: "desc" }, { endDate: "desc" }],
    select: { statementEndDate: true, endDate: true },
  });
  const closedTo = lastClosed?.statementEndDate ?? lastClosed?.endDate ?? null;
  if (closedTo && end <= closedTo) throw new BankRefused(`This account is reconciled to ${day(closedTo)} already. Choose a later statement.`);
  const open = await prisma.bankReconciliation.findFirst({ where: { companyId: actor.companyId, bankAccountId: account.id, status: "OPEN" }, orderBy: { createdAt: "desc" } });
  if (open) {
    return prisma.bankReconciliation.update({
      where: { id: open.id },
      data: { statementEndDate: end, statementBalance: round2(input.statementBalance), endDate: end > open.endDate ? end : open.endDate },
    });
  }
  const start = closedTo ? new Date(closedTo.getTime() + 86_400_000) : end;
  return prisma.bankReconciliation.create({
    data: { companyId: actor.companyId, bankAccountId: account.id, startDate: start, endDate: end, statementEndDate: end, statementBalance: round2(input.statementBalance), createdById: actor.userId },
  });
}

/** Book balance, matched, unmatched and the difference, as the page shows them (§5.8.4). */
export async function reconciliationSummary(companyId: string, reconciliationId: string, db: Db = prisma): Promise<ReconciliationSummary> {
  const rec = await db.bankReconciliation.findFirst({
    where: { id: reconciliationId, companyId },
    include: { bankAccount: { select: { openingBalance: true, currency: true } } },
  });
  if (!rec) throw new BankRefused("That reconciliation is not in this workspace.", 404);
  const end = rec.statementEndDate ?? rec.endDate;
  const upTo = endOfDay(end);
  const [transactions, lines] = await Promise.all([
    db.bankTransaction.findMany({
      where: { companyId, bankAccountId: rec.bankAccountId, txnDate: { lte: upTo } },
      select: { amount: true, direction: true, reconciledAt: true, matchedStatementLines: { select: { id: true }, take: 1 } },
    }),
    db.bankStatementLine.findMany({
      where: { reconciliationId: rec.id, txnDate: { lte: upTo } },
      select: { amount: true, direction: true, matchedTransactionId: true, excludedAt: true },
    }),
  ]);
  const bookBalance = round2(rec.bankAccount.openingBalance + transactions.reduce((sum, row) => sum + signed(row), 0));
  const outstanding = round2(transactions.filter((row) => row.matchedStatementLines.length === 0 && !row.reconciledAt).reduce((sum, row) => sum + signed(row), 0));
  const excludedLines = lines.filter((line) => line.excludedAt);
  const excludedNet = round2(excludedLines.reduce((sum, line) => sum + signed(line), 0));
  const matched = lines.filter((line) => line.matchedTransactionId).length;
  const toMatch = lines.filter((line) => !line.matchedTransactionId && !line.excludedAt).length;
  const difference = round2(rec.statementBalance - (bookBalance - outstanding + excludedNet));
  const blocker = !rec.statementEndDate
    ? "Enter the statement's closing date and balance."
    : toMatch > 0
      ? `${toMatch === 1 ? "1 line" : `${toMatch} lines`} up to ${day(end)} ${toMatch === 1 ? "is" : "are"} still to match.`
      : Math.abs(difference) >= 0.005
        ? `The difference is ${difference.toFixed(2)}: it closes at 0.00.`
        : null;
  return {
    id: rec.id,
    status: rec.status,
    bankAccountId: rec.bankAccountId,
    currency: rec.bankAccount.currency,
    statementEndDate: rec.statementEndDate ? day(rec.statementEndDate) : null,
    statementBalance: rec.statementBalance,
    bookBalance,
    matched,
    toMatch,
    excluded: excludedLines.length,
    outstanding,
    excludedNet,
    difference,
    canClose: rec.status === "OPEN" && blocker === null,
    blocker: rec.status === "OPEN" ? blocker : null,
  };
}

/**
 * Close: difference 0.00 and nothing up to the end date to match. Its matched
 * transactions are locked to it; lines after the end date move to a new open
 * reconciliation, so the closed one holds exactly its statement.
 */
export async function closeReconciliation(actor: BooksActor, reconciliationId: string, at = new Date()) {
  allow(actor, "reconciliation.close");
  const summary = await reconciliationSummary(actor.companyId, reconciliationId);
  if (summary.status !== "OPEN") throw new BankRefused(summary.status === "CLOSED" ? "It is closed already." : "It is void.");
  if (!summary.canClose) throw new BankRefused(summary.blocker ?? "It cannot close yet.");
  const rec = await prisma.bankReconciliation.findUniqueOrThrow({ where: { id: reconciliationId } });
  const end = rec.statementEndDate!;
  return prisma.$transaction(async (tx) => {
    const later = await tx.bankStatementLine.findMany({ where: { reconciliationId: rec.id, txnDate: { gt: endOfDay(end) } }, select: { id: true, txnDate: true } });
    if (later.length > 0) {
      const dates = later.map((line) => line.txnDate.getTime());
      const next = await tx.bankReconciliation.create({
        data: { companyId: rec.companyId, bankAccountId: rec.bankAccountId, startDate: new Date(Math.min(...dates)), endDate: new Date(Math.max(...dates)), createdById: actor.userId },
      });
      await tx.bankStatementLine.updateMany({ where: { id: { in: later.map((line) => line.id) } }, data: { reconciliationId: next.id } });
      await tx.bankTransaction.updateMany({ where: { reconciliationId: rec.id, matchedStatementLines: { some: { reconciliationId: next.id } } }, data: { reconciliationId: next.id } });
    }
    const matchedIds = (await tx.bankStatementLine.findMany({ where: { reconciliationId: rec.id, matchedTransactionId: { not: null } }, select: { matchedTransactionId: true } })).map((line) => line.matchedTransactionId!);
    await tx.bankTransaction.updateMany({ where: { id: { in: matchedIds } }, data: { reconciliationId: rec.id, reconciledAt: at } });
    const closed = await tx.bankReconciliation.update({ where: { id: rec.id }, data: { status: "CLOSED", closedAt: at, closedById: actor.userId, endDate: end } });
    await writePlatformAuditEvent(
      { companyId: rec.companyId, actorId: actor.userId, eventType: "books.reconciliation.closed", entityType: "BankReconciliation", entityId: rec.id, payload: { by: auditActor(actor), statementEndDate: day(end), statementBalance: rec.statementBalance, bookBalance: summary.bookBalance } },
      tx,
    );
    return closed;
  });
}

/** Reopen, owner only, with a reason: it takes back the lines that moved on at its close. */
export async function reopenReconciliation(actor: BooksActor, reconciliationId: string, reason: string) {
  allow(actor, "reconciliation.reopen");
  const why = reasonOf(reason);
  const rec = await prisma.bankReconciliation.findFirst({ where: { id: reconciliationId, companyId: actor.companyId } });
  if (!rec) throw new BankRefused("That reconciliation is not in this workspace.", 404);
  if (rec.status !== "CLOSED") throw new BankRefused("Only a closed reconciliation can be reopened.");
  const newer = await prisma.bankReconciliation.findFirst({
    where: { companyId: actor.companyId, bankAccountId: rec.bankAccountId, status: "CLOSED", statementEndDate: { gt: rec.statementEndDate ?? rec.endDate } },
    select: { statementEndDate: true },
  });
  if (newer) throw new BankRefused(`A later reconciliation, to ${newer.statementEndDate ? day(newer.statementEndDate) : "a later date"}, is closed. Reopen that one first.`);
  return prisma.$transaction(async (tx) => {
    const open = await tx.bankReconciliation.findMany({ where: { companyId: actor.companyId, bankAccountId: rec.bankAccountId, status: "OPEN" }, select: { id: true, endDate: true } });
    for (const other of open) {
      await tx.bankStatementLine.updateMany({ where: { reconciliationId: other.id }, data: { reconciliationId: rec.id } });
      await tx.bankTransaction.updateMany({ where: { reconciliationId: other.id }, data: { reconciliationId: rec.id } });
      await tx.bankReconciliation.delete({ where: { id: other.id } });
    }
    const latest = open.reduce((max, other) => (other.endDate > max ? other.endDate : max), rec.endDate);
    const reopened = await tx.bankReconciliation.update({ where: { id: rec.id }, data: { status: "OPEN", closedAt: null, closedById: null, endDate: latest } });
    await writePlatformAuditEvent(
      { companyId: rec.companyId, actorId: actor.userId, eventType: "books.reconciliation.reopened", entityType: "BankReconciliation", entityId: rec.id, reason: why, payload: { by: auditActor(actor) } },
      tx,
    );
    return reopened;
  });
}

/** Void an open reconciliation started in error (owner): its matches are undone and its statement lines removed, to upload again. */
export async function voidReconciliation(actor: BooksActor, reconciliationId: string, reason: string) {
  allow(actor, "reconciliation.void");
  const why = reasonOf(reason);
  const rec = await prisma.bankReconciliation.findFirst({ where: { id: reconciliationId, companyId: actor.companyId } });
  if (!rec) throw new BankRefused("That reconciliation is not in this workspace.", 404);
  if (rec.status !== "OPEN") throw new BankRefused(rec.status === "CLOSED" ? "It is closed: reopen it first." : "It is void already.");
  return prisma.$transaction(async (tx) => {
    const lines = await tx.bankStatementLine.findMany({ where: { reconciliationId: rec.id }, select: { matchedTransactionId: true } });
    const ids = lines.map((line) => line.matchedTransactionId).filter((id): id is string => Boolean(id));
    await tx.bankTransaction.updateMany({ where: { OR: [{ id: { in: ids } }, { reconciliationId: rec.id }] }, data: { reconciliationId: null, reconciledAt: null } });
    await tx.bankStatementLine.deleteMany({ where: { reconciliationId: rec.id } });
    const voided = await tx.bankReconciliation.update({ where: { id: rec.id }, data: { status: "VOIDED" } });
    await writePlatformAuditEvent(
      { companyId: rec.companyId, actorId: actor.userId, eventType: "books.reconciliation.voided", entityType: "BankReconciliation", entityId: rec.id, reason: why, payload: { by: auditActor(actor), lines: lines.length } },
      tx,
    );
    return voided;
  });
}

/** Each bank and wallet account's latest closed reconciliation, and whether it reaches a date: Close the month's "every account reconciled". */
export async function reconciledTo(companyId: string, asOf: Date, db: Db = prisma) {
  // Banks and wallets have statements; cash is counted instead (§5.11's "floats counted").
  const accounts = await db.bankAccount.findMany({ where: { companyId, isActive: true, kind: { in: ["BANK", "MOBILE"] } }, select: { id: true, name: true, currency: true, openingBalance: true } });
  const ids = accounts.map((account) => account.id);
  const [closed, moved] = await Promise.all([
    db.bankReconciliation.findMany({ where: { companyId, status: "CLOSED", bankAccountId: { in: ids } }, select: { bankAccountId: true, statementEndDate: true, endDate: true } }),
    db.bankTransaction.groupBy({ by: ["bankAccountId"], where: { companyId, bankAccountId: { in: ids }, txnDate: { lte: endOfDay(asOf) } }, _count: true }),
  ]);
  const active = new Set(moved.map((row) => row.bankAccountId));
  return accounts.map((account) => {
    const to = closed
      .filter((rec) => rec.bankAccountId === account.id)
      .map((rec) => rec.statementEndDate ?? rec.endDate)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    // An account nothing has moved through, holding nothing, has nothing to reconcile.
    const idle = !active.has(account.id) && Math.abs(account.openingBalance) < 0.005;
    return { bankAccountId: account.id, name: account.name, currency: account.currency, reconciledTo: to ? day(to) : null, reconciled: idle || Boolean(to && day(to) >= day(asOf)) };
  });
}

// ── Bank entries and IMTT ────────────────────────────────────────────────────

export type BankEntryKind = "CHARGE" | "IMTT" | "INTEREST" | "TRANSFER" | "TAX" | "OTHER";

const ENTRY_ACCOUNT: Partial<Record<BankEntryKind, string>> = { CHARGE: "5460", IMTT: "5465", INTEREST: "4200" };
const ENTRY_WORDS: Record<BankEntryKind, string> = { CHARGE: "Bank charges", IMTT: "IMTT", INTEREST: "Interest", TRANSFER: "Transfer", TAX: "Tax paid", OTHER: "Bank entry" };

export async function accountIdByCode(db: Db, companyId: string, code: string): Promise<string | null> {
  const row = await db.chartOfAccount.findFirst({ where: { companyId, code, nodeType: "LEDGER", isActive: true }, select: { id: true } });
  return row?.id ?? null;
}

export type BankEntryInput = {
  kind: BankEntryKind;
  bankAccountId: string;
  date: Date;
  amount: number;
  description?: string | null;
  reference?: string | null;
  /** The account it posts to, for TAX and OTHER (and to override the default for the rest). */
  accountId?: string | null;
  /** TRANSFER: the account the money went to; it must hold the same currency. */
  toBankAccountId?: string | null;
  /** The statement line it was made from: matched to it at once. */
  statementLineId?: string | null;
};

/**
 * A bank entry (§4.13): posts `BANK_TRANSACTION` (Dr the account it names,
 * Cr the money account; interest the other way) with its bank transaction,
 * and, for a transfer, the receiving account's side. Made from a statement
 * line, it is matched to that line.
 */
export async function recordBankEntry(actor: BooksActor, input: BankEntryInput) {
  allow(actor, "bank.entry");
  if (!(input.amount > 0)) throw new BankRefused("Enter the amount.", 400);
  const account = await prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, companyId: actor.companyId }, select: { id: true, name: true, currency: true } });
  if (!account) throw new BankRefused("That money account is not in this workspace.", 404);
  await ensureAccountingDefaults(actor.companyId);

  let target: string | null = input.accountId ?? null;
  let toAccount: { id: string; name: string; currency: string } | null = null;
  if (input.kind === "TRANSFER") {
    toAccount = input.toBankAccountId ? await prisma.bankAccount.findFirst({ where: { id: input.toBankAccountId, companyId: actor.companyId }, select: { id: true, name: true, currency: true } }) : null;
    if (!toAccount) throw new BankRefused("Choose the account the money went to.", 400);
    if (toAccount.id === account.id) throw new BankRefused("A transfer goes to another account.", 400);
    if (toAccount.currency !== account.currency) throw new BankRefused(`${account.name} holds ${account.currency} and ${toAccount.name} ${toAccount.currency}: a transfer between currencies is a sale of currency, recorded as two entries.`, 400);
    target = await moneyLedgerAccount(actor.companyId, toAccount.id);
  } else if (!target && ENTRY_ACCOUNT[input.kind]) {
    target = await accountIdByCode(prisma, actor.companyId, ENTRY_ACCOUNT[input.kind]!);
  } else if (target) {
    const own = await prisma.chartOfAccount.findFirst({ where: { id: target, companyId: actor.companyId, nodeType: "LEDGER", isActive: true }, select: { id: true } });
    if (!own) throw new BankRefused("That account is not in this workspace's chart.", 404);
  }
  if (!target) throw new BankRefused(input.kind === "TAX" || input.kind === "OTHER" ? "Choose the account it goes to." : `This workspace has no account for ${ENTRY_WORDS[input.kind].toLowerCase()}.`, 400);

  const line = input.statementLineId ? await lineOf(actor.companyId, input.statementLineId) : null;
  if (line) {
    if (line.reconciliation.bankAccountId !== account.id) throw new BankRefused("That line is from another account.", 400);
    if (line.reconciliation.status === "CLOSED") throw new BankRefused(closedWords);
    if (line.matchedTransactionId) throw new BankRefused("That line is already matched.");
    if (Math.abs(line.amount - input.amount) >= 0.005) throw new BankRefused("The entry is for a different amount from the line.", 400);
  }

  const moneyIn = input.kind === "INTEREST";
  const sourceId = randomUUID();
  const description = input.description?.trim() || (toAccount ? `Transfer to ${toAccount.name}` : `${ENTRY_WORDS[input.kind]}, ${account.name}`);
  const posting = await postMoney(prisma, {
    companyId: actor.companyId,
    sourceType: "BANK_TRANSACTION",
    sourceId,
    sourceSubtype: input.kind,
    date: input.date,
    description,
    amount: input.amount,
    currency: account.currency,
    accounts: { expenseAccount: target },
    money: { bankAccountId: account.id, direction: moneyIn ? "IN" : "OUT", reference: input.reference ?? null },
    invertDirection: moneyIn,
    actor: { userId: actor.userId, role: actor.role ?? null },
  });
  if (toAccount) {
    await prisma.bankTransaction.create({
      data: { companyId: actor.companyId, bankAccountId: toAccount.id, txnDate: input.date, description: `Transfer from ${account.name}`, reference: input.reference ?? undefined, amount: input.amount, direction: "CREDIT", sourceType: "BANK_TRANSACTION", sourceId },
    });
  }
  if (line && posting.bankTransactionId) {
    await prisma.$transaction([
      prisma.bankTransaction.update({ where: { id: posting.bankTransactionId }, data: { reconciliationId: line.reconciliationId, reconciledAt: new Date() } }),
      prisma.bankStatementLine.update({ where: { id: line.id }, data: { matchedTransactionId: posting.bankTransactionId } }),
    ]);
  }
  return { sourceId, entryId: posting.entryId ?? null, bankTransactionId: posting.bankTransactionId ?? null, error: posting.error ?? null };
}

/** Void a bank entry: its mirror, its bank side off (refused while in a closed reconciliation). */
export async function voidBankEntry(actor: BooksActor, sourceId: string, reason: string) {
  return voidMoney({ companyId: actor.companyId, sourceType: "BANK_TRANSACTION", sourceId, reason, actor, eventType: "books.bank-entry.voided" });
}

const IMTT = /\bimtt\b|intermediated money transfer|2%\s*(?:transfer\s*)?tax|transfer tax/i;

/** A statement line that reads like the IMTT the bank took (§5.8.3). */
export function isImttLine(text: string): boolean {
  return IMTT.test(text);
}

/**
 * The IMTT on a transfer, for the proposed line on a payment (§5.8.3), pure:
 * 2% on US dollars, 1.5% on ZWG (settings), and a flat amount on one transfer
 * over the threshold (in US dollars; a ZWG transfer is compared at `rate`).
 * The app records what the bank charged; this only proposes.
 */
export function imttOn(amount: number, currency: string, settings: Pick<TaxSettings, "imtt">, base = "USD", rate?: number | null): number {
  const zig = currency.toUpperCase() === "ZWG";
  const inUsd = currency.toUpperCase() === base.toUpperCase() ? amount : rate && rate > 0 ? amount / rate : null;
  if (inUsd !== null && inUsd > settings.imtt.flatOverUsd) {
    const flat = settings.imtt.flatAmountUsd;
    return round2(currency.toUpperCase() === base.toUpperCase() ? flat : flat * (rate ?? 1));
  }
  return round2(amount * (zig ? settings.imtt.zwgRate : settings.imtt.usdRate));
}
