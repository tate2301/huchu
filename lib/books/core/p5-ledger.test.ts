/**
 * P5a against the test database (books-final §3.3 Ledger and Settings, §4.14,
 * §4.15, §8 P5): a manual journal saved as a draft carries no number and is
 * numbered when it posts; one over the second person limit waits To approve
 * and its maker cannot approve it; Reverse is the owner's (or a granted
 * accountant's), never on a document's journal, and leaves an audit event;
 * the trial balance, the general ledger and the accountant export read the
 * same ledger and agree; the freeze holds in an open month; opening balances
 * revised through a mirror; a series' new prefix numbers from 0001.
 */
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { runAccountingSeedPack } from "@/lib/accounting/bootstrap";
import { resolvePostingPeriod } from "@/lib/accounting/period-lock";
import { destroyProvisionedTenant } from "@/lib/platform/tenant-teardown";
import { prisma } from "@/lib/prisma";
import { makeTestShop, type TestShop } from "@/lib/retail/products/test-fixtures";

import { readOpeningBalances } from "../settings-pages";
import { accountantExport, accountantWorkbook } from "./accountant-export";
import type { BooksActor } from "./can-do";
import { accountLedger, trialBalance } from "./ledger";
import { approveManualJournal, JournalRefused, postManualJournal, reverseManualJournal, saveManualJournal } from "./manual-journals";
import { nextNumber, setSeriesPrefix } from "./numbering";
import { postOpeningBalances } from "./opening-balances";

vi.setConfig({ testTimeout: 90_000, hookTimeout: 180_000 });

let shop: TestShop;
let accountantId: string;
const owner = (): BooksActor => ({ companyId: shop.companyId, userId: shop.ownerId, role: "SUPERADMIN" });
const accountant = (): BooksActor => ({ companyId: shop.companyId, userId: accountantId, role: "FINANCE_OFFICER" });
const id = async (code: string) => (await prisma.chartOfAccount.findFirstOrThrow({ where: { companyId: shop.companyId, code }, select: { id: true } })).id;
const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  shop = await makeTestShop("P5 ledger");
  await runAccountingSeedPack({ companyId: shop.companyId, mode: "APPLY" });
  accountantId = (await prisma.user.create({ data: { email: `accountant-${Date.now()}@shop.test`, name: "Rudo Mapfumo", role: "FINANCE_OFFICER", companyId: shop.companyId }, select: { id: true } })).id;
}, 180_000);

afterAll(async () => {
  if (!shop) return;
  const { companyId } = shop;
  await prisma.approvalAction.deleteMany({ where: { companyId } });
  await prisma.openingBalanceImport.deleteMany({ where: { companyId } });
  await prisma.journalLine.deleteMany({ where: { entry: { companyId } } });
  await prisma.journalEntry.updateMany({ where: { companyId }, data: { reversalOfEntryId: null } });
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingSettings.updateMany({ where: { companyId }, data: { freezeBeforeDate: null } });
  await prisma.idSequence.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { id: accountantId } });
  await destroyProvisionedTenant(companyId);
}, 60_000);

describe("manual journals (§4.14)", () => {
  let posted: string;

  it("saves a draft with no number and numbers it when it posts", async () => {
    const draft = await saveManualJournal(accountant(), { date: today(), memo: "Adhesive moved to Pomona", post: false, lines: [{ accountId: await id("5530"), debit: 240, credit: 0 }, { accountId: await id("5100"), debit: 0, credit: 240 }] });
    expect(draft).toMatchObject({ state: "draft", ref: null });
    expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: draft.id } })).entryNumber).toBeLessThanOrEqual(0);
    const done = await postManualJournal(accountant(), draft.id);
    expect(done.state).toBe("posted");
    expect(done.ref).toMatch(/^JE-\d{4}$/);
    posted = draft.id;
  });

  it("sends one over the limit to a second person; its maker cannot approve it", async () => {
    const big = await saveManualJournal(accountant(), { date: today(), memo: "Accrual, fitting labour", post: true, lines: [{ accountId: await id("5200"), debit: 1450, credit: 0 }, { accountId: await id("2100"), debit: 0, credit: 1450 }] });
    expect(big).toMatchObject({ state: "to-approve", ref: null });
    await expect(approveManualJournal(accountant(), big.id)).rejects.toBeInstanceOf(JournalRefused);
    expect((await approveManualJournal(owner(), big.id)).state).toBe("posted");
    const owners = await saveManualJournal(owner(), { date: today(), memo: "Owner's big accrual", post: true, lines: [{ accountId: await id("5200"), debit: 5000, credit: 0 }, { accountId: await id("2100"), debit: 0, credit: 5000 }] });
    expect(owners.state).toBe("posted");
  });

  it("reverses a manual journal for the owner, with an audit event; never a document's", async () => {
    await expect(reverseManualJournal(accountant(), posted, { reason: "Wrong job" })).rejects.toThrow(/owner/);
    const mirror = await reverseManualJournal(owner(), posted, { reason: "Wrong job" });
    expect(mirror.ref).toMatch(/^JE-/);
    expect(await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, eventType: "books.journal.reversed", entityId: posted } })).toBe(1);
    const system = await prisma.journalEntry.create({ data: { companyId: shop.companyId, entryNumber: 9001, entryDate: new Date(), description: "From a bill", status: "POSTED", sourceType: "PURCHASE_BILL", sourceId: "bill-x", createdById: shop.ownerId, lines: { create: [{ accountId: await id("5100"), debit: 10 }, { accountId: await id("2000"), credit: 10 }] } } });
    await expect(reverseManualJournal(owner(), system.id, { reason: "No" })).rejects.toThrow(/document/);
  });
});

describe("the ledger's reports and the accountant export agree (§8 P5)", () => {
  it("balances, and the general ledger and the export read the same figures", async () => {
    const tb = await trialBalance(shop.companyId, { to: today() });
    expect(tb.debit).toBe(tb.credit);
    const materials = tb.rows.find((row) => row.code === "5530");
    expect(materials, JSON.stringify(materials)).toBeUndefined(); // posted then reversed: nets to nothing
    const wages = tb.rows.find((row) => row.code === "5200");
    expect(wages?.debit).toBe(6450);
    const book = await accountLedger(shop.companyId, await id("5200"), { from: today(), to: today() });
    expect(book.closing).toBe(6450);
    const exported = await accountantExport(shop.companyId, { from: `${today().slice(0, 4)}-01-01`, to: today() });
    expect(exported.trialBalance).toEqual(tb);
    expect(exported.generalLedger.some((row) => row.code === "5200" && row.balance === 6450)).toBe(true);
    const book2 = new ExcelJS.Workbook();
    await book2.xlsx.load((await accountantWorkbook(exported)) as unknown as ArrayBuffer);
    expect(book2.worksheets.map((sheet) => sheet.name)).toEqual(["Trial balance", "General ledger", "Profit and loss", "Balance sheet", "Cash flow"]);
  });
});

describe("Settings", () => {
  it("holds the freeze in an open month (§4.15)", async () => {
    await prisma.accountingSettings.update({ where: { companyId: shop.companyId }, data: { freezeBeforeDate: new Date(`${today()}T00:00:00.000Z`) } });
    const decision = await resolvePostingPeriod({ companyId: shop.companyId, entryDate: new Date(`${today()}T00:00:00.000Z`), actorRole: "FINANCE_OFFICER" });
    expect(decision.allowed).toBe(false);
    await prisma.accountingSettings.update({ where: { companyId: shop.companyId }, data: { freezeBeforeDate: null } });
  });

  it("revises the opening balances through a mirror, keeping the old ones in the audit trail", async () => {
    const day = `${today().slice(0, 4)}-01-01`;
    await postOpeningBalances(owner(), { date: day, lines: [{ accountId: await id("1010"), debit: 500, credit: 0 }, { accountId: await id("3100"), debit: 0, credit: 500 }] });
    await expect(postOpeningBalances(owner(), { date: day, lines: [{ accountId: await id("1010"), debit: 800, credit: 0 }, { accountId: await id("3100"), debit: 0, credit: 800 }] })).rejects.toThrow(/why/);
    await postOpeningBalances(owner(), { date: day, reason: "The accountant's final figures", lines: [{ accountId: await id("1010"), debit: 800, credit: 0 }, { accountId: await id("3100"), debit: 0, credit: 800 }] });
    const opening = await readOpeningBalances(prisma, shop.companyId);
    expect(opening.debit).toBe(800);
    expect(await prisma.platformAuditEvent.count({ where: { companyId: shop.companyId, eventType: "books.opening-balances.revised" } })).toBe(1);
    const tb = await trialBalance(shop.companyId, { to: today() });
    expect(tb.rows.find((row) => row.code === "3100")?.credit).toBe(800);
  });

  it("numbers a series from 0001 under its new prefix, once its day has come", async () => {
    const before = await nextNumber(prisma, shop.companyId, "invoice");
    expect(before).toMatch(/^INV-\d{4}$/);
    await setSeriesPrefix(prisma, shop.companyId, "SALES_INVOICE", "INV-27-", today());
    expect(await nextNumber(prisma, shop.companyId, "invoice")).toBe("INV-27-0001");
    expect(await nextNumber(prisma, shop.companyId, "invoice")).toBe("INV-27-0002");
  });
});
