/**
 * `addCostEntry` — the only way a line of field money is written — against a
 * real database.
 *
 * Three callers write through it: the cost tracker, a requisition's report and
 * a project's "Add spend". What makes them one ledger rather than three is
 * that every line lands on its author's log for the day it names, opened on
 * the first line and reused after. So that is what is pinned, with the two
 * refusals that keep a day checkable: nothing on a day not yet lived, and
 * nothing added to a day already submitted.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import { CostEntryError, addCostEntry, submitDailyLog, toLogDate } from "@/lib/crm/daily-log";

const SLUG = "daily-log-test";
const EMAIL = "daily-log-test@example.invalid";

let companyId: string;
let userId: string;

/** Fixed "now", so the suite cannot answer differently at midnight. */
const NOW = new Date("2026-09-24T14:00:00.000Z");
const TUESDAY = new Date("2026-09-22T00:00:00.000Z");

const line = {
  direction: "SPENT" as const,
  category: "FUEL" as const,
  amount: 40,
  currency: "USD",
  description: "Diesel",
};

async function clear() {
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId } });
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Daily Log Test", slug: SLUG },
  });
  companyId = company.id;
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Farai Field", companyId, role: "SALES_REP" },
  });
  userId = user.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("writing a line of money", () => {
  it("opens the person's log for the day when it is the first line on it", async () => {
    const entry = await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...line, companyId, userId, now: NOW }),
    );

    const log = await prisma.crmDailyLog.findUniqueOrThrow({ where: { id: entry.logId } });
    expect(log.userId).toBe(userId);
    expect(log.logDate.toISOString()).toBe(toLogDate(NOW).toISOString());
  });

  it("puts every line of one day on one log, however many there are", async () => {
    for (const amount of [40, 12.5, 7]) {
      await prisma.$transaction((tx) =>
        addCostEntry(tx, { ...line, amount, companyId, userId, now: NOW }),
      );
    }

    expect(await prisma.crmDailyLog.count({ where: { companyId, userId } })).toBe(1);
    expect(await prisma.crmDailyCostEntry.count({ where: { companyId } })).toBe(3);
  });

  it("lands a line for Tuesday on Tuesday, written up on Thursday", async () => {
    const entry = await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...line, date: TUESDAY, companyId, userId, now: NOW }),
    );
    const log = await prisma.crmDailyLog.findUniqueOrThrow({ where: { id: entry.logId } });
    expect(log.logDate.toISOString().slice(0, 10)).toBe("2026-09-22");
  });

  it("refuses a day that has not happened yet", async () => {
    await expect(
      prisma.$transaction((tx) =>
        addCostEntry(tx, {
          ...line,
          date: new Date("2026-09-25T00:00:00.000Z"),
          companyId,
          userId,
          now: NOW,
        }),
      ),
    ).rejects.toBeInstanceOf(CostEntryError);
    expect(await prisma.crmDailyLog.count({ where: { companyId } })).toBe(0);
  });

  it("refuses to add to a day somebody has already submitted", async () => {
    const first = await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...line, date: TUESDAY, companyId, userId, now: NOW }),
    );
    await prisma.$transaction((tx) => submitDailyLog(tx, companyId, first.logId));

    await expect(
      prisma.$transaction((tx) =>
        addCostEntry(tx, { ...line, date: TUESDAY, companyId, userId, now: NOW }),
      ),
    ).rejects.toThrow(/submitted/);
    expect(await prisma.crmDailyCostEntry.count({ where: { companyId } })).toBe(1);
  });

  it("lands a replayed offline line once", async () => {
    const clientEntryId = "22222222-3333-4444-5555-666666666666";
    await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...line, clientEntryId, companyId, userId, now: NOW }),
    );
    await prisma.$transaction((tx) =>
      addCostEntry(tx, { ...line, amount: 45, clientEntryId, companyId, userId, now: NOW }),
    );

    const entries = await prisma.crmDailyCostEntry.findMany({ where: { companyId } });
    expect(entries).toHaveLength(1);
    // A replay that carries a correction wins.
    expect(entries[0].amount.toString()).toBe("45");
  });

  it("keeps the receipt, the project and the requisition it is given", async () => {
    const entry = await prisma.$transaction((tx) =>
      addCostEntry(tx, {
        ...line,
        companyId,
        userId,
        now: NOW,
        receiptUrl: "https://example.invalid/receipt.jpg",
        receiptPathname: "companies/x/crm-receipts/receipt.jpg",
      }),
    );
    expect(entry.receiptUrl).toBe("https://example.invalid/receipt.jpg");
    expect(entry.receiptPathname).toBe("companies/x/crm-receipts/receipt.jpg");
    expect(entry.projectId).toBeNull();
    expect(entry.requisitionId).toBeNull();
  });
});
