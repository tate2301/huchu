/**
 * Vane's lists against the test database: a person ticks only their own plan
 * steps and the last one closes the plan; Done lists the cards and the jobs
 * that raised none, a day at a time, with what happened next; Muted and Bring
 * back; Working on puts the running job first. Another workspace's rows and
 * another role's cards never show.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { cardOutcome, listVaneDone, listVaneMuted, listVanePlans, listVaneWorking, tickPlanStep, unmuteVaneItem } from "./lists";

const suffix = randomUUID().slice(0, 8);
const ids = { company: "", other: "", james: "" };
const NOW = new Date("2026-10-13T08:00:00Z");

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane lists ${suffix}`, slug: `vane-lists-${suffix}` } });
  const other = await prisma.company.create({ data: { name: `Vane lists other ${suffix}`, slug: `vane-lists-other-${suffix}` } });
  const james = await prisma.user.create({
    data: { email: `james-${suffix}@vane.test`, name: "James", password: "x", role: "MANAGER", companyId: company.id },
  });
  Object.assign(ids, { company: company.id, other: other.id, james: james.id });
});

afterAll(async () => {
  await prisma.vaneItem.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.vaneJob.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.vanePlan.deleteMany({ where: { companyId: { in: [ids.company, ids.other] } } });
  await prisma.user.deleteMany({ where: { id: ids.james } });
  await prisma.company.deleteMany({ where: { id: { in: [ids.company, ids.other] } } });
});

const who = () => ({ companyId: ids.company, userId: ids.james, role: "MANAGER" });

describe("Plans", () => {
  it("lets a person tick their own step, not Vane's, and closes the plan with the last one", async () => {
    const plan = await prisma.vanePlan.create({
      data: {
        companyId: ids.company,
        title: "VAT for September",
        steps: {
          create: [
            { position: 1, label: "Match the CBZ lines", owner: "VANE", status: "DONE" },
            { position: 2, label: "File the return", owner: "PERSON" },
          ],
        },
      },
      include: { steps: { orderBy: { position: "asc" } } },
    });
    const [vaneStep, personStep] = plan.steps;

    expect(await tickPlanStep(prisma, who(), { planId: plan.id, stepId: vaneStep.id, done: false }, NOW)).toBe("vane-owns-it");
    expect(await tickPlanStep(prisma, { ...who(), companyId: ids.other }, { planId: plan.id, stepId: personStep.id, done: true }, NOW)).toBe(
      "not-found",
    );

    expect(await tickPlanStep(prisma, who(), { planId: plan.id, stepId: personStep.id, done: true }, NOW)).toBe("ticked");
    let [listed] = (await listVanePlans(prisma, who(), NOW)).filter((row) => row.id === plan.id);
    expect(listed).toMatchObject({ status: "done", done: 2 });

    await tickPlanStep(prisma, who(), { planId: plan.id, stepId: personStep.id, done: false }, NOW);
    [listed] = (await listVanePlans(prisma, who(), NOW)).filter((row) => row.id === plan.id);
    expect(listed).toMatchObject({ status: "open", done: 1 });
    expect(listed.steps.map((step) => [step.owner, step.status])).toEqual([
      ["vane", "done"],
      ["person", "todo"],
    ]);
  });
});

describe("Done", () => {
  it("lists the cards and the jobs that raised none, by day, with what happened next", async () => {
    const nightly = await prisma.vaneJob.create({
      data: {
        companyId: ids.company,
        key: `nightly:${suffix}`,
        kind: "nightly",
        label: "Looking over the workspace",
        trigger: "NIGHTLY",
        status: "DONE",
        startedAt: new Date("2026-10-13T04:00:00Z"),
        finishedAt: new Date("2026-10-13T04:05:00Z"),
      },
    });
    await prisma.vaneJob.create({
      data: {
        companyId: ids.company,
        key: `person:${suffix}`,
        kind: "person",
        label: "Which quotes have waited a week?",
        result: "Checked 14 quotes against the price list",
        trigger: "PERSON",
        requestedById: ids.james,
        status: "DONE",
        startedAt: new Date("2026-10-12T09:00:00Z"),
        finishedAt: new Date("2026-10-12T09:02:00Z"),
      },
    });
    const card = (headline: string, data: Record<string, unknown>) =>
      prisma.vaneItem.create({
        data: {
          companyId: ids.company,
          jobId: nightly.id,
          kind: "ISSUE",
          sourceModule: "books",
          headline,
          body: "Let's look.",
          action: { label: "Open 3 statements", target: "/books/invoices" },
          createdAt: new Date("2026-10-13T04:04:00Z"),
          ...data,
        },
      });
    await card("3 invoices are past their terms.", { status: "DONE", resolvedAt: new Date("2026-10-13T07:14:00Z"), resolvedById: ids.james });
    await card("Simba has no NSSA number.", {});
    await card("For the bursar only.", { audienceRole: "BURSAR" });
    await prisma.vaneItem.create({
      data: { companyId: ids.other, kind: "ISSUE", sourceModule: "books", headline: "Not this workspace's.", body: ".", action: {} },
    });

    const done = await listVaneDone(prisma, who(), { days: 7 }, NOW);
    expect(done.days.map((day) => day.day)).toEqual(["2026-10-13", "2026-10-12"]);
    expect(done.days[0].rows.map((row) => [row.what, row.template, row.next])).toEqual([
      ["3 invoices are past their terms.", "nightly", "Open 3 statements, by James, 09:14"],
      ["Simba has no NSSA number.", "nightly", "Open"],
    ]);
    expect(done.days[1].rows).toMatchObject([{ what: "Checked 14 quotes against the price list", template: "person", next: "Done for James", cardId: null }]);
    expect(done).toMatchObject({ total: 3, taken: 1, jobs: { period: 2 }, templates: ["nightly", "person"] });

    const today = await listVaneDone(prisma, who(), { days: 1, template: "person" }, NOW);
    expect(today.total).toBe(0);
  });

  it("says what became of a card in a line", () => {
    const resolvedAt = new Date("2026-10-05T08:00:00Z");
    expect(cardOutcome({ status: "OPEN", mutedReason: null, resolvedAt: null, resolvedBy: null, actionLabel: "Send" })).toBe("Open");
    expect(cardOutcome({ status: "MUTED", mutedReason: "Already done", resolvedAt, resolvedBy: { name: "James" }, actionLabel: null })).toBe(
      "Not now: Already done, James, 10:00",
    );
  });
});

describe("Muted", () => {
  it("lists the cards set aside with the reason, and Bring back puts one on For you again", async () => {
    const muted = await prisma.vaneItem.create({
      data: {
        companyId: ids.company,
        kind: "SUGGESTION",
        sourceModule: "retail",
        headline: "Monday's cash-up was short, $12.00",
        body: ".",
        action: {},
        status: "MUTED",
        mutedReason: "Already done",
        resolvedAt: new Date("2026-10-05T08:00:00Z"),
        resolvedById: ids.james,
      },
    });
    const rows = await listVaneMuted(prisma, who());
    expect(rows).toEqual([
      { id: muted.id, headline: "Monday's cash-up was short, $12.00", topic: null, source: "Tender", reason: "Already done", by: "James", at: "2026-10-05T08:00:00.000Z" },
    ]);
    expect(await unmuteVaneItem(prisma, { ...who(), companyId: ids.other, id: muted.id })).toBe(false);
    expect(await unmuteVaneItem(prisma, { ...who(), id: muted.id })).toBe(true);
    expect(await prisma.vaneItem.findUnique({ where: { id: muted.id }, select: { status: true, mutedReason: true } })).toEqual({
      status: "OPEN",
      mutedReason: null,
    });
  });
});

describe("Working on", () => {
  it("puts the running job first, then the queued, then those waiting to try again", async () => {
    const job = (key: string, status: "RUNNING" | "QUEUED" | "WAITING", extra: Record<string, unknown> = {}) =>
      prisma.vaneJob.create({
        data: { companyId: ids.company, key: `${key}:${suffix}`, kind: "person", label: key, trigger: "SCHEDULE", status, ...extra },
      });
    await job("waiting", "WAITING", { runAfter: new Date("2026-10-13T07:00:00Z") });
    await job("queued", "QUEUED");
    await job("running", "RUNNING", { startedAt: new Date("2026-10-13T07:58:00Z"), progressDone: 38, progressTotal: 61 });
    const rows = await listVaneWorking(prisma, who());
    expect(rows.map((row) => [row.label, row.state, row.progress, row.by])).toEqual([
      ["running", "running", "38 of 61", "Vane, on schedule"],
      ["queued", "next", null, "Vane, on schedule"],
      ["waiting", "waiting", null, "Vane, on schedule"],
    ]);
  });
});
