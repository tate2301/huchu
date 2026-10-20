import type { Prisma } from "@prisma/client";

import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { getNextEntryNumber } from "@/lib/accounting/ledger";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { writePlatformAuditEvent } from "@/lib/audit/platform";
import { resolveBaseCurrency, UnknownExchangeRateError } from "@/lib/money";
import { prisma } from "@/lib/prisma";

import { accountIdByCode } from "./bank";
import { auditActor, canDo, type BooksActor } from "./can-do";
import { UNREALISED_FX_ACCOUNT } from "./currency";
import { rateFor } from "./rate";

/**
 * Month-end revaluation (books-final §5.9.5, §5.11.8): open receivables and
 * payables in another currency, and money accounts that hold one, are valued
 * again at the month-end rate. The difference from what they are carried at
 * posts to 4220 Exchange gains and losses, unrealised, on the month's last
 * day, and is reversed on the 1st of the next, so the next month starts from
 * the documents' own rates again.
 *
 * - Receivables and payables: each open invoice and bill in another currency,
 *   its balance in that currency (from the sub-ledger) at its own frozen rate
 *   against the month-end rate.
 * - Money accounts: the lines on the account's ledger kept in its currency
 *   (D4), their total in that currency against their total in the base.
 *
 * Once per month: a second run returns the first. Refused into a closed month.
 */

export class RevaluationRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 409,
  ) {
    super(message);
    this.name = "RevaluationRefused";
  }
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const endOfDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

export type RevaluationItem = {
  kind: "receivable" | "payable" | "money";
  label: string;
  currency: string;
  /** In its own currency. */
  balance: number;
  carryingBase: number;
  revaluedBase: number;
  /** Positive is a gain. */
  gain: number;
  accountId: string;
};

export type RevaluationPlan = { month: string; date: string; rates: Record<string, number>; items: RevaluationItem[]; gain: number; missingRates: string[] };

type Line = { accountId: string; debit: number; credit: number; memo: string; currency?: string | null; amountInCurrency?: number | null; exchangeRate?: number | null };

/** What the month's revaluation would post, read from the books as they stand. */
export async function revaluationPlan(companyId: string, month: string): Promise<RevaluationPlan> {
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0));
  const upTo = endOfDay(lastDay);
  const base = (await resolveBaseCurrency(companyId)).toUpperCase();
  const [receivable, payable] = await Promise.all([accountIdByCode(prisma, companyId, "1100"), accountIdByCode(prisma, companyId, "2000")]);

  const rates = new Map<string, number>();
  const missing = new Set<string>();
  const rateAt = async (currency: string) => {
    const code = currency.toUpperCase();
    if (rates.has(code)) return rates.get(code)!;
    try {
      const frozen = await rateFor(companyId, code, upTo);
      rates.set(code, frozen.rate);
      return frozen.rate;
    } catch (error) {
      if (error instanceof UnknownExchangeRateError) {
        missing.add(code);
        return null;
      }
      throw error;
    }
  };
  const items: RevaluationItem[] = [];

  // Receivables and payables: open documents in another currency, from the sub-ledger.
  const lines = await prisma.paymentLedgerEntry.findMany({
    where: { companyId, status: "POSTED", entryDate: { lte: upTo }, currency: { not: base }, OR: [{ invoiceId: { not: null } }, { billId: { not: null } }] },
    select: { accountType: true, invoiceId: true, billId: true, debit: true, credit: true },
  });
  const byInvoice = new Map<string, number>();
  const byBill = new Map<string, number>();
  for (const line of lines) {
    if (line.accountType === "RECEIVABLE" && line.invoiceId) byInvoice.set(line.invoiceId, round2((byInvoice.get(line.invoiceId) ?? 0) + line.debit - line.credit));
    if (line.accountType === "PAYABLE" && line.billId) byBill.set(line.billId, round2((byBill.get(line.billId) ?? 0) + line.credit - line.debit));
  }
  const [invoices, bills] = await Promise.all([
    byInvoice.size ? prisma.salesInvoice.findMany({ where: { companyId, id: { in: [...byInvoice.keys()] } }, select: { id: true, invoiceNumber: true, currency: true, exchangeRate: true } }) : [],
    byBill.size ? prisma.purchaseBill.findMany({ where: { companyId, id: { in: [...byBill.keys()] } }, select: { id: true, billNumber: true, currency: true, exchangeRate: true } }) : [],
  ]);
  for (const invoice of invoices) {
    const balance = byInvoice.get(invoice.id) ?? 0;
    if (Math.abs(balance) < 0.005 || !invoice.exchangeRate || !receivable || invoice.currency.toUpperCase() === base) continue;
    const rate = await rateAt(invoice.currency);
    if (!rate) continue;
    const carryingBase = round2(balance / invoice.exchangeRate);
    const revaluedBase = round2(balance / rate);
    items.push({ kind: "receivable", label: invoice.invoiceNumber ?? invoice.id, currency: invoice.currency, balance, carryingBase, revaluedBase, gain: round2(revaluedBase - carryingBase), accountId: receivable });
  }
  for (const bill of bills) {
    const balance = byBill.get(bill.id) ?? 0;
    if (Math.abs(balance) < 0.005 || !bill.exchangeRate || !payable || bill.currency.toUpperCase() === base) continue;
    const rate = await rateAt(bill.currency);
    if (!rate) continue;
    const carryingBase = round2(balance / bill.exchangeRate);
    const revaluedBase = round2(balance / rate);
    items.push({ kind: "payable", label: bill.billNumber ?? bill.id, currency: bill.currency, balance, carryingBase, revaluedBase, gain: round2(carryingBase - revaluedBase), accountId: payable });
  }

  // Money accounts in another currency: the ledger's lines kept in that currency.
  const accounts = await prisma.bankAccount.findMany({ where: { companyId, currency: { not: base }, ledgerAccountId: { not: null } }, select: { name: true, currency: true, ledgerAccountId: true } });
  const seen = new Set<string>();
  for (const account of accounts) {
    const key = `${account.ledgerAccountId}:${account.currency.toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const [row] = await prisma.$queryRaw<Array<{ fc: number; base: number }>>`
      SELECT COALESCE(SUM(CASE WHEN l."debit" > 0 THEN COALESCE(l."amountInCurrency", 0) ELSE -COALESCE(l."amountInCurrency", 0) END), 0)::float8 AS fc,
             COALESCE(SUM(l."debit" - l."credit"), 0)::float8 AS base
      FROM "JournalLine" l
      JOIN "JournalEntry" j ON j."id" = l."entryId" AND j."companyId" = ${companyId} AND j."status" = 'POSTED' AND j."entryDate" <= ${upTo}
      WHERE l."accountId" = ${account.ledgerAccountId} AND upper(l."currency") = ${account.currency.toUpperCase()}`;
    const balance = round2(row?.fc ?? 0);
    const carryingBase = round2(row?.base ?? 0);
    if (Math.abs(balance) < 0.005 && Math.abs(carryingBase) < 0.005) continue;
    const rate = await rateAt(account.currency);
    if (!rate) continue;
    const revaluedBase = round2(balance / rate);
    items.push({ kind: "money", label: account.name, currency: account.currency.toUpperCase(), balance, carryingBase, revaluedBase, gain: round2(revaluedBase - carryingBase), accountId: account.ledgerAccountId! });
  }

  const moving = items.filter((item) => Math.abs(item.gain) >= 0.005);
  return {
    month,
    date: lastDay.toISOString().slice(0, 10),
    rates: Object.fromEntries(rates),
    items: moving,
    gain: round2(moving.reduce((sum, item) => sum + item.gain, 0)),
    missingRates: [...missing],
  };
}

/** The lines of a plan: each balance moved by its gain (an asset up or a liability down is a debit), 4220 the other side. */
export function revaluationLines(plan: RevaluationPlan, fxAccountId: string): Line[] {
  const lines: Line[] = [];
  for (const item of plan.items) {
    const amount = round2(Math.abs(item.gain));
    const debitBalance = item.gain > 0;
    lines.push({
      accountId: item.accountId,
      debit: debitBalance ? amount : 0,
      credit: debitBalance ? 0 : amount,
      memo: `Revalued ${item.label} at ${plan.rates[item.currency.toUpperCase()]} ${item.currency}`,
      currency: item.currency,
      amountInCurrency: 0,
      exchangeRate: plan.rates[item.currency.toUpperCase()] ?? null,
    });
  }
  const net = round2(plan.gain);
  if (Math.abs(net) >= 0.005) lines.push({ accountId: fxAccountId, debit: net < 0 ? Math.abs(net) : 0, credit: net > 0 ? net : 0, memo: "Unrealised exchange difference" });
  return lines;
}

async function postEntry(
  tx: Prisma.TransactionClient,
  input: { companyId: string; sourceId: string; date: Date; description: string; lines: Line[]; actor: BooksActor; periodId: string; reversalOfEntryId?: string },
) {
  const entryNumber = await getNextEntryNumber(input.companyId, tx);
  const now = new Date();
  return tx.journalEntry.create({
    data: {
      companyId: input.companyId,
      entryNumber,
      entryDate: input.date,
      description: input.description,
      status: "POSTED",
      periodId: input.periodId,
      sourceType: "FX_REVALUATION",
      sourceId: input.sourceId,
      createdById: input.actor.userId,
      postedById: input.actor.userId,
      postedAt: now,
      reversalOfEntryId: input.reversalOfEntryId,
      lines: {
        create: input.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
          memo: line.memo,
          currency: line.currency ?? undefined,
          amountInCurrency: line.amountInCurrency ?? undefined,
          exchangeRate: line.exchangeRate ?? undefined,
        })),
      },
    },
    select: { id: true },
  });
}

/** Post the month's revaluation on its last day and its reversal on the 1st (owner, manager or accountant). */
export async function revalueMonth(actor: BooksActor, month: string) {
  const allowed = canDo(actor, "period.close");
  if (!allowed.allowed) throw new RevaluationRefused(allowed.reason, 403);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RevaluationRefused("Say which month, as YYYY-MM.", 400);
  const sourceId = `reval:${month}`;
  const existing = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "FX_REVALUATION", sourceId, voidedAt: null }, select: { id: true } });
  if (existing) {
    const reversal = await prisma.journalEntry.findFirst({ where: { companyId: actor.companyId, sourceType: "FX_REVALUATION", sourceId: `${sourceId}:reverse` }, select: { id: true } });
    return { already: true, entryId: existing.id, reversalId: reversal?.id ?? null, plan: null };
  }
  await ensureAccountingDefaults(actor.companyId);
  const plan = await revaluationPlan(actor.companyId, month);
  if (plan.missingRates.length) throw new RevaluationRefused(`There is no month-end rate for ${plan.missingRates.join(", ")}. Enter one in Rates first.`);
  if (plan.items.length === 0) return { already: false, entryId: null, reversalId: null, plan };
  const fx = await accountIdByCode(prisma, actor.companyId, UNREALISED_FX_ACCOUNT);
  if (!fx) throw new RevaluationRefused(`This workspace has no ${UNREALISED_FX_ACCOUNT} account for unrealised exchange differences.`);
  const lines = revaluationLines(plan, fx);
  const [y, m] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0));
  const firstNext = new Date(Date.UTC(y, m, 1));
  const [atEnd, atStart] = await Promise.all([
    resolvePostingPeriod({ companyId: actor.companyId, entryDate: lastDay, actorRole: actor.role }),
    resolvePostingPeriod({ companyId: actor.companyId, entryDate: firstNext, actorRole: actor.role }),
  ]);
  if (!atEnd.allowed || atEnd.requiresOverride || atEnd.period.status === "CLOSED") throw new RevaluationRefused(atEnd.message ?? "That month is closed. Revalue before closing it.");
  if (!atStart.allowed || atStart.requiresOverride || atStart.period.status === "CLOSED") throw new RevaluationRefused(atStart.message ?? "The next month is closed, so the revaluation cannot be reversed.");
  return prisma.$transaction(async (tx) => {
    const entry = await postEntry(tx, { companyId: actor.companyId, sourceId, date: lastDay, description: `Revaluation of balances in other currencies, ${month}`, lines, actor, periodId: atEnd.period.id });
    const reversal = await postEntry(tx, {
      companyId: actor.companyId,
      sourceId: `${sourceId}:reverse`,
      date: firstNext,
      description: `Reversal of the ${month} revaluation`,
      lines: lines.map((line) => ({ ...line, debit: line.credit, credit: line.debit, memo: `Reversal: ${line.memo}` })),
      actor,
      periodId: atStart.period.id,
      reversalOfEntryId: entry.id,
    });
    await writePlatformAuditEvent(
      { companyId: actor.companyId, actorId: actor.userId, eventType: "books.revaluation.posted", entityType: "JournalEntry", entityId: entry.id, payload: { by: auditActor(actor), month, rates: plan.rates, gain: plan.gain, reversalId: reversal.id } },
      tx,
    );
    return { already: false, entryId: entry.id, reversalId: reversal.id, plan };
  });
}

/**
 * Reverse a month's revaluation (owner, manager or accountant, with a reason):
 * for a revaluation run at the wrong rate. Both its entries (the month's last
 * day and the 1st after) are mirrored on their own dates and marked void, so
 * the month can be revalued again. Refused into a closed month.
 */
export async function reverseRevaluation(actor: BooksActor, month: string, reason: string) {
  const allowed = canDo(actor, "period.close");
  if (!allowed.allowed) throw new RevaluationRefused(allowed.reason, 403);
  const why = (reason ?? "").trim();
  if (why.length < 3) throw new RevaluationRefused("Say why, in a few words. The reason is kept.", 400);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RevaluationRefused("Say which month, as YYYY-MM.", 400);
  const sourceId = `reval:${month}`;
  const entries = await prisma.journalEntry.findMany({
    where: { companyId: actor.companyId, sourceType: "FX_REVALUATION", sourceId: { in: [sourceId, `${sourceId}:reverse`] }, voidedAt: null },
    include: { lines: true },
    orderBy: { entryDate: "asc" },
  });
  if (entries.length === 0) throw new RevaluationRefused(`${month} has no revaluation to reverse.`, 404);
  const periods = await Promise.all(entries.map((entry) => resolvePostingPeriod({ companyId: actor.companyId, entryDate: entry.entryDate, actorRole: actor.role })));
  const closed = periods.find((period) => !period.allowed || period.requiresOverride || period.period.status === "CLOSED");
  if (closed) throw new RevaluationRefused(closed.message ?? "A month it posted into is closed. Reopen it first.");
  const now = new Date();
  const stamp = now.getTime().toString(36);
  return prisma.$transaction(async (tx) => {
    const mirrors: string[] = [];
    for (const [index, entry] of entries.entries()) {
      const mirror = await postEntry(tx, {
        companyId: actor.companyId,
        sourceId: `${entry.sourceId}:void:${stamp}`,
        date: entry.entryDate,
        description: `Void: ${entry.description} (${why})`,
        lines: entry.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, memo: line.memo ? `Void: ${line.memo}` : "Void", currency: line.currency, amountInCurrency: line.amountInCurrency, exchangeRate: line.exchangeRate })),
        actor,
        periodId: periods[index].period.id,
      });
      mirrors.push(mirror.id);
      // Out of the way of a new run: the month's revaluation is posted under its own name again.
      await tx.journalEntry.update({ where: { id: entry.id }, data: { voidedAt: now, voidedById: actor.userId, sourceId: `${entry.sourceId}:voided:${stamp}` } });
    }
    await writePlatformAuditEvent(
      { companyId: actor.companyId, actorId: actor.userId, eventType: "books.revaluation.reversed", entityType: "JournalEntry", entityId: entries[0].id, reason: why, payload: { by: auditActor(actor), month, mirrors } },
      tx,
    );
    return { month, voided: entries.map((entry) => entry.id), mirrors };
  });
}
