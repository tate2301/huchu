/**
 * S-2.3 — school money posts under its own source types, and every entry balances.
 *
 * Before this, a fee invoice posted as `SALES_INVOICE` and credited "Retail
 * Sales Revenue"; a bursary posted as `SALES_WRITE_OFF` and was charged to "Bad
 * Debt Expense" beside genuinely uncollectable fees; and a receipt credited the
 * whole amount to receivables whether or not any invoice claimed it, so a
 * family that paid a term ahead showed as owing a negative balance rather than
 * the school owing them money.
 *
 * The assertion that matters most is the dullest one: debits equal credits. The
 * posting engine tolerates a cent of drift (`BALANCE_TOLERANCE`), which means a
 * rule that splits one amount across two lines through two separate currency
 * conversions can write a *lopsided* entry rather than failing loudly. Every
 * entry these tests produce is checked for exact equality, not tolerance.
 *
 * Prerequisites: a real Postgres DATABASE_URL with the migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma, WorkspaceProfile } from "@corelithzw/db";
import { prisma } from "@corelithzw/db/client";
import { ensureAccountingDefaults, getAccountingSetupReadiness } from "@/lib/accounting/bootstrap";
import { SCHOOLS_REQUIRED_SOURCE_TYPES } from "@/lib/accounting/source-types";
import {
  emitSchoolFeeAccountingEvent,
  type SchoolFeeAccountingEventType,
} from "./_helpers";

let companyId: string;
let retailCompanyId: string;
let actorId: string;
let stamp: number;

beforeAll(async () => {
  await prisma.$connect();
  stamp = Date.now();

  const company = await prisma.company.create({
    data: {
      name: `Fee Ledger School ${stamp}`,
      slug: `fee-ledger-${stamp}`,
      workspaceProfile: WorkspaceProfile.SCHOOLS,
    },
  });
  companyId = company.id;

  const retail = await prisma.company.create({
    data: {
      name: `Fee Ledger Shop ${stamp}`,
      slug: `fee-ledger-shop-${stamp}`,
      // No profile and no features: the ordinary non-school tenant, and the
      // one whose readiness must not be dragged down by school posting rules
      // it will never need.
    },
  });
  retailCompanyId = retail.id;

  const actor = await prisma.user.create({
    data: {
      companyId,
      email: `bursar-${stamp}@fee-ledger.test`,
      name: "Bursar",
      role: "BURSAR",
    },
    select: { id: true },
  });
  actorId = actor.id;

  // The same call `provisionSchool` now makes. Without it the first receipt
  // resolves no rule and comes back FAILED with POSTING_RULE_MISSING.
  await ensureAccountingDefaults(companyId);
});

afterAll(async () => {
  await prisma.company.delete({ where: { id: companyId } }).catch(() => {});
  await prisma.company.delete({ where: { id: retailCompanyId } }).catch(() => {});
  await prisma.$disconnect();
});

type Posted = {
  sourceId: string;
  entryId: string;
  lines: Array<{ code: string; debit: number; credit: number }>;
  totalDebit: number;
  totalCredit: number;
};

async function post(input: {
  eventType: SchoolFeeAccountingEventType;
  key: string;
  amount: number | Prisma.Decimal;
  netAmount?: number | Prisma.Decimal;
  taxAmount?: number | Prisma.Decimal;
  allocatedAmount?: number | Prisma.Decimal;
  creditSource?: "RECEIPT" | "INVOICE";
  invertDirection?: boolean;
  entryDate?: Date;
  actorRole?: string | null;
}) {
  return emitSchoolFeeAccountingEvent({
    companyId,
    actorId,
    eventType: input.eventType,
    sourceId: input.key,
    sourceRef: input.key,
    entryDate: input.entryDate ?? new Date(),
    amount: input.amount,
    netAmount: input.netAmount ?? input.amount,
    taxAmount: input.taxAmount ?? 0,
    grossAmount: input.amount,
    currency: "USD",
    allocatedAmount: input.allocatedAmount,
    creditSource: input.creditSource,
    invertDirection: input.invertDirection,
    actorRole: input.actorRole,
  });
}

async function readEntry(entryId: string): Promise<Posted> {
  const entry = await prisma.journalEntry.findUniqueOrThrow({
    where: { id: entryId },
    select: {
      id: true,
      sourceId: true,
      lines: {
        select: {
          debit: true,
          credit: true,
          account: { select: { code: true } },
        },
      },
    },
  });

  const lines = entry.lines.map((line) => ({
    code: line.account.code,
    debit: Number(line.debit),
    credit: Number(line.credit),
  }));

  return {
    sourceId: entry.sourceId ?? "",
    entryId: entry.id,
    lines,
    totalDebit: lines.reduce((sum, line) => sum + line.debit, 0),
    totalCredit: lines.reduce((sum, line) => sum + line.credit, 0),
  };
}

/** Post an event and read back the entry it wrote, insisting that it wrote one. */
async function postAndRead(input: Parameters<typeof post>[0]): Promise<Posted> {
  const result = await post(input);
  expect(result.accountingError, `${input.eventType} failed to post`).toBeNull();
  expect(result.accountingStatus).toBe("POSTED");
  expect(result.journalEntryId).toBeTruthy();
  return readEntry(result.journalEntryId!);
}

function debitOn(entry: Posted, code: string) {
  return entry.lines.filter((line) => line.code === code).reduce((sum, line) => sum + line.debit, 0);
}

function creditOn(entry: Posted, code: string) {
  return entry.lines.filter((line) => line.code === code).reduce((sum, line) => sum + line.credit, 0);
}

describe("the seeded pack gives a school what it needs to post", () => {
  it("seeds the school chart of accounts", async () => {
    const accounts = await prisma.chartOfAccount.findMany({
      where: { companyId, code: { in: ["1110", "2400", "4300", "4310", "5610"] } },
      select: { code: true, name: true, type: true },
      orderBy: { code: "asc" },
    });

    expect(accounts.map((account) => account.code)).toEqual([
      "1110",
      "2400",
      "4300",
      "4310",
      "5610",
    ]);
    // The one that decides whether a bursary is a gift or a bad debt.
    expect(accounts.find((account) => account.code === "5610")?.type).toBe("EXPENSE");
    expect(accounts.find((account) => account.code === "2400")?.type).toBe("LIABILITY");
  });

  it("seeds one active posting rule for every required source type", async () => {
    const rules = await prisma.postingRule.findMany({
      where: { companyId, sourceType: { in: SCHOOLS_REQUIRED_SOURCE_TYPES }, isActive: true },
      select: { sourceType: true },
    });

    const covered = new Set(rules.map((rule) => rule.sourceType));
    for (const sourceType of SCHOOLS_REQUIRED_SOURCE_TYPES) {
      expect(covered.has(sourceType), `no rule seeded for ${sourceType}`).toBe(true);
    }
  });

  it("does not seed school accounts or rules on a shop", async () => {
    await ensureAccountingDefaults(retailCompanyId);

    const schoolAccounts = await prisma.chartOfAccount.count({
      where: { companyId: retailCompanyId, code: { in: ["1110", "2400", "4300", "5610"] } },
    });
    const schoolRules = await prisma.postingRule.count({
      where: { companyId: retailCompanyId, sourceType: { in: SCHOOLS_REQUIRED_SOURCE_TYPES } },
    });

    expect(schoolAccounts).toBe(0);
    expect(schoolRules).toBe(0);
  });
});

describe("readiness reports the school contract", () => {
  it("reports every school rule as configured, and adds a check row", async () => {
    const readiness = await getAccountingSetupReadiness(companyId);

    expect(readiness.schoolRules).toHaveLength(SCHOOLS_REQUIRED_SOURCE_TYPES.length);
    expect(readiness.schoolRules.every((rule) => rule.configured)).toBe(true);

    const check = readiness.checks.find((row) => row.id === "schools-rules");
    expect(check).toBeDefined();
    expect(check?.ready).toBe(true);
    expect(check?.note).toContain("7/7");
  });

  it("says nothing about school rules on a shop", async () => {
    const readiness = await getAccountingSetupReadiness(retailCompanyId);

    // A retail tenant's readiness percentage must not fall because it has no
    // school posting rules — so the row is absent, not failing.
    expect(readiness.schoolRules).toEqual([]);
    expect(readiness.checks.some((row) => row.id === "schools-rules")).toBe(false);
  });
});

describe("each school fee document posts a balanced entry to the right accounts", () => {
  it("an issued invoice bills the family and recognises fee revenue", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_INVOICE_ISSUED",
      key: `inv-${stamp}`,
      amount: 1000,
      netAmount: 900,
      taxAmount: 100,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "1110")).toBeCloseTo(1000, 6);
    // Not 4000 "Retail Sales Revenue", which is where tuition used to land.
    expect(creditOn(entry, "4300")).toBeCloseTo(900, 6);
    expect(creditOn(entry, "2200")).toBeCloseTo(100, 6);
    expect(creditOn(entry, "4000")).toBe(0);
  });

  it("a receipt that settles a bill in full credits only the receivable", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key: `rct-full-${stamp}`,
      amount: 500,
      allocatedAmount: 500,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "1010")).toBeCloseTo(500, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(500, 6);
    // A zero line is dropped rather than written, so a school that never
    // over-collects never sees the deferred income account at all.
    expect(entry.lines.some((line) => line.code === "2400")).toBe(false);
  });

  it("a receipt with a surplus parks the surplus as a liability, not a negative receivable", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key: `rct-over-${stamp}`,
      amount: 600,
      allocatedAmount: 450,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "1010")).toBeCloseTo(600, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(450, 6);
    expect(creditOn(entry, "2400")).toBeCloseTo(150, 6);
  });

  it("a receipt allocated to nothing is entirely the school's to give back", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key: `rct-advance-${stamp}`,
      amount: 300,
      allocatedAmount: 0,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(creditOn(entry, "2400")).toBeCloseTo(300, 6);
    expect(entry.lines.some((line) => line.code === "1110")).toBe(false);
  });

  it("a void reverses the receipt line for line", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_VOIDED",
      key: `rct-over-${stamp}`,
      amount: 600,
      allocatedAmount: 450,
      invertDirection: true,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(creditOn(entry, "1010")).toBeCloseTo(600, 6);
    expect(debitOn(entry, "1110")).toBeCloseTo(450, 6);
    expect(debitOn(entry, "2400")).toBeCloseTo(150, 6);
  });

  it("applying a credit moves it out of deferred income and settles the bill", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_CREDIT_APPLIED",
      key: `credit-${stamp}:150.00`,
      amount: 150,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "2400")).toBeCloseTo(150, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(150, 6);
    // No cash moves when a family spends money the school already holds.
    expect(entry.lines.some((line) => line.code === "1010")).toBe(false);
  });

  it("a bursary is an expense the school chose, not a debt it failed to collect", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_WAIVER_APPLIED",
      key: `waiver-${stamp}`,
      amount: 200,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "5610")).toBeCloseTo(200, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(200, 6);
    // The whole point of splitting the two: a scholarship must not read as bad
    // debt on the income statement.
    expect(entry.lines.some((line) => line.code === "5600")).toBe(false);
  });

  it("a write-off is bad debt", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_WRITEOFF_POSTED",
      key: `writeoff-${stamp}`,
      amount: 75,
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "5600")).toBeCloseTo(75, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(75, 6);
    expect(entry.lines.some((line) => line.code === "5610")).toBe(false);
  });

  it("a refund of a receipt surplus draws on deferred income", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_REFUND_PAID",
      key: `refund-receipt-${stamp}`,
      amount: 150,
      creditSource: "RECEIPT",
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "2400")).toBeCloseTo(150, 6);
    expect(creditOn(entry, "1010")).toBeCloseTo(150, 6);
    expect(entry.lines.some((line) => line.code === "1110")).toBe(false);
  });

  it("a refund of an over-settled invoice draws on the receivable instead", async () => {
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_REFUND_PAID",
      key: `refund-invoice-${stamp}`,
      amount: 90,
      creditSource: "INVOICE",
    });

    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
    expect(debitOn(entry, "1110")).toBeCloseTo(90, 6);
    expect(creditOn(entry, "1010")).toBeCloseTo(90, 6);
    expect(entry.lines.some((line) => line.code === "2400")).toBe(false);
  });
});

describe("nothing this school posts can be lopsided", () => {
  it("balances every journal entry written by these tests, to the cent and not to a tolerance", async () => {
    const entries = await prisma.journalEntry.findMany({
      where: { companyId },
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        lines: { select: { debit: true, credit: true } },
      },
    });

    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const debit = entry.lines.reduce(
        (sum, line) => sum.plus(new Prisma.Decimal(line.debit.toString())),
        new Prisma.Decimal(0),
      );
      const credit = entry.lines.reduce(
        (sum, line) => sum.plus(new Prisma.Decimal(line.credit.toString())),
        new Prisma.Decimal(0),
      );
      // `.equals`, not `toBeCloseTo`: the posting engine would have accepted a
      // cent of drift, and a ledger that is a cent out is a ledger that is out.
      expect(
        debit.equals(credit),
        `${entry.sourceType} ${entry.sourceId ?? ""} is ${debit.toFixed(2)} / ${credit.toFixed(2)}`,
      ).toBe(true);
    }
  });

  it("balances a split that two separate currency conversions would not", async () => {
    // 100 ZWG at 3.00 is 33.33 in base. Converting a 50/50 split separately
    // gives 16.67 and 16.67 — 33.34, a cent more than the debit. The surplus is
    // derived from the total instead, so this can never happen.
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key: `rct-fx-${stamp}`,
      amount: new Prisma.Decimal("33.33"),
      allocatedAmount: new Prisma.Decimal("16.67"),
    });

    expect(debitOn(entry, "1010")).toBeCloseTo(33.33, 6);
    expect(creditOn(entry, "1110")).toBeCloseTo(16.67, 6);
    expect(creditOn(entry, "2400")).toBeCloseTo(16.66, 6);
    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
  });

  it("never credits more to the receivable than the receipt was worth", async () => {
    // A caller that hands over an allocated figure larger than the amount would
    // otherwise write a credit bigger than the debit.
    const entry = await postAndRead({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key: `rct-clamped-${stamp}`,
      amount: 100,
      allocatedAmount: 250,
    });

    expect(creditOn(entry, "1110")).toBeCloseTo(100, 6);
    expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 6);
  });
});

describe("posting twice does not pay twice", () => {
  it("returns the first entry rather than writing a second", async () => {
    const key = `rct-idem-${stamp}`;
    const first = await post({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key,
      amount: 400,
      allocatedAmount: 400,
    });
    const second = await post({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key,
      amount: 400,
      allocatedAmount: 400,
    });

    expect(first.accountingStatus).toBe("POSTED");
    expect(second.accountingStatus).toBe("POSTED");
    expect(second.journalEntryId).toBe(first.journalEntryId);

    const entries = await prisma.journalEntry.count({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${key}` },
    });
    expect(entries).toBe(1);
  });

  it("keeps a receipt and its void apart even though both name the same receipt", async () => {
    const key = `rct-pair-${stamp}`;
    await post({ eventType: "SCHOOL_FEE_RECEIPT_POSTED", key, amount: 120, allocatedAmount: 120 });
    await post({
      eventType: "SCHOOL_FEE_RECEIPT_VOIDED",
      key,
      amount: 120,
      allocatedAmount: 120,
      invertDirection: true,
    });

    const entries = await prisma.journalEntry.findMany({
      where: { companyId, sourceId: { in: [`SCHOOL_FEE_RECEIPT:${key}`, `SCHOOL_FEE_RECEIPT_VOID:${key}`] } },
      select: { sourceType: true, sourceId: true },
      orderBy: { sourceId: "asc" },
    });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.sourceType).sort()).toEqual([
      "SCHOOL_FEE_RECEIPT",
      "SCHOOL_FEE_RECEIPT_VOID",
    ]);
  });

  it("gives each application of the same credit its own entry", async () => {
    // The receipt id alone would make the second application look like a
    // duplicate of the first and be silently swallowed. The running allocated
    // total is what distinguishes them, which is what the allocate route sends.
    const receipt = `credit-twice-${stamp}`;
    await post({ eventType: "SCHOOL_FEE_CREDIT_APPLIED", key: `${receipt}:50.00`, amount: 50 });
    await post({ eventType: "SCHOOL_FEE_CREDIT_APPLIED", key: `${receipt}:90.00`, amount: 40 });

    const entries = await prisma.journalEntry.count({
      where: { companyId, sourceType: "SCHOOL_FEE_CREDIT_APPLIED", sourceId: { startsWith: `SCHOOL_FEE_CREDIT:${receipt}` } },
    });
    expect(entries).toBe(2);
  });
});

describe("a closed period holds the entry rather than losing it", () => {
  it("comes back PENDING, writes no entry, and leaves the event to be replayed", async () => {
    // Two months back, so it cannot collide with the periods the seed pack
    // opens for this month and next.
    const entryDate = new Date();
    entryDate.setMonth(entryDate.getMonth() - 2);
    entryDate.setDate(15);

    const startDate = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1);
    const endDate = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0);
    await prisma.accountingPeriod.create({
      data: { companyId, startDate, endDate, status: "CLOSED" },
    });

    const key = `rct-locked-${stamp}`;
    const result = await post({
      eventType: "SCHOOL_FEE_RECEIPT_POSTED",
      key,
      amount: 250,
      allocatedAmount: 250,
      entryDate,
      // A bursar is not a period-override role, which is the ordinary case for
      // a receipt taken after month end.
      actorRole: "BURSAR",
    });

    expect(result.accountingStatus).toBe("PENDING");
    expect(result.journalEntryId).toBeNull();
    expect(result.accountingError).toBeTruthy();

    const entries = await prisma.journalEntry.count({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${key}` },
    });
    expect(entries).toBe(0);

    // The integration event survives with a retry time, which is what the
    // replay endpoint and `pnpm platform:accounting-replay` drain.
    const event = await prisma.accountingIntegrationEvent.findFirstOrThrow({
      where: { companyId, sourceId: `SCHOOL_FEE_RECEIPT:${key}` },
      select: { status: true, nextRetryAt: true },
    });
    expect(event.status).toBe("FAILED");
    expect(event.nextRetryAt).not.toBeNull();
  });
});
