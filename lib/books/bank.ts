import type { PrismaClient } from "@prisma/client";

import { recordBankTransaction, recordPurchasePayment, recordSalesReceipt } from "@/lib/accounting/payments";

import { addDays, dayOf, money, shortDay, sinceWhen, storedDay, weekdayDay } from "./format";
import { invoiceBalance } from "./invoice-state";
import {
  isProposal,
  proposeMatch,
  type EcoCashDay,
  type Match,
  type MatchCandidates,
  type OpenBill,
  type OpenInvoice,
  type Proposal,
  type RecordedTransaction,
  type StatementLineInput,
} from "./matching";
import { isMoneyIn } from "./money";
import { lineKey, type StatementRow } from "./statement";

/**
 * Books → Bank (design/core-modules/html/books-bank.html): the lines of the
 * statements a person uploaded, each with the record it most likely is and
 * why. Nothing is matched until a person accepts it; accepting records the
 * receipt or payment the normal way and links the line to it.
 *
 * The matches are worked out when the page is read, from the books as they
 * stand then, so a match never points at an invoice that was paid since.
 */

export type BankTab = "to-match" | "matched" | "everything";

export type BankLineView = {
  id: string;
  /** "Fri 2 Oct". */
  day: string;
  description: string;
  /** "+$1,412.50", "−$312.40". */
  amount: string;
  moneyIn: boolean;
  state: "proposed" | "unmatched" | "matched";
  proposal: (Proposal & { kind: Match["kind"] }) | null;
  /** Why there is no match, and what it probably is. */
  reason: string | null;
  suggestion: (Proposal & { kind: Match["kind"] }) | null;
  /** What it was matched to. */
  matchedTo: string | null;
};

export type BankAccountOption = { id: string; label: string; bank: string; currency: string };

export type BankView = {
  accounts: BankAccountOption[];
  account: BankAccountOption | null;
  tab: BankTab;
  counts: { toMatch: number; matched: number; everything: number };
  proposed: number;
  finding: { fact: string; rest: string | null } | null;
  lines: BankLineView[];
};

type Db = PrismaClient;

const midnight = (day: string) => new Date(`${day}T00:00:00.000Z`);
const harareStart = (day: string) => new Date(`${day}T00:00:00.000+02:00`);
const round = (n: number) => Math.round(n * 100) / 100;

export async function bankAccounts(db: Db, companyId: string): Promise<BankAccountOption[]> {
  const accounts = await db.bankAccount.findMany({
    where: { companyId, isActive: true, kind: { in: ["BANK", "MOBILE"] } },
    select: { id: true, name: true, bankName: true, currency: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return accounts.map((account) => ({
    id: account.id,
    bank: account.bankName || account.name,
    label: account.bankName ? `${account.bankName}, ${account.currency}` : account.name,
    currency: account.currency,
  }));
}

/** Everything a line could be: open invoices and bills, the tills' EcoCash days, transactions not yet matched. */
async function candidatesFor(db: Db, companyId: string, account: BankAccountOption, lines: StatementLineInput[]): Promise<MatchCandidates> {
  if (lines.length === 0) return { invoices: [], bills: [], ecocash: [], transactions: [], bankName: account.bank };
  const days = lines.map((line) => line.date).sort();
  const from = addDays(days[0], -4);
  const to = addDays(days[days.length - 1], 4);
  const [invoices, bills, payments, transactions, charges] = await Promise.all([
    db.salesInvoice.findMany({
      where: { companyId, status: "ISSUED", currency: account.currency },
      select: { id: true, invoiceNumber: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true, currency: true, customer: { select: { name: true } } },
    }),
    db.purchaseBill.findMany({
      where: { companyId, status: "RECEIVED", currency: account.currency },
      select: {
        id: true,
        billNumber: true,
        total: true,
        amountPaid: true,
        debitNoteTotal: true,
        writeOffTotal: true,
        currency: true,
        vendor: { select: { name: true } },
        lines: { select: { description: true }, take: 2 },
      },
    }),
    db.retailSalePayment.findMany({
      where: {
        companyId,
        tenderType: "ECOCASH",
        currency: account.currency,
        createdAt: { gte: harareStart(from), lt: harareStart(to) },
        sale: { status: "POSTED" },
      },
      select: { amount: true, createdAt: true, sale: { select: { saleType: true, site: { select: { name: true } } } } },
    }),
    db.bankTransaction.findMany({
      where: { companyId, bankAccountId: account.id, reconciledAt: null, matchedStatementLines: { none: {} }, txnDate: { gte: midnight(from), lt: midnight(to) } },
      select: { id: true, txnDate: true, description: true, amount: true, direction: true, sourceType: true },
    }),
    db.bankStatementLine.findMany({
      where: {
        reconciliation: { companyId, bankAccountId: account.id },
        matchedTransaction: { description: { startsWith: "Bank charges" } },
      },
      select: { txnDate: true, description: true },
      orderBy: { txnDate: "desc" },
      take: 50,
    }),
  ]);

  const openInvoices: OpenInvoice[] = invoices
    .map((invoice) => ({
      id: invoice.id,
      number: invoice.invoiceNumber,
      customer: invoice.customer.name,
      balance: invoiceBalance(invoice),
      currency: invoice.currency,
    }))
    .filter((invoice) => invoice.balance > 0);

  const openBills: OpenBill[] = bills
    .map((bill) => ({
      id: bill.id,
      number: bill.billNumber,
      vendor: bill.vendor.name,
      balance: round(bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal),
      currency: bill.currency,
      what: bill.lines.length > 0 ? bill.lines.map((line) => line.description.toLowerCase()).join(" and ") : null,
    }))
    .filter((bill) => bill.balance > 0.005);

  const byDay = new Map<string, { amount: number; sites: Set<string> }>();
  for (const payment of payments) {
    const day = dayOf(payment.createdAt);
    const entry = byDay.get(day) ?? { amount: 0, sites: new Set<string>() };
    const amount = Number(payment.amount);
    entry.amount += payment.sale.saleType === "REFUND" ? -Math.abs(amount) : amount;
    entry.sites.add(payment.sale.site.name);
    byDay.set(day, entry);
  }
  const ecocash: EcoCashDay[] = [...byDay.entries()].map(([day, entry]) => ({
    day,
    amount: round(entry.amount),
    site: entry.sites.size === 1 ? [...entry.sites][0] : "The tills",
  }));

  const recorded: RecordedTransaction[] = transactions.map((txn) => ({
    id: txn.id,
    date: storedDay(txn.txnDate),
    description: txn.description,
    amount: txn.amount,
    direction: isMoneyIn(txn) ? "CREDIT" : "DEBIT",
  }));

  const firstWord = (text: string) => text.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return {
    invoices: openInvoices,
    bills: openBills,
    ecocash,
    transactions: recorded,
    bankName: account.bank,
    chargesFiledBefore: (line) => {
      const before = charges.find((charge) => firstWord(charge.description) === firstWord(line.description) && storedDay(charge.txnDate) < line.date);
      return before ? storedDay(before.txnDate) : null;
    },
  };
}

const withKind = (proposal: Proposal) => ({ ...proposal, kind: proposal.match.kind });

export function bankFinding(
  input: { bank: string; toMatch: number; proposed: number; since: string | null; total: number },
): { fact: string; rest: string | null } | null {
  if (input.total === 0) return null;
  if (input.toMatch === 0) return { fact: `Every line from ${input.bank} is matched.`, rest: null };
  const lines = input.toMatch === 1 ? "1 line" : `${input.toMatch} lines`;
  const fact = `${lines} from ${input.bank}${input.since ? ` since ${input.since}` : ""} ${input.toMatch === 1 ? "is" : "are"} not matched.`;
  if (input.proposed === 0) return { fact, rest: input.toMatch === 1 ? "Choose what it was." : "Choose what each one was." };
  const which = input.toMatch === 1 ? "it" : input.proposed === input.toMatch ? `all ${input.toMatch}` : `${input.proposed} of them`;
  return { fact, rest: `Vane matched ${which}. Nothing is matched until you accept it.` };
}

export async function readBank(db: Db, companyId: string, { accountId, tab }: { accountId?: string | null; tab: BankTab }, now = new Date()): Promise<BankView> {
  const accounts = await bankAccounts(db, companyId);
  const account = accounts.find((option) => option.id === accountId) ?? accounts[0] ?? null;
  if (!account) {
    return { accounts, account: null, tab, counts: { toMatch: 0, matched: 0, everything: 0 }, proposed: 0, finding: null, lines: [] };
  }
  const where = { reconciliation: { companyId, bankAccountId: account.id } };
  const [all, matchedCount] = await Promise.all([
    db.bankStatementLine.findMany({
      where: tab === "matched" ? { ...where, matchedTransactionId: { not: null } } : tab === "to-match" ? { ...where, matchedTransactionId: null } : where,
      select: {
        id: true,
        txnDate: true,
        description: true,
        reference: true,
        amount: true,
        direction: true,
        matchedTransaction: { select: { description: true } },
      },
      orderBy: [{ txnDate: tab === "to-match" ? "asc" : "desc" }, { createdAt: "asc" }],
      take: 500,
    }),
    db.bankStatementLine.count({ where: { ...where, matchedTransactionId: { not: null } } }),
  ]);
  const unmatchedLines = tab === "matched" ? [] : all.filter((line) => !line.matchedTransaction);
  const inputs: StatementLineInput[] = unmatchedLines.map((line) => ({
    id: line.id,
    date: storedDay(line.txnDate),
    description: line.description,
    reference: line.reference,
    amount: line.amount,
    direction: line.direction,
  }));
  const candidates = await candidatesFor(db, companyId, account, inputs);
  const results = new Map(inputs.map((input) => [input.id, proposeMatch(input, candidates)]));

  const toMatchCount = tab === "matched" ? await db.bankStatementLine.count({ where: { ...where, matchedTransactionId: null } }) : unmatchedLines.length;
  const lines: BankLineView[] = all.map((line) => {
    const moneyIn = line.direction === "CREDIT";
    const base = {
      id: line.id,
      day: weekdayDay(storedDay(line.txnDate)),
      description: line.description,
      amount: `${moneyIn ? "+" : "−"}${money(line.amount, account.currency)}`,
      moneyIn,
    };
    if (line.matchedTransaction) {
      return { ...base, state: "matched", proposal: null, reason: null, suggestion: null, matchedTo: line.matchedTransaction.description };
    }
    const result = results.get(line.id)!;
    if (isProposal(result)) {
      return { ...base, state: "proposed", proposal: withKind(result), reason: null, suggestion: null, matchedTo: null };
    }
    return {
      ...base,
      state: "unmatched",
      proposal: null,
      reason: result.reason,
      suggestion: result.suggestion ? withKind(result.suggestion) : null,
      matchedTo: null,
    };
  });

  const proposed = [...results.values()].filter(isProposal).length;
  const first = unmatchedLines[0];
  const today = dayOf(now);
  return {
    accounts,
    account,
    tab,
    counts: { toMatch: toMatchCount, matched: matchedCount, everything: toMatchCount + matchedCount },
    proposed,
    finding: bankFinding({
      bank: account.bank,
      toMatch: toMatchCount,
      proposed,
      since: first ? sinceWhen(storedDay(first.txnDate), today) : null,
      total: toMatchCount + matchedCount,
    }),
    lines,
  };
}

export class BankError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

/**
 * Adds an uploaded statement's lines to the account's open reconciliation,
 * leaving out any line already uploaded.
 */
export async function uploadStatement(
  db: Db,
  { companyId, userId, accountId, rows }: { companyId: string; userId: string; accountId: string; rows: StatementRow[] },
): Promise<{ added: number; repeated: number }> {
  const account = await db.bankAccount.findFirst({ where: { id: accountId, companyId, isActive: true }, select: { id: true } });
  if (!account) throw new BankError("That account is not in this workspace.", 404);
  const days = rows.map((row) => row.date).sort();
  const existing = await db.bankStatementLine.findMany({
    where: { reconciliation: { companyId, bankAccountId: accountId }, txnDate: { gte: midnight(days[0]), lte: midnight(days[days.length - 1]) } },
    select: { txnDate: true, amount: true, direction: true, description: true },
  });
  const seen = new Set(existing.map((line) => lineKey({ ...line, date: storedDay(line.txnDate) })));
  const fresh: StatementRow[] = [];
  for (const row of rows) {
    const key = lineKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(row);
  }
  if (fresh.length === 0) return { added: 0, repeated: rows.length };

  await db.$transaction(async (tx) => {
    let reconciliation = await tx.bankReconciliation.findFirst({
      where: { companyId, bankAccountId: accountId, status: "OPEN" },
      orderBy: { createdAt: "desc" },
      select: { id: true, startDate: true, endDate: true },
    });
    const start = midnight(fresh.map((row) => row.date).sort()[0]);
    const end = midnight(fresh.map((row) => row.date).sort().at(-1)!);
    if (!reconciliation) {
      reconciliation = await tx.bankReconciliation.create({
        data: { companyId, bankAccountId: accountId, startDate: start, endDate: end, createdById: userId },
        select: { id: true, startDate: true, endDate: true },
      });
    } else if (start < reconciliation.startDate || end > reconciliation.endDate) {
      await tx.bankReconciliation.update({
        where: { id: reconciliation.id },
        data: {
          startDate: start < reconciliation.startDate ? start : reconciliation.startDate,
          endDate: end > reconciliation.endDate ? end : reconciliation.endDate,
        },
      });
    }
    await tx.bankStatementLine.createMany({
      data: fresh.map((row) => ({
        reconciliationId: reconciliation.id,
        txnDate: midnight(row.date),
        description: row.description,
        reference: row.reference,
        amount: row.amount,
        direction: row.direction,
      })),
    });
  });
  return { added: fresh.length, repeated: rows.length - fresh.length };
}

type LineRecord = {
  id: string;
  txnDate: Date;
  description: string;
  reference: string | null;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  matchedTransactionId: string | null;
  reconciliationId: string;
  reconciliation: { bankAccountId: string };
};

async function lineFor(db: Db, companyId: string, lineId: string): Promise<LineRecord> {
  const line = await db.bankStatementLine.findFirst({
    where: { id: lineId, reconciliation: { companyId } },
    select: {
      id: true,
      txnDate: true,
      description: true,
      reference: true,
      amount: true,
      direction: true,
      matchedTransactionId: true,
      reconciliationId: true,
      reconciliation: { select: { bankAccountId: true } },
    },
  });
  if (!line) throw new BankError("That bank line is not in this workspace.", 404);
  if (line.matchedTransactionId) throw new BankError("That line is already matched.", 409);
  return line;
}

/** Vane's match for a line, worked out now. */
export async function proposalFor(db: Db, companyId: string, lineId: string): Promise<Proposal | null> {
  const line = await lineFor(db, companyId, lineId);
  const accounts = await bankAccounts(db, companyId);
  const account = accounts.find((option) => option.id === line.reconciliation.bankAccountId);
  if (!account) return null;
  const input: StatementLineInput = {
    id: line.id,
    date: storedDay(line.txnDate),
    description: line.description,
    reference: line.reference,
    amount: line.amount,
    direction: line.direction,
  };
  const result = proposeMatch(input, await candidatesFor(db, companyId, account, [input]));
  return isProposal(result) ? result : null;
}

/**
 * What a line could be, for Choose: open invoices for money in, open bills for
 * money out, nearest amount first; transactions already recorded; and, for
 * money out, bank charges.
 */
export async function choicesFor(db: Db, companyId: string, lineId: string): Promise<Array<{ match: Match; title: string; detail: string }>> {
  const line = await lineFor(db, companyId, lineId);
  const accounts = await bankAccounts(db, companyId);
  const account = accounts.find((option) => option.id === line.reconciliation.bankAccountId);
  if (!account) return [];
  const input: StatementLineInput = { id: line.id, date: storedDay(line.txnDate), description: line.description, reference: line.reference, amount: line.amount, direction: line.direction };
  const candidates = await candidatesFor(db, companyId, account, [input]);
  const nearest = <T extends { balance: number }>(rows: T[]) =>
    [...rows].filter((row) => row.balance + 0.005 >= line.amount).sort((a, b) => Math.abs(a.balance - line.amount) - Math.abs(b.balance - line.amount)).slice(0, 12);
  const choices: Array<{ match: Match; title: string; detail: string }> = [];
  if (line.direction === "CREDIT") {
    for (const invoice of nearest(candidates.invoices)) {
      choices.push({
        match: { kind: "invoice", invoiceId: invoice.id, amount: line.amount },
        title: `${invoice.number}, ${invoice.customer}`,
        detail: `${money(invoice.balance, invoice.currency)} owing`,
      });
    }
    for (const day of candidates.ecocash.filter((day) => Math.abs(day.amount - line.amount) < 0.005)) {
      choices.push({ match: { kind: "ecocash", day: day.day, amount: line.amount }, title: `${day.site}, EcoCash sales on ${shortDay(day.day)}`, detail: money(day.amount, account.currency) });
    }
  } else {
    for (const bill of nearest(candidates.bills)) {
      choices.push({
        match: { kind: "bill", billId: bill.id, amount: line.amount },
        title: `Bill ${bill.number} from ${bill.vendor}`,
        detail: `${money(bill.balance, bill.currency)} owing`,
      });
    }
  }
  for (const txn of candidates.transactions.filter((txn) => txn.direction === line.direction && Math.abs(txn.amount - line.amount) < 0.005)) {
    choices.push({ match: { kind: "transaction", transactionId: txn.id }, title: txn.description, detail: `Recorded ${shortDay(txn.date)}` });
  }
  if (line.direction === "DEBIT") {
    choices.push({ match: { kind: "bank-charges", amount: line.amount }, title: "Bank charges", detail: `${account.bank}'s own charge` });
  }
  return choices;
}

/**
 * A person accepts a line's match: the receipt, payment or bank transaction is
 * recorded the way it is everywhere else, and the line is linked to it.
 * The match is checked again against the books as they stand now.
 */
export async function acceptMatch(
  db: Db,
  { companyId, userId, role, lineId, match }: { companyId: string; userId: string; role?: string | null; lineId: string; match: Match },
): Promise<{ transactionId: string }> {
  const line = await lineFor(db, companyId, lineId);
  const bankAccountId = line.reconciliation.bankAccountId;
  const txnDate = line.txnDate;
  const reference = line.reference ?? line.description;
  const moneyIn = line.direction === "CREDIT";
  let transactionId: string;

  if (match.kind === "invoice") {
    if (!moneyIn) throw new BankError("Money out cannot pay an invoice.");
    const invoice = await db.salesInvoice.findFirst({
      where: { id: match.invoiceId, companyId, status: "ISSUED" },
      select: { id: true, invoiceNumber: true, total: true, amountPaid: true, creditTotal: true, writeOffTotal: true },
    });
    if (!invoice) throw new BankError("That invoice is not open any more.", 409);
    if (line.amount > invoiceBalance(invoice) + 0.005) throw new BankError(`Only ${money(invoiceBalance(invoice))} is owed on ${invoice.invoiceNumber}.`, 409);
    const receipt = await recordSalesReceipt({ companyId, userId, invoiceId: invoice.id, receivedAt: txnDate, amount: line.amount, method: "Bank transfer", reference, bankAccountId });
    const txn = await recordBankTransaction({
      companyId,
      userId,
      role,
      bankAccountId,
      txnDate,
      description: `${invoice.invoiceNumber}, ${line.description}`,
      reference,
      amount: line.amount,
      direction: "CREDIT",
      source: { type: "SALES_RECEIPT", id: receipt.id },
      reconciliationId: line.reconciliationId,
    });
    transactionId = txn.id;
  } else if (match.kind === "bill") {
    if (moneyIn) throw new BankError("Money in cannot pay a bill.");
    const bill = await db.purchaseBill.findFirst({
      where: { id: match.billId, companyId, status: "RECEIVED" },
      select: { id: true, billNumber: true, total: true, amountPaid: true, debitNoteTotal: true, writeOffTotal: true, vendor: { select: { name: true } } },
    });
    if (!bill) throw new BankError("That bill is not open any more.", 409);
    const balance = bill.total - bill.amountPaid - bill.debitNoteTotal - bill.writeOffTotal;
    if (line.amount > balance + 0.005) throw new BankError(`Only ${money(balance)} is owed on bill ${bill.billNumber}.`, 409);
    const payment = await recordPurchasePayment({ companyId, userId, billId: bill.id, paidAt: txnDate, amount: line.amount, method: "Bank transfer", reference, bankAccountId });
    const txn = await recordBankTransaction({
      companyId,
      userId,
      role,
      bankAccountId,
      txnDate,
      description: `Bill ${bill.billNumber}, ${bill.vendor.name}`,
      reference,
      amount: line.amount,
      direction: "DEBIT",
      source: { type: "PURCHASE_PAYMENT", id: payment.id },
      reconciliationId: line.reconciliationId,
    });
    transactionId = txn.id;
  } else if (match.kind === "transaction") {
    const txn = await db.bankTransaction.findFirst({
      where: { id: match.transactionId, companyId, bankAccountId, reconciledAt: null, matchedStatementLines: { none: {} } },
      select: { id: true, amount: true },
    });
    if (!txn) throw new BankError("That transaction is already matched.", 409);
    if (Math.abs(txn.amount - line.amount) >= 0.005) throw new BankError("That transaction is for a different amount.");
    await db.bankTransaction.update({ where: { id: txn.id }, data: { reconciliationId: line.reconciliationId, reconciledAt: new Date() } });
    transactionId = txn.id;
  } else if (match.kind === "ecocash") {
    if (!moneyIn) throw new BankError("An EcoCash settlement is money in.");
    const txn = await recordBankTransaction({
      companyId,
      userId,
      role,
      bankAccountId,
      txnDate,
      description: `EcoCash settlement for ${shortDay(match.day)}`,
      reference,
      amount: line.amount,
      direction: "CREDIT",
      reconciliationId: line.reconciliationId,
    });
    transactionId = txn.id;
  } else {
    if (moneyIn) throw new BankError("Bank charges are money out.");
    const txn = await recordBankTransaction({
      companyId,
      userId,
      role,
      bankAccountId,
      txnDate,
      description: `Bank charges, ${line.description}`,
      reference,
      amount: line.amount,
      direction: "DEBIT",
      reconciliationId: line.reconciliationId,
    });
    transactionId = txn.id;
  }

  await db.bankStatementLine.update({ where: { id: line.id }, data: { matchedTransactionId: transactionId } });
  return { transactionId };
}

/** "Accept Vane's 3": each of Vane's matches, accepted one by one, still a person's press. */
export async function acceptProposals(
  db: Db,
  { companyId, userId, role, lineIds }: { companyId: string; userId: string; role?: string | null; lineIds: string[] },
): Promise<{ accepted: number; failed: Array<{ lineId: string; error: string }> }> {
  let accepted = 0;
  const failed: Array<{ lineId: string; error: string }> = [];
  for (const lineId of lineIds) {
    try {
      const proposal = await proposalFor(db, companyId, lineId);
      if (!proposal) {
        failed.push({ lineId, error: "Vane has no match for it now." });
        continue;
      }
      await acceptMatch(db, { companyId, userId, role, lineId, match: proposal.match });
      accepted += 1;
    } catch (error) {
      failed.push({ lineId, error: error instanceof BankError ? error.message : "It could not be recorded." });
    }
  }
  return { accepted, failed };
}

