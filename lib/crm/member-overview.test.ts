/**
 * One team member's page, against a real database: what they got done in a
 * period, what is outstanding against them — late things first — their days,
 * and who may open it at all.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";
import type { AuthenticatedSession } from "@/lib/auth-core/types";
import { addCostEntry } from "@/lib/crm/daily-log";
import { saveDailyReport } from "@/lib/crm/daily-report";
import {
  mayOpenMember,
  memberAchievements,
  memberActivity,
  memberOutstanding,
} from "@/lib/crm/member-overview";

const SLUG = "member-overview-test";
/** Fixed "now", so the suite cannot answer differently at midnight. */
const NOW = new Date("2026-09-25T12:00:00.000Z");
const SEPTEMBER = { from: new Date("2026-09-01T00:00:00.000Z"), to: new Date("2026-09-30T00:00:00.000Z") };

let company: string;
let tendai: string;
let rudo: string;
let boss: string;
let books: string;

const at = (day: string, time = "09:00:00") => new Date(`${day}T${time}.000Z`);

async function wipe() {
  await prisma.crmDailyReport.deleteMany({ where: { companyId: company } });
  await prisma.crmDailyCostEntry.deleteMany({ where: { companyId: company } });
  await prisma.crmDailyLog.deleteMany({ where: { companyId: company } });
  await prisma.crmRequisition.deleteMany({ where: { companyId: company } });
  await prisma.crmTask.deleteMany({ where: { companyId: company } });
  await prisma.crmFollowUp.deleteMany({ where: { companyId: company } });
  await prisma.crmAppointment.deleteMany({ where: { companyId: company } });
  await prisma.crmWorkOrder.deleteMany({ where: { companyId: company } });
  await prisma.crmDeal.deleteMany({ where: { companyId: company } });
  await prisma.crmPipelineStage.deleteMany({ where: { companyId: company } });
  await prisma.crmPipeline.deleteMany({ where: { companyId: company } });
}

function line(day: string, direction: "SPENT" | "RECEIVED", amount: number, receiptUrl: string | null = null) {
  return prisma.$transaction((tx) =>
    addCostEntry(tx, {
      direction,
      category: "MATERIALS",
      amount,
      currency: "USD",
      description: "Line",
      receiptUrl,
      date: at(day, "00:00:00"),
      companyId: company,
      userId: tendai,
      now: NOW,
    }),
  );
}

function requisition(no: string, status: "SUBMITTED" | "DISBURSED" | "ACQUITTED", created: string, disbursed?: string) {
  return prisma.crmRequisition.create({
    data: {
      companyId: company,
      requisitionNo: no,
      status,
      category: "FUEL",
      purpose: no,
      amount: 50,
      currency: "USD",
      requestedById: tendai,
      createdAt: at(created),
      submittedAt: at(created),
      approvedAt: status === "SUBMITTED" ? null : at(created),
      disbursedAt: disbursed ? at(disbursed) : null,
      acquittedAt: status === "ACQUITTED" ? at(created) : null,
      acquittedAmount: status === "ACQUITTED" ? 50 : null,
    },
  });
}

beforeAll(async () => {
  company = (
    await prisma.company.upsert({
      where: { slug: SLUG },
      update: {},
      create: { name: "Member Overview Test", slug: SLUG },
    })
  ).id;
  await wipe();

  const person = async (key: string, name: string, role: "SALES_REP" | "MANAGER" | "FINANCE_OFFICER") =>
    (
      await prisma.user.upsert({
        where: { email: `member-overview-${key}@example.invalid` },
        update: {},
        create: { email: `member-overview-${key}@example.invalid`, name, companyId: company, role },
      })
    ).id;
  tendai = await person("tendai", "Tendai", "SALES_REP");
  rudo = await person("rudo", "Rudo", "SALES_REP");
  boss = await person("boss", "Chipo", "MANAGER");
  books = await person("books", "Farai", "FINANCE_OFFICER");

  // A deal won in the period, and one won before it.
  const pipeline = await prisma.crmPipeline.create({ data: { companyId: company, name: "Sales" } });
  const stage = await prisma.crmPipelineStage.create({
    data: { companyId: company, pipelineId: pipeline.id, name: "Won", status: "WON" },
  });
  for (const [no, wonAt, value] of [
    ["DEAL-MO-1", "2026-09-10", 1000],
    ["DEAL-MO-2", "2026-08-20", 500],
  ] as const) {
    await prisma.crmDeal.create({
      data: {
        companyId: company,
        dealNo: no,
        title: no,
        pipelineId: pipeline.id,
        stageId: stage.id,
        status: "WON",
        wonAt: at(wonAt),
        value,
        assignedToId: tendai,
      },
    });
  }

  await prisma.crmWorkOrder.create({
    data: { companyId: company, workOrderNo: "WO-MO-1", title: "Prime the floor", status: "COMPLETED", completedAt: at("2026-09-12"), assignedToId: tendai },
  });
  await prisma.crmWorkOrder.create({
    data: { companyId: company, workOrderNo: "WO-MO-2", title: "Old job", status: "COMPLETED", completedAt: at("2026-08-12"), assignedToId: tendai },
  });
  await prisma.crmAppointment.create({
    data: { companyId: company, appointmentNo: "APT-MO-1", assignedToId: tendai, scheduledStart: at("2026-09-11"), status: "COMPLETED" },
  });
  await prisma.crmAppointment.create({
    data: { companyId: company, appointmentNo: "APT-MO-2", assignedToId: tendai, scheduledStart: at("2026-09-20") },
  });

  // Work owed: one task late, one not yet due, one done; a legacy follow-up late.
  await prisma.crmTask.create({ data: { companyId: company, title: "Call Mrs Moyo back", dueAt: at("2026-09-15"), assignedToId: tendai } });
  await prisma.crmTask.create({ data: { companyId: company, title: "Send the revised quote", dueAt: at("2026-09-30"), assignedToId: tendai } });
  await prisma.crmTask.create({
    data: { companyId: company, title: "Book the screed", dueAt: at("2026-09-12"), assignedToId: tendai, status: "COMPLETED", completedAt: at("2026-09-12", "15:00:00") },
  });
  await prisma.crmFollowUp.create({ data: { companyId: company, title: "Chase the deposit", dueAt: at("2026-09-18"), assignedToId: tendai } });

  // Money: one asked for, one float out a fortnight, one out three days, one settled.
  await requisition("REQ-MO-WAIT", "SUBMITTED", "2026-09-20");
  await requisition("REQ-MO-OLD", "DISBURSED", "2026-09-08", "2026-09-10");
  await requisition("REQ-MO-NEW", "DISBURSED", "2026-09-21", "2026-09-22");
  await requisition("REQ-MO-DONE", "ACQUITTED", "2026-08-15", "2026-08-16");

  // The 12th left open with a spend missing its photo; the 13th closed; today
  // still going.
  await line("2026-09-12", "SPENT", 40);
  await line("2026-09-12", "SPENT", 60, "https://example.invalid/r.jpg");
  const closed = await line("2026-09-13", "RECEIVED", 100);
  await prisma.crmDailyLog.update({ where: { id: closed.logId }, data: { submittedAt: at("2026-09-13", "18:00:00") } });
  const report = await prisma.$transaction((tx) => saveDailyReport(tx, company, tendai, at("2026-09-13")));
  // What management got that evening, marked so the test can tell it apart
  // from a report rebuilt now.
  await prisma.crmDailyReport.update({
    where: { id: report.id },
    data: { summary: { ...(report.summary as object), notes: "As it was sent" } },
  });
  await line("2026-09-25", "SPENT", 5, "https://example.invalid/today.jpg");
});

afterAll(async () => {
  await wipe();
  await prisma.user.deleteMany({ where: { companyId: company } });
  await prisma.company.deleteMany({ where: { slug: SLUG } });
});

const scope = () => ({ companyId: company, userId: tendai, ...SEPTEMBER, now: NOW });

describe("what they got done", () => {
  it("counts the period's wins, jobs, visits and money, and nothing before it", async () => {
    const achieved = await memberAchievements(prisma, scope());
    expect(achieved.dealsWon).toBe(1);
    expect(achieved.wonValue.toString()).toBe("1000");
    expect(achieved.jobsCompleted).toBe(1);
    expect(achieved.visitsDone).toBe(1);
    expect(achieved.spent.toString()).toBe("105");
    expect(achieved.received.toString()).toBe("100");
  });
});

describe("what is outstanding", () => {
  it("puts what is late first, oldest first, and what is waiting after", async () => {
    const items = await memberOutstanding(prisma, scope());
    expect(items.map((item) => [item.kind, item.flagged])).toEqual([
      ["float", true], // out since the 10th — more than a week
      ["report", true], // the 12th, never closed
      ["task", true], // due the 15th
      ["follow-up", true], // due the 18th
      ["no-receipt", true],
      ["requisition", false], // waiting on an approver, not on them
      ["float", false], // out three days — not late yet
    ]);
  });

  it("names the spend without a photo, and only that one", async () => {
    const item = (await memberOutstanding(prisma, scope())).find((entry) => entry.kind === "no-receipt");
    expect(item?.count).toBe(1);
    expect(item?.amount?.toString()).toBe("40");
  });

  it("leaves today open, and a closed day alone", async () => {
    const days = (await memberOutstanding(prisma, scope()))
      .filter((item) => item.kind === "report")
      .map((item) => item.at?.toISOString().slice(0, 10));
    expect(days).toEqual(["2026-09-12"]);
  });
});

describe("their days", () => {
  it("lists the days with anything on them, newest first", async () => {
    const days = await memberActivity(prisma, scope());
    expect(days.map((day) => day.date)).toEqual([
      "2026-09-25",
      "2026-09-21",
      "2026-09-20",
      "2026-09-13",
      "2026-09-12",
      "2026-09-11",
      "2026-09-08",
    ]);
  });

  it("shows a closed day as the report management got", async () => {
    const day = (await memberActivity(prisma, scope())).find((entry) => entry.date === "2026-09-13");
    expect(day?.submitted).toBe(true);
    expect(day?.summary.notes).toBe("As it was sent");
    // And opens onto that report's own page.
    const stored = await prisma.crmDailyReport.findFirst({
      where: { userId: tendai, reportDate: new Date("2026-09-13T00:00:00.000Z") },
      select: { id: true },
    });
    expect(day?.reportId).toBe(stored?.id);
  });

  it("builds an open day from what is on it", async () => {
    const day = (await memberActivity(prisma, scope())).find((entry) => entry.date === "2026-09-12");
    expect(day?.submitted).toBe(false);
    expect(day?.reportId).toBeNull();
    expect(day?.summary.jobs).toHaveLength(1);
    expect(day?.summary.tasks.completed).toHaveLength(1);
    expect(day?.summary.money.spent).toBe("100.00");
  });
});

describe("who may open the page", () => {
  const as = (id: string, role: string) => ({ user: { id, role } }) as unknown as AuthenticatedSession;

  it("lets anybody open their own", async () => {
    expect(await mayOpenMember(as(tendai, "SALES_REP"), tendai)).toBe(true);
  });

  it("keeps a colleague out", async () => {
    expect(await mayOpenMember(as(rudo, "SALES_REP"), tendai)).toBe(false);
  });

  it("lets a manager, and whoever keeps the books, open anybody's", async () => {
    expect(await mayOpenMember(as(boss, "MANAGER"), tendai)).toBe(true);
    expect(await mayOpenMember(as(books, "FINANCE_OFFICER"), tendai)).toBe(true);
  });
});
