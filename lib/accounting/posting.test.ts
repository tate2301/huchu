/**
 * `EVENT_ACCOUNT` lines (BUY-05), against the test database: a line posts to
 * the account the event names in its payload's `accounts`, with the same
 * checks as a fixed line (active, a ledger), and an event that names none
 * waits, PENDING, to be tried again (`EVENT_ACCOUNT_MISSING`).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { createJournalEntryFromSource, type PostingContext } from "@/lib/accounting/posting";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";

let companyId: string;
let ownerId: string;
const accounts = new Map<string, string>();
let n = 0;

/**
 * A petty cash voucher of 85.00 to an account of its own, naming the accounts
 * it is given: the expense, and the float it was paid from. (A shop's expense
 * payout named its expense account until P2; it goes to 1150 Cash advances now.)
 */
const payout = (named: Record<string, string | null>): PostingContext => {
  n += 1;
  return {
    companyId,
    sourceType: "PETTY_CASH_VOUCHER",
    sourceId: `pcv-${n}-${Date.now()}`,
    sourceSubtype: "ACCOUNT",
    entryDate: new Date(),
    description: `REQ-${String(n).padStart(4, "0")} · CoolTech Repairs`,
    createdById: ownerId,
    amount: 85,
    currency: "USD",
    payload: { accounts: named },
  };
};

const linesOf = async (entryId: string) =>
  (await prisma.journalLine.findMany({ where: { entryId }, select: { debit: true, credit: true, account: { select: { code: true } } } }))
    .map((line) => `${line.account.code} ${line.debit > 0 ? `D ${line.debit}` : `C ${line.credit}`}`)
    .sort();

beforeAll(async () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  companyId = (await prisma.company.create({ data: { name: `Event accounts ${stamp}`, slug: `event-accounts-${stamp}` }, select: { id: true } })).id;
  ownerId = (await prisma.user.create({ data: { email: `owner-${stamp}@shop.test`, name: "Tendai Mhlanga", role: "SUPERADMIN", companyId }, select: { id: true } })).id;
  await runAccountingSeedPack({ companyId, mode: "APPLY" });
  // Posted at once, not left for the day's run.
  await prisma.retailPostingSettings.create({ data: { companyId, schedule: "EVERY_SALE" } });
  for (const row of await prisma.chartOfAccount.findMany({ where: { companyId }, select: { id: true, code: true } })) accounts.set(row.code, row.id);
}, 60_000);

afterAll(async () => {
  if (!companyId) return;
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingIntegrationEvent.deleteMany({ where: { companyId } });
  await destroyProvisionedTenant(companyId);
});

describe("a line that posts to the account the event names", () => {
  it("posts to the expense and money accounts given", async () => {
    const result = await createJournalEntryFromSource(payout({ moneyAccount: accounts.get("1005")!, expenseAccount: accounts.get("5300")! }));
    expect(result.entryId).toBeTruthy();
    expect(await linesOf(result.entryId!)).toEqual(["1005 C 85", "5300 D 85"]);
  });

  it("refuses an account that is not active, as a fixed line would", async () => {
    const stamp = Date.now() % 100000;
    const closed = await prisma.chartOfAccount.create({
      data: { companyId, code: `59${stamp}`, name: "Old repairs", type: "EXPENSE", isActive: false },
      select: { id: true },
    });
    const result = await createJournalEntryFromSource(payout({ moneyAccount: accounts.get("1005")!, expenseAccount: closed.id }));
    expect(result).toMatchObject({ code: "POSTING_RULE_INVALID_ACCOUNTS" });
  });

  it("refuses a group that is not a ledger", async () => {
    const stamp = Date.now() % 100000;
    const group = await prisma.chartOfAccount.create({
      data: { companyId, code: `58${stamp}`, name: "Repairs group", type: "EXPENSE", nodeType: "GROUP" },
      select: { id: true },
    });
    const result = await createJournalEntryFromSource(payout({ moneyAccount: accounts.get("1005")!, expenseAccount: group.id }));
    expect(result).toMatchObject({ code: "POSTING_RULE_INVALID_ACCOUNTS" });
  });

  it("leaves an event that names no account PENDING, to be tried again", async () => {
    const context = payout({ moneyAccount: accounts.get("1005")!, expenseAccount: null });
    const result = await createJournalEntryFromSource(context);
    expect(result).toMatchObject({ code: "EVENT_ACCOUNT_MISSING" });
    const event = await prisma.accountingIntegrationEvent.findFirstOrThrow({ where: { companyId, sourceId: context.sourceId } });
    expect(event.status).toBe("PENDING");
    expect(event.nextRetryAt).not.toBeNull();
    expect(await prisma.journalEntry.count({ where: { companyId, sourceId: context.sourceId } })).toBe(0);
  });

  it("does not take another company's account", async () => {
    const other = await prisma.chartOfAccount.findFirst({ where: { companyId: { not: companyId }, code: "5300" }, select: { id: true } });
    if (!other) return;
    const result = await createJournalEntryFromSource(payout({ moneyAccount: accounts.get("1005")!, expenseAccount: other.id }));
    expect(result).toMatchObject({ code: "EVENT_ACCOUNT_MISSING" });
  });
});
