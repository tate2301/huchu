import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { addLookupOption, searchLookup, type LookupCtx } from "./index";

/**
 * Buying's money nouns (40-buying 4.5, BUY-04) against the test database:
 * `money account` (cash first, the balance or the last four; the quick add
 * reads "Cash, bank or mobile" and puts it in 1005, 1010 or 1016) and
 * `expense type` (the quick add's Account matched to an expense account by
 * code or name, empty meaning 5590).
 */

const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let companyId: string;
let userId: string;

const as = (role: string): LookupCtx => ({ companyId, userId, userName: "Tendai Mhlanga", session: { user: { role } } });

beforeAll(async () => {
  companyId = (await prisma.company.create({ data: { name: `Money lookups ${stamp}`, slug: `money-lookups-${stamp}` }, select: { id: true } })).id;
  userId = (
    await prisma.user.create({ data: { companyId, name: "Tendai Mhlanga", role: "SUPERADMIN", email: `owner-${stamp}@money-lookups.test` }, select: { id: true } })
  ).id;
  await prisma.chartOfAccount.createMany({
    data: [
      { companyId, code: "1005", name: "Cash Vault", type: "ASSET" },
      { companyId, code: "1010", name: "Operating Bank", type: "ASSET" },
      { companyId, code: "1016", name: "Mobile Money Clearing", type: "ASSET" },
      { companyId, code: "5300", name: "Maintenance Expense", type: "EXPENSE" },
      { companyId, code: "5590", name: "Sundry Expenses", type: "EXPENSE" },
    ],
  });
  await prisma.bankAccount.create({ data: { companyId, name: "CBZ current account", kind: "BANK", accountNumber: "0112 3344 4471" } });
  const safe = await prisma.bankAccount.create({ data: { companyId, name: "Office safe", kind: "CASH", openingBalance: 2000 }, select: { id: true } });
  await prisma.bankTransaction.create({ data: { companyId, bankAccountId: safe.id, txnDate: new Date(), description: "In", amount: 410, direction: "DEBIT" } });
});

afterAll(async () => {
  if (!companyId) return;
  await prisma.bankTransaction.deleteMany({ where: { companyId } });
  await prisma.bankAccount.deleteMany({ where: { companyId } });
  await prisma.retailExpenseType.deleteMany({ where: { companyId } });
  await prisma.chartOfAccount.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { id: companyId } });
});

describe("the money account noun", () => {
  it("offers cash first with its balance, and a bank account by its last four, to a cashier too", async () => {
    const answer = await searchLookup(as("CASHIER"), "money account", {});
    expect(answer.status).toBe(200);
    if (answer.status !== 200) return;
    expect(answer.body.options.map((option) => [option.label, option.sub])).toEqual([
      ["Office safe", "US$2,410.00"],
      ["CBZ current account", "•••• 4471"],
    ]);
  });

  it("adds one by kind into its ledger account, for an owner or a manager only", async () => {
    const answer = await addLookupOption(as("MANAGER"), "money account", { name: "EcoCash merchant", kind: "Mobile" });
    expect(answer.status).toBe(201);
    if (answer.status !== 201) return;
    const account = await prisma.bankAccount.findUniqueOrThrow({ where: { id: answer.body.option.id }, include: { ledgerAccount: { select: { code: true } } } });
    expect(account).toMatchObject({ kind: "MOBILE", currency: "USD" });
    expect(account.ledgerAccount?.code).toBe("1016");
    const cash = await addLookupOption(as("SUPERADMIN"), "money account", { name: "Back float", kind: "" });
    expect(cash.status).toBe(201);
    if (cash.status === 201) expect(cash.body.option.sub).toBe("US$0.00");
    expect((await addLookupOption(as("SUPERADMIN"), "money account", { name: "Odd", kind: "crypto" })).status).toBe(400);
    expect((await addLookupOption(as("CASHIER"), "money account", { name: "Till 2", kind: "Cash" })).status).toBe(403);
  });
});

describe("the expense type noun", () => {
  it("adds one on the expense account named by code or name, or Other expenses when empty", async () => {
    const byName = await addLookupOption(as("SUPERADMIN"), "expense type", { name: "Security", account: "maintenance expense" });
    expect(byName.status).toBe(201);
    if (byName.status === 201) expect(byName.body.option.sub).toBe("5300 Maintenance Expense");
    const empty = await addLookupOption(as("SUPERADMIN"), "expense type", { name: "Sundries", account: "" });
    expect(empty.status).toBe(201);
    if (empty.status === 201) expect(empty.body.option.sub).toBe("5590 Sundry Expenses");
    const missing = await addLookupOption(as("SUPERADMIN"), "expense type", { name: "Rent", account: "Expenses" });
    expect(missing).toMatchObject({ status: 400, body: { fieldErrors: { account: "There is no expense account called Expenses." } } });
  });

  it("lists the live types for anyone who asks for money", async () => {
    const answer = await searchLookup(as("STOCK_CLERK"), "expense type", { q: "sec" });
    expect(answer.status).toBe(200);
    if (answer.status === 200) expect(answer.body.options.map((option) => option.label)).toEqual(["Security"]);
  });
});
