import { Prisma, type MoneyAccountKind, type PostingDirection } from "@prisma/client";

import { money, sumMoney, ZERO } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/workspace/format";

/**
 * Money accounts (40-buying 3.2, 3.3 D; moved into BUY-04): the shop's
 * `BankAccount`s, each cash, bank or mobile and sitting in a ledger account.
 * A balance is the opening balance plus every DEBIT less every CREDIT of its
 * transactions. The columns are Float, so each is turned into cents once and
 * the cents are added as `Decimal`s: summing the floats would drift.
 */

type Client = Prisma.TransactionClient | typeof prisma;

export type MoneyAccount = {
  id: string;
  name: string;
  kind: MoneyAccountKind;
  currency: string;
  accountNumber: string | null;
  balance: Prisma.Decimal;
};

/** The ledger account a new money account of each kind sits in. */
export const KIND_LEDGER: Record<MoneyAccountKind, string> = { CASH: "1005", BANK: "1010", MOBILE: "1016" };

/** `openingBalance` + Σ DEBIT − Σ CREDIT, each figure to the cent first. */
export function balanceOf(openingBalance: number, transactions: Array<{ amount: number; direction: PostingDirection }>): Prisma.Decimal {
  const debits = sumMoney(transactions.filter((t) => t.direction === "DEBIT").map((t) => money(t.amount)));
  const credits = sumMoney(transactions.filter((t) => t.direction === "CREDIT").map((t) => money(t.amount)));
  return money(openingBalance).plus(debits).minus(credits);
}

/** "•••• 4471": the last four digits of the number. */
export function lastFour(accountNumber: string | null): string | null {
  const digits = (accountNumber ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : null;
}

/** The option's sub: a cash account's balance ("US$2,410.00"), else the number's last four ("•••• 4471"). */
export function moneyAccountSub(account: Pick<MoneyAccount, "kind" | "currency" | "accountNumber" | "balance">): string {
  if (account.kind === "CASH") return formatMoney(Number(account.balance.toString()), account.currency);
  return lastFour(account.accountNumber) ?? formatMoney(Number(account.balance.toString()), account.currency);
}

/** "US dollars" / "ZiG": what an account holds, as the refusals say it. */
export function currencyWords(currency: string): string {
  return currency.toUpperCase() === "USD" ? "US dollars" : currency.toUpperCase() === "ZWG" || currency.toUpperCase() === "ZIG" ? "ZiG" : currency.toUpperCase();
}

/** "Cash, bank or mobile" as typed: cash unless it says bank or mobile (EcoCash is mobile). */
export function parseMoneyAccountKind(text: string | null | undefined): MoneyAccountKind | null {
  const word = (text ?? "").trim().toLowerCase();
  if (!word || word.startsWith("cash")) return "CASH";
  if (word.startsWith("bank")) return "BANK";
  if (word.startsWith("mobile") || word.includes("ecocash") || word.includes("money")) return "MOBILE";
  return null;
}

async function balances(client: Client, companyId: string, ids: string[]): Promise<Map<string, Prisma.Decimal>> {
  if (ids.length === 0) return new Map();
  const rows = await client.bankTransaction.findMany({
    where: { companyId, bankAccountId: { in: ids } },
    select: { bankAccountId: true, amount: true, direction: true },
  });
  const by = new Map<string, Array<{ amount: number; direction: PostingDirection }>>();
  for (const row of rows) {
    const list = by.get(row.bankAccountId) ?? [];
    list.push(row);
    by.set(row.bankAccountId, list);
  }
  const accounts = await client.bankAccount.findMany({ where: { companyId, id: { in: ids } }, select: { id: true, openingBalance: true } });
  return new Map(accounts.map((account) => [account.id, balanceOf(account.openingBalance, by.get(account.id) ?? [])]));
}

/** One account's balance; nought for an account that is not there. */
export async function moneyAccountBalance(accountId: string, client: Client = prisma): Promise<Prisma.Decimal> {
  const account = await client.bankAccount.findUnique({ where: { id: accountId }, select: { companyId: true } });
  if (!account) return ZERO;
  return (await balances(client, account.companyId, [accountId])).get(accountId) ?? ZERO;
}

const ACCOUNT_SELECT = { id: true, name: true, kind: true, currency: true, accountNumber: true } satisfies Prisma.BankAccountSelect;

/** The company's live money accounts with their balances: cash first, then by name. */
export async function listMoneyAccounts(companyId: string, client: Client = prisma): Promise<MoneyAccount[]> {
  const rows = await client.bankAccount.findMany({ where: { companyId, isActive: true }, orderBy: [{ name: "asc" }], select: ACCOUNT_SELECT });
  const known = await balances(client, companyId, rows.map((row) => row.id));
  const order: Record<MoneyAccountKind, number> = { CASH: 0, BANK: 1, MOBILE: 2 };
  return rows
    .map((row) => ({ ...row, balance: known.get(row.id) ?? ZERO }))
    .sort((a, b) => order[a.kind] - order[b.kind]);
}

/** One live account of the company, with its balance; null when it is not one. */
export async function findMoneyAccount(companyId: string, id: string, client: Client = prisma): Promise<MoneyAccount | null> {
  const row = await client.bankAccount.findFirst({ where: { id, companyId, isActive: true }, select: ACCOUNT_SELECT });
  if (!row) return null;
  return { ...row, balance: (await balances(client, companyId, [row.id])).get(row.id) ?? ZERO };
}

export class MoneyAccountRefusal extends Error {
  constructor(readonly fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Check the fields.");
    this.name = "MoneyAccountRefusal";
  }
}

/** The quick add's "Name" and "Kind": a new account in US dollars, in the kind's ledger account. */
export async function addMoneyAccount(companyId: string, input: { name: string; kind: string }, client: Client = prisma): Promise<MoneyAccount> {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) throw new MoneyAccountRefusal({ name: "Write its name." });
  if (name.length > 80) throw new MoneyAccountRefusal({ name: "Keep the name to 80 characters." });
  const kind = parseMoneyAccountKind(input.kind);
  if (!kind) throw new MoneyAccountRefusal({ kind: "Write cash, bank or mobile." });
  const clash = await client.bankAccount.findFirst({ where: { companyId, name: { equals: name, mode: "insensitive" }, isActive: true }, select: { id: true } });
  if (clash) throw new MoneyAccountRefusal({ name: `There is already a money account called ${name}.` });
  const ledger = await client.chartOfAccount.findFirst({ where: { companyId, code: KIND_LEDGER[kind] }, select: { id: true } });
  const created = await client.bankAccount.create({
    data: { companyId, name, kind, currency: "USD", ledgerAccountId: ledger?.id ?? null },
    select: ACCOUNT_SELECT,
  });
  return { ...created, balance: ZERO };
}
