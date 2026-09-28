/**
 * Reversing a posted journal by hand, against a real database.
 *
 * What changed, and why it is pinned: the reverse route used to mark the
 * original REVERSED and post its mirror as POSTED. Every ledger report counts
 * POSTED entries only, so the original dropped out *and* its mirror counted —
 * the accounts moved by twice the amount, the wrong way, while the trial
 * balance still agreed with itself. The original now stays POSTED and is
 * stamped `reversedAt`, the way the period-reopen reversal already did it, so
 * the pair nets to nothing in the reports.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { ensureAccountingDefaults } from "@/lib/accounting/bootstrap";
import { getTrialBalance } from "@/lib/accounting/ledger";
import { JournalReversalError, reverseJournalEntry, salesInvoicePostingKey } from "@/lib/accounting/journals";

const SLUG = "accounting-journal-reversal-test";
const EMAIL = "accounting-journal-reversal-test@example.invalid";

let companyId: string;
let userId: string;
let cashId: string;
let revenueId: string;

async function clear() {
  await prisma.journalEntry.deleteMany({ where: { companyId } });
  await prisma.accountingPeriod.updateMany({ where: { companyId }, data: { status: "OPEN" } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Journal Reversal Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Nyasha Ledger", companyId, role: "MANAGER" },
  });
  userId = user.id;

  await ensureAccountingDefaults(companyId);
  const accounts = await prisma.chartOfAccount.findMany({
    where: { companyId, code: { in: ["1010", "4000"] } },
    select: { id: true, code: true },
  });
  cashId = accounts.find((account) => account.code === "1010")!.id;
  revenueId = accounts.find((account) => account.code === "4000")!.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.user.deleteMany({ where: { companyId } });
  // The seeded chart refuses a cascading delete; the fixed slug is reused.
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
});

/** A cash sale of 250.00, posted by hand. */
async function postedSale(status: "POSTED" | "DRAFT" = "POSTED") {
  const last = await prisma.journalEntry.findFirst({
    where: { companyId },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  return prisma.journalEntry.create({
    data: {
      companyId,
      entryNumber: (last?.entryNumber ?? 0) + 1,
      entryDate: new Date(),
      description: "Cash sale",
      status,
      createdById: userId,
      lines: {
        create: [
          { accountId: cashId, debit: 250, credit: 0, memo: "Till" },
          { accountId: revenueId, debit: 0, credit: 250, memo: "Sale" },
        ],
      },
    },
  });
}

function reverse(entryId: string) {
  return prisma.$transaction((tx) =>
    reverseJournalEntry(tx, { companyId, entryId, actorId: userId, reason: "keyed twice" }),
  );
}

async function balance(code: string) {
  const trial = await getTrialBalance({ companyId });
  return trial.rows.find((row) => row.code === code)?.balance ?? 0;
}

describe("reversing a posted entry", () => {
  it("posts the mirror and nets the pair to nothing in the reports", async () => {
    const sale = await postedSale();
    expect(await balance("1010")).toBeCloseTo(250, 2);

    const mirror = await reverse(sale.id);

    expect(mirror.status).toBe("POSTED");
    expect(mirror.reversalOfEntryId).toBe(sale.id);
    expect(mirror.description).toBe(`Reversal of JE-${sale.entryNumber} (keyed twice)`);
    expect(mirror.lines.find((line) => line.accountId === cashId)).toMatchObject({ debit: 0, credit: 250 });
    expect(mirror.lines.find((line) => line.accountId === revenueId)).toMatchObject({ debit: 250, credit: 0 });

    // The original is still a fact on the books, marked as cancelled.
    const original = await prisma.journalEntry.findUniqueOrThrow({ where: { id: sale.id } });
    expect(original.status).toBe("POSTED");
    expect(original.reversedAt).not.toBeNull();
    expect(original.reversedById).toBe(userId);

    // Not -250: a double reversal would still balance, and still be wrong.
    expect(await balance("1010")).toBeCloseTo(0, 2);
    expect(await balance("4000")).toBeCloseTo(0, 2);
    const trial = await getTrialBalance({ companyId });
    expect(trial.totals.debit).toBeCloseTo(trial.totals.credit, 2);
  });

  it("refuses to reverse the same entry twice", async () => {
    const sale = await postedSale();
    await reverse(sale.id);
    await expect(reverse(sale.id)).rejects.toThrow("already reversed");
  });

  it("refuses a draft", async () => {
    const draft = await postedSale("DRAFT");
    await expect(reverse(draft.id)).rejects.toThrow("Only posted journal entries can be reversed");
  });

  it("refuses a closed period, and says so in a way a route can hand back", async () => {
    const sale = await postedSale();
    await prisma.accountingPeriod.updateMany({
      where: { companyId, startDate: { lte: new Date() }, endDate: { gte: new Date() } },
      data: { status: "CLOSED" },
    });
    const attempt = reverse(sale.id);
    await expect(attempt).rejects.toBeInstanceOf(JournalReversalError);
    await expect(attempt).rejects.toMatchObject({ status: 400, code: "PERIOD_OVERRIDE_FORBIDDEN" });
    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(1);
  });

  it("refuses an entry from another tenant as not found", async () => {
    const sale = await postedSale();
    await expect(
      prisma.$transaction((tx) =>
        reverseJournalEntry(tx, { companyId: "another-company", entryId: sale.id, actorId: userId }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("the key a sales invoice posts under", () => {
  it("is the invoice's own id until it is edited", () => {
    expect(salesInvoicePostingKey({ id: "inv-1", revision: 0 })).toBe("inv-1");
  });

  it("is a key of its own for each edit", () => {
    expect(salesInvoicePostingKey({ id: "inv-1", revision: 1 })).toBe("inv-1:revision-1");
    expect(salesInvoicePostingKey({ id: "inv-1", revision: 2 })).toBe("inv-1:revision-2");
  });
});
