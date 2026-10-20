import type { MoneyAccountKind, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { KIND_LEDGER } from "@/lib/retail/buying/money-accounts";

import { canDo, type BooksActor } from "./can-do";
import { balances } from "../bank-accounts";

/**
 * Management › Company › Money accounts (books-final §3.2 "In Management"):
 * every bank, mobile money and cash account and petty cash float, the ledger
 * account each posts to, and its balance there. Core and free. Adding one or
 * changing its details is the owner's, a manager's or the accountant's.
 */


export type MoneyAccountRow = {
  id: string;
  name: string;
  kind: "BANK" | "MOBILE" | "CASH";
  currency: string;
  bankName: string | null;
  accountNumber: string | null;
  accountName: string | null;
  ledger: { id: string; code: string; name: string } | null;
  /** The chart's account for its kind, when it names none of its own. */
  usual: { code: string; name: string } | null;
  /** Its own currency: the opening balance and every transaction since. */
  balance: number;
  isFloat: boolean;
  imprest: number | null;
  holder: { id: string; name: string; image: string | null } | null;
  showOnDocuments: boolean;
  isDefault: boolean;
  active: boolean;
};

export type MoneyAccountInput = {
  name: string;
  kind: "BANK" | "MOBILE" | "CASH";
  currency: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountName?: string | null;
  ledgerAccountId?: string | null;
  isFloat?: boolean;
  imprestAmount?: number | null;
  holderId?: string | null;
  showOnDocuments?: boolean;
  isDefault?: boolean;
  active?: boolean;
  openingBalance?: number | null;
};

export class MoneyAccountRefused extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "MoneyAccountRefused";
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function moneyAccounts(companyId: string, db: PrismaClient = prisma): Promise<MoneyAccountRow[]> {
  const [rows, settings, usual] = await Promise.all([
    db.bankAccount.findMany({
      where: { companyId },
      select: { id: true, name: true, kind: true, currency: true, openingBalance: true, bankName: true, accountNumber: true, accountName: true, isFloat: true, imprestAmount: true, showOnDocuments: true, isActive: true, ledgerAccount: { select: { id: true, code: true, name: true } }, holder: { select: { id: true, name: true, image: true } } },
      orderBy: [{ isActive: "desc" }, { kind: "asc" }, { name: "asc" }],
    }),
    db.accountingSettings.findUnique({ where: { companyId }, select: { defaultBankAccountId: true } }),
    db.chartOfAccount.findMany({ where: { companyId, code: { in: Object.values(KIND_LEDGER) } }, select: { code: true, name: true } }),
  ]);
  const moved = await balances(db, companyId, rows.map((row) => row.id));
  return rows.map((row) => {
    const code = KIND_LEDGER[row.kind as MoneyAccountKind];
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as MoneyAccountRow["kind"],
      currency: row.currency,
      bankName: row.bankName,
      accountNumber: row.accountNumber,
      accountName: row.accountName,
      ledger: row.ledgerAccount,
      usual: row.ledgerAccount ? null : (usual.find((account) => account.code === code) ?? null),
      balance: round2(row.openingBalance + (moved.get(row.id) ?? 0)),
      isFloat: row.isFloat,
      imprest: row.imprestAmount ? Number(row.imprestAmount) : null,
      holder: row.holder,
      showOnDocuments: row.showOnDocuments,
      isDefault: settings?.defaultBankAccountId === row.id,
      active: row.isActive,
    };
  });
}

/** Add a money account or change one's details. A float has a holder and an imprest; its kind and currency are fixed once it has moved money. */
export async function saveMoneyAccount(actor: BooksActor, id: string | null, input: MoneyAccountInput): Promise<{ id: string }> {
  const decision = canDo(actor, "bank.entry");
  if (!decision.allowed) throw new MoneyAccountRefused(decision.reason, 403);
  if (!input.name.trim()) throw new MoneyAccountRefused("Give the account a name.");
  if (input.isFloat && (!input.holderId || !input.imprestAmount)) throw new MoneyAccountRefused("A float has a holder and the amount it is topped up to.");
  const companyId = actor.companyId;
  let ledgerAccountId = input.ledgerAccountId ?? null;
  if (ledgerAccountId) {
    const owned = await prisma.chartOfAccount.findFirst({ where: { id: ledgerAccountId, companyId, type: "ASSET", nodeType: "LEDGER" }, select: { id: true } });
    if (!owned) throw new MoneyAccountRefused("Choose an asset account from this chart for it to post to.");
  } else {
    ledgerAccountId = (await prisma.chartOfAccount.findFirst({ where: { companyId, code: KIND_LEDGER[input.kind as MoneyAccountKind] }, select: { id: true } }))?.id ?? null;
  }
  if (input.holderId && !(await prisma.user.count({ where: { id: input.holderId, companyId, isActive: true } }))) throw new MoneyAccountRefused("The holder is not an active member of this workspace.");
  const data = {
    name: input.name.trim(),
    bankName: input.bankName?.trim() || null,
    accountNumber: input.accountNumber?.trim() || null,
    accountName: input.accountName?.trim() || null,
    ledgerAccountId,
    isFloat: Boolean(input.isFloat),
    imprestAmount: input.isFloat && input.imprestAmount ? round2(input.imprestAmount) : null,
    holderId: input.isFloat ? input.holderId ?? null : null,
    showOnDocuments: Boolean(input.showOnDocuments),
    ...(input.active === undefined ? {} : { isActive: input.active }),
  };
  let saved: { id: string };
  if (id) {
    const current = await prisma.bankAccount.findFirst({ where: { id, companyId }, select: { kind: true, currency: true, _count: { select: { transactions: true } } } });
    if (!current) throw new MoneyAccountRefused("That account is not here any more.", 404);
    if (current._count.transactions > 0 && (current.kind !== input.kind || current.currency !== input.currency.toUpperCase())) throw new MoneyAccountRefused("Money has moved through it, so its kind and currency stay as they are.");
    saved = await prisma.bankAccount.update({ where: { id }, data: { ...data, kind: input.kind, currency: input.currency.toUpperCase() }, select: { id: true } });
  } else {
    saved = await prisma.bankAccount.create({ data: { companyId, ...data, kind: input.kind, currency: input.currency.toUpperCase(), openingBalance: input.openingBalance ?? 0 }, select: { id: true } });
  }
  if (input.isDefault !== undefined) {
    const settings = await prisma.accountingSettings.findUnique({ where: { companyId }, select: { defaultBankAccountId: true } });
    if (input.isDefault) await prisma.accountingSettings.upsert({ where: { companyId }, update: { defaultBankAccountId: saved.id }, create: { companyId, defaultBankAccountId: saved.id } });
    else if (settings?.defaultBankAccountId === saved.id) await prisma.accountingSettings.update({ where: { companyId }, data: { defaultBankAccountId: null } });
  }
  return saved;
}
