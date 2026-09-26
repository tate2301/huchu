/**
 * Projects, the daily cost log and the report that goes to management, against
 * a real database.
 *
 * The arithmetic is the point. A cost rollup that double-counts, or a day that
 * adds up differently on the log page than in the report, is worse than no
 * figure at all: somebody approves the next requisition on the strength of it.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { budgetOverrun, createProject, projectCostSummary } from "@/lib/crm/projects";
import { PROJECT_STATUSES, canTransition } from "@/lib/crm/project-status";
import { addCostEntry, dayTotals, openDailyLog, submitDailyLog, toLogDate } from "@/lib/crm/daily-log";
import { buildDailyReport, dayWindow, reportHeadline, saveDailyReport } from "@/lib/crm/daily-report";

const SLUG = "project-accounting-test";
const EMAIL = "project-accounting-test@example.invalid";

let companyId: string;
let userId: string;
let projectId: string;

/** A fixed day, so "today" cannot make the suite answer differently. */
const DAY = new Date("2026-05-14T09:30:00.000Z");

async function clear() {
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId } });
  await prisma.crmDailyReport.deleteMany({ where: { companyId } });
  await prisma.crmRequisition.deleteMany({ where: { companyId } });
}

async function requisition(
  status: "DRAFT" | "SUBMITTED" | "APPROVED" | "DISBURSED" | "ACQUITTED" | "REJECTED",
  amount: string,
  extra: { approvedAmount?: string; projectId?: string | null; category?: "FUEL" | "MATERIALS" } = {},
) {
  return prisma.crmRequisition.create({
    data: {
      companyId,
      requisitionNo: `REQ-T-${Math.random().toString(36).slice(2, 10)}`,
      status,
      category: extra.category ?? "MATERIALS",
      purpose: "Test",
      amount,
      approvedAmount: extra.approvedAmount ?? null,
      projectId: extra.projectId === undefined ? projectId : extra.projectId,
      requestedById: userId,
    },
  });
}

async function entry(
  direction: "RECEIVED" | "SPENT",
  amount: string,
  extra: { projectId?: string | null; category?: "FUEL" | "MATERIALS"; receipt?: boolean } = {},
) {
  return prisma.$transaction((tx) =>
    addCostEntry(tx, {
      companyId,
      userId,
      date: DAY,
      direction,
      category: extra.category ?? "MATERIALS",
      amount: Number(amount),
      currency: "USD",
      description: "Test entry",
      projectId: extra.projectId === undefined ? projectId : extra.projectId,
      receiptUrl: extra.receipt ? "https://example.invalid/receipt.jpg" : null,
    }),
  );
}

beforeAll(async () => {
  const company = await prisma.company.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Project Accounting Test", slug: SLUG },
  });
  companyId = company.id;

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL, name: "Tendai Field", companyId, role: "CLERK" },
  });
  userId = user.id;

  await clear();
  await prisma.crmProject.deleteMany({ where: { companyId } });

  const project = await prisma.$transaction((tx) =>
    createProject(tx, companyId, userId, {
      name: "Warehouse floor",
      budget: 5000,
      currency: "USD",
    }),
  );
  projectId = project.id;
});

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.crmProject.deleteMany({ where: { companyId } });
  await prisma.costCenter.deleteMany({ where: { companyId } });
  await prisma.crmWorkOrder.deleteMany({ where: { companyId } });
  await prisma.user.deleteMany({ where: { companyId } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

describe("raising a project", () => {
  it("numbers it from the tenant's own sequence", async () => {
    const project = await prisma.crmProject.findUnique({ where: { id: projectId } });
    expect(project?.projectNo).toMatch(/^PRJ/);
    expect(project?.status).toBe("PLANNING");
  });

  it("opens a cost centre so its spend is findable in the ledger", async () => {
    // "Each project has its own accounting" is only true if a journal line can
    // say which project it belongs to, and CostCenter is that dimension.
    const project = await prisma.crmProject.findUnique({
      where: { id: projectId },
      include: { costCenter: true },
    });
    expect(project?.costCenterId).not.toBeNull();
    expect(project?.costCenter?.code).toBe(project?.projectNo);
    expect(project?.costCenter?.name).toBe("Warehouse floor");
  });

  it("reuses a cost centre rather than colliding on its code", async () => {
    const second = await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "Another floor", currency: "USD" }),
    );
    expect(second.costCenterId).not.toBeNull();
    expect(second.costCenterId).not.toBe(
      (await prisma.crmProject.findUnique({ where: { id: projectId } }))?.costCenterId,
    );
    await prisma.crmProject.delete({ where: { id: second.id } });
  });

  it("lets a completed project be reopened but never an abandoned one", async () => {
    // Unlike a job, which carries a signature against a particular day's work.
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(true);
    for (const status of PROJECT_STATUSES) {
      expect(canTransition("CANCELLED", status)).toBe(false);
    }
  });
});

describe("what a project has cost", () => {
  it("is nothing before anything is spent on it", async () => {
    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(summary.committed.toString()).toBe("0");
    expect(summary.spent.toString()).toBe("0");
    expect(summary.budget?.toString()).toBe("5000");
    expect(summary.remaining?.toString()).toBe("5000");
  });

  it("keeps approved money and drawn money apart", async () => {
    await requisition("APPROVED", "300.00");
    await requisition("DISBURSED", "200.00");

    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );

    // "What is promised but not yet paid" is the question that decides
    // whether there is enough in the account this week.
    expect(summary.approved.toString()).toBe("300");
    expect(summary.outstanding.toString()).toBe("200");
    expect(summary.committed.toString()).toBe("500");
  });

  it("ignores requisitions nobody approved", async () => {
    await requisition("DRAFT", "900.00");
    await requisition("SUBMITTED", "900.00");
    await requisition("REJECTED", "900.00");

    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(summary.committed.toString()).toBe("0");
  });

  it("commits the cut figure when an approver cut it", async () => {
    await requisition("APPROVED", "400.00", { approvedAmount: "250.00" });
    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(summary.committed.toString()).toBe("250");
  });

  it("does not add a drawn requisition to the spend it paid for", async () => {
    // The double-count this separation exists to prevent: 200 drawn, 200
    // spent, and the project has cost 200 — not 400.
    await requisition("DISBURSED", "200.00");
    await entry("SPENT", "200.00");

    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(summary.outstanding.toString()).toBe("200");
    expect(summary.spent.toString()).toBe("200");
    expect(summary.committed.plus(summary.spent).toString()).toBe("400");
    // Which is why the two are reported separately and never summed for the
    // reader. Spend against budget uses `spent` alone.
    expect(summary.remaining?.toString()).toBe("4800");
  });

  it("leaves other projects' costs alone", async () => {
    const other = await prisma.$transaction((tx) =>
      createProject(tx, companyId, userId, { name: "Somebody else's floor", currency: "USD" }),
    );
    await entry("SPENT", "500.00", { projectId: other.id });

    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(summary.spent.toString()).toBe("0");

    await prisma.crmDailyCostEntry.deleteMany({ where: { projectId: other.id } });
    await prisma.crmProject.delete({ where: { id: other.id } });
  });

  it("reports an overrun only when there is a budget to overrun", async () => {
    await entry("SPENT", "6000.00");
    const summary = await prisma.$transaction((tx) =>
      projectCostSummary(tx, companyId, projectId),
    );
    expect(budgetOverrun(summary)?.toString()).toBe("1000");

    expect(budgetOverrun({ ...summary, budget: null, remaining: null })).toBeNull();
  });
});

describe("a day of cash", () => {
  it("puts Tuesday's entry on Tuesday whatever time it was typed", () => {
    // Late-evening in Harare is already the next day in some tz arithmetic.
    expect(toLogDate(new Date("2026-05-14T23:50:00.000Z")).toISOString()).toBe(
      "2026-05-14T00:00:00.000Z",
    );
    expect(dayWindow(DAY).end.toISOString()).toBe("2026-05-15T00:00:00.000Z");
  });

  it("opens one log per person per day, however often it is asked for", async () => {
    const first = await prisma.$transaction((tx) => openDailyLog(tx, companyId, userId, DAY));
    const second = await prisma.$transaction((tx) => openDailyLog(tx, companyId, userId, DAY));
    expect(second.id).toBe(first.id);
  });

  it("adds up what is in hand", () => {
    const totals = dayTotals([
      { direction: "RECEIVED", amount: new Prisma.Decimal("200.00"), projectId: "p", receiptUrl: null },
      { direction: "SPENT", amount: new Prisma.Decimal("45.50"), projectId: "p", receiptUrl: "u" },
      { direction: "SPENT", amount: new Prisma.Decimal("12.25"), projectId: null, receiptUrl: null },
    ]);
    expect(totals.received.toString()).toBe("200");
    expect(totals.spent.toString()).toBe("57.75");
    expect(totals.balance.toString()).toBe("142.25");
    expect(totals.unattributed).toBe(1);
    // Only spending needs a receipt.
    expect(totals.missingReceipts).toBe(1);
  });

  it("lands a replayed offline entry once", async () => {
    const log = await prisma.$transaction((tx) => openDailyLog(tx, companyId, userId, DAY));
    const clientEntryId = "11111111-2222-3333-4444-555555555555";
    const input = {
      direction: "SPENT" as const,
      category: "FUEL" as const,
      amount: 40,
      currency: "USD",
      description: "Diesel",
      projectId: null,
      clientEntryId,
    };

    await prisma.$transaction((tx) => addCostEntry(tx, { companyId, userId, date: DAY, ...input }));
    await prisma.$transaction((tx) => addCostEntry(tx, { companyId, userId, date: DAY, ...input }));

    const count = await prisma.crmDailyCostEntry.count({ where: { companyId, logId: log.id } });
    expect(count).toBe(1);
  });

  it("refuses to close an empty day without a word of explanation", async () => {
    const log = await prisma.$transaction((tx) => openDailyLog(tx, companyId, userId, DAY));
    await expect(
      prisma.$transaction((tx) => submitDailyLog(tx, companyId, log.id)),
    ).rejects.toThrow(/before submitting/);

    // A note is the answer: "no movement today" is a real day, and a manager
    // needs to tell it from a day the person forgot about.
    await prisma.crmDailyLog.update({ where: { id: log.id }, data: { notes: "No movement." } });
    const submitted = await prisma.$transaction((tx) => submitDailyLog(tx, companyId, log.id));
    expect(submitted.submittedAt).not.toBeNull();
  });
});

describe("the report that goes to management", () => {
  it("assembles the money from the day's own log", async () => {
    await entry("RECEIVED", "300.00");
    await entry("SPENT", "120.00", { category: "FUEL", projectId: null, receipt: true });
    await entry("SPENT", "80.00", { receipt: true });

    const report = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, DAY),
    );

    expect(report.date).toBe("2026-05-14");
    expect(report.money.received).toBe("300.00");
    expect(report.money.spent).toBe("200.00");
    expect(report.money.balance).toBe("100.00");
    expect(report.money.byCategory).toEqual([
      { category: "FUEL", spent: "120.00" },
      { category: "MATERIALS", spent: "80.00" },
    ]);
    // Fuel belongs to no project, and the report says so rather than hiding it.
    expect(report.money.byProject.some((row) => row.projectId === null)).toBe(true);
  });

  it("flags a spend with no receipt", async () => {
    await entry("SPENT", "60.00");
    const report = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, DAY),
    );
    expect(report.flags).toContain("One spend has no receipt attached.");
  });

  it("flags money drawn and not yet accounted for, from whatever day", async () => {
    await requisition("DISBURSED", "150.00");
    const report = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, DAY),
    );
    expect(report.requisitions.outstanding).toBe("150.00");
    expect(report.flags).toContain("150.00 drawn and not yet accounted for.");
  });

  it("says plainly when nothing was recorded", async () => {
    const report = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, DAY),
    );
    expect(report.flags).toContain("Nothing was recorded against this day.");
    expect(reportHeadline(report)).toBe("Nothing recorded");
  });

  it("counts the day's visits and their answered sections", async () => {
    const appointment = await prisma.crmAppointment.create({
      data: {
        companyId,
        appointmentNo: "SVT-TEST-1",
        title: "Measure the warehouse",
        assignedToId: userId,
        scheduledStart: DAY,
      },
    });

    const report = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, DAY),
    );
    expect(report.visits).toHaveLength(1);
    expect(report.visits[0].title).toBe("Measure the warehouse");
    expect(reportHeadline(report)).toContain("1 visit");

    await prisma.crmAppointment.delete({ where: { id: appointment.id } });
  });

  it("leaves yesterday out of today", async () => {
    await entry("SPENT", "99.00");
    const yesterday = await prisma.$transaction((tx) =>
      buildDailyReport(tx, companyId, userId, new Date("2026-05-13T09:00:00.000Z")),
    );
    expect(yesterday.money.spent).toBe("0.00");
  });

  it("keeps the report as it was rather than recomputing it later", async () => {
    await entry("SPENT", "75.00", { receipt: true });
    const saved = await prisma.$transaction((tx) =>
      saveDailyReport(tx, companyId, userId, DAY),
    );
    const stored = saved.summary as unknown as { money: { spent: string } };
    expect(stored.money.spent).toBe("75.00");

    // The record moves afterwards. The stored report must not.
    await prisma.crmDailyCostEntry.deleteMany({ where: { companyId } });
    const reread = await prisma.crmDailyReport.findUnique({ where: { id: saved.id } });
    const rereadSummary = reread!.summary as unknown as { money: { spent: string } };
    expect(rereadSummary.money.spent).toBe("75.00");
  });

  it("regenerating a day replaces it rather than leaving two of the 14th", async () => {
    await prisma.$transaction((tx) => saveDailyReport(tx, companyId, userId, DAY));
    await entry("SPENT", "10.00", { receipt: true });
    await prisma.$transaction((tx) => saveDailyReport(tx, companyId, userId, DAY));

    const reports = await prisma.crmDailyReport.findMany({ where: { companyId, userId } });
    expect(reports).toHaveLength(1);
    const summary = reports[0].summary as unknown as { money: { spent: string } };
    expect(summary.money.spent).toBe("10.00");
  });
});
