/**
 * Vane's plans against the database. A person ticks their own step done and
 * back; Vane's steps, another workspace's plans, someone else's plan and
 * plans that have not started are refused; the last step done finishes the
 * plan, and a step ticked back opens it again. A plan Vane drafts waits for
 * Start, which only the person whose plan it is presses, once, with the steps
 * as they left them. Started, the runner queues Vane's steps one at a time as
 * jobs, ticks each when its job finishes, and stops at a person's step.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { vanePlans } from "./pages";
import { advancePlans, startPlan, stepJobKey, tickPlanStep } from "./plans";
import { callTool } from "./tools";

const suffix = randomUUID().slice(0, 8);
const made = { company: "", other: "", user: "", colleague: "" };

async function plan(status: "OPEN" | "CANCELLED" = "OPEN", companyId = made.company) {
  const created = await prisma.vanePlan.create({
    data: {
      companyId,
      title: "Collect what is overdue",
      status,
      steps: {
        create: [
          { position: 1, label: "List what each customer owes", owner: "VANE", status: "DONE" },
          { position: 2, label: "Call the customers who owe the most", owner: "PERSON", status: "NOW" },
        ],
      },
    },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  return { id: created.id, vane: created.steps[0]!.id, person: created.steps[1]!.id };
}

const tick = (planId: string, stepId: string, done: boolean, companyId = made.company) =>
  tickPlanStep(prisma, { companyId, userId: made.user, planId, stepId, done });

beforeAll(async () => {
  const company = await prisma.company.create({ data: { name: `Vane plans ${suffix}`, slug: `vane-plans-a-${suffix}` } });
  const other = await prisma.company.create({ data: { name: `Vane plans other ${suffix}`, slug: `vane-plans-b-${suffix}` } });
  made.company = company.id;
  made.other = other.id;
  const user = await prisma.user.create({
    data: { companyId: company.id, name: "Rudo Moyo", email: `rudo-${suffix}@vane-plans.test`, password: "x", role: "MANAGER" },
  });
  made.user = user.id;
  const colleague = await prisma.user.create({
    data: { companyId: company.id, name: "James Dube", email: `james-${suffix}@vane-plans.test`, password: "x", role: "MANAGER" },
  });
  made.colleague = colleague.id;
});

afterAll(async () => {
  const companies = { slug: { startsWith: "vane-plans-" } };
  await prisma.user.deleteMany({ where: { company: companies } });
  await prisma.company.deleteMany({ where: companies });
});

describe("a person ticks their own plan step", () => {
  it("marks it done, finishing the plan when it was the last, and back to not done, opening it again", async () => {
    const p = await plan();
    expect(await tick(p.id, p.person, true)).toEqual({ ok: true, planDone: true });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: p.person } })).toMatchObject({ status: "DONE" });
    expect(await prisma.vanePlan.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "DONE", doneAt: expect.any(Date) });

    expect(await tick(p.id, p.person, false)).toEqual({ ok: true, planDone: false });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: p.person } })).toMatchObject({ status: "TODO", doneAt: null });
    expect(await prisma.vanePlan.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "OPEN", doneAt: null });
  });

  it("refuses Vane's steps: they tick as its jobs finish", async () => {
    const p = await plan();
    expect(await tick(p.id, p.vane, false)).toMatchObject({ ok: false, status: 403 });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: p.vane } })).toMatchObject({ status: "DONE" });
  });

  it("refuses another workspace's plan, and a plan that is not under way", async () => {
    const theirs = await plan("OPEN", made.other);
    expect(await tick(theirs.id, theirs.person, true)).toMatchObject({ ok: false, status: 404 });
    const stopped = await plan("CANCELLED");
    expect(await tick(stopped.id, stopped.person, true)).toMatchObject({ ok: false, status: 409 });
    for (const id of [theirs.person, stopped.person]) {
      expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "NOW" });
    }
  });
});

/** A person's job, and the plan Vane lays out from it through its own tool. */
async function drafted(by = made.user) {
  const job = await prisma.vaneJob.create({
    data: {
      companyId: made.company,
      key: `test:${randomUUID()}`,
      kind: "person",
      label: "Answer or close the old quotes",
      request: "Get every quote that has waited more than two weeks answered or closed by Friday.",
      trigger: "PERSON",
      requestedById: by,
      status: "DONE",
      tools: [{ name: "run_sql", ms: 12, ok: true, reads: [{ table: "salesquotation", rows: 35 }, { table: "customer", rows: 35 }] }],
    },
  });
  const result = await callTool({ companyId: made.company, jobId: job.id }, "propose_plan", {
    title: "Answer or close the old quotes",
    steps: [
      { label: "List each quote that has waited more than two weeks", owner: "VANE" },
      { label: "Find which customers have been in touch since", owner: "VANE" },
      { label: "Call the five largest", owner: "PERSON" },
    ],
  });
  expect(result.ok).toBe(true);
  const plan = await prisma.vanePlan.findFirstOrThrow({ where: { jobId: job.id }, include: { steps: { orderBy: { position: "asc" } } } });
  return { job, plan };
}

const finish = (stepId: string, result: string) =>
  prisma.vaneJob.update({
    where: { companyId_key: { companyId: made.company, key: stepJobKey(stepId) } },
    data: { status: "DONE", finishedAt: new Date(), result },
  });

describe("a plan Vane drafts", () => {
  it("waits for Start, keeps the job it came from, and shows what that job read", async () => {
    const { job, plan } = await drafted();
    expect(plan).toMatchObject({ status: "WAITING", jobId: job.id });
    const [shown] = (await vanePlans(prisma, { companyId: made.company, userId: made.user })).filter((p) => p.id === plan.id);
    expect(shown).toMatchObject({
      status: "waiting",
      person: { you: true, name: null },
      job: { id: job.id, request: job.request },
      reads: [
        { table: "salesquotation", label: "Quotes", rows: 35 },
        { table: "customer", label: "Customers", rows: 35 },
      ],
    });
    // Nothing runs, and nothing can be ticked, before Start.
    expect(await advancePlans(prisma, new Date(), { companyId: made.company })).toMatch(/0 steps queued/);
    expect(await tick(plan.id, plan.steps[2]!.id, true)).toMatchObject({ ok: false, status: 409 });
  });

  it("starts only for the person whose plan it is, once, with the steps as they left them", async () => {
    const { plan } = await drafted();
    const [first, second, third] = plan.steps;
    expect(await startPlan(prisma, { companyId: made.company, userId: made.colleague, planId: plan.id })).toMatchObject({
      ok: false,
      status: 403,
      message: "Rudo gave Vane this job, so the plan is theirs",
    });
    expect(await startPlan(prisma, { companyId: made.other, userId: made.user, planId: plan.id })).toMatchObject({ status: 404 });
    expect(
      await startPlan(prisma, {
        companyId: made.company,
        userId: made.user,
        planId: plan.id,
        steps: [
          { id: third!.id, label: "Call the three largest" },
          { id: first!.id, label: first!.label },
        ],
      }),
    ).toEqual({ ok: true });
    const started = await prisma.vanePlan.findUniqueOrThrow({ where: { id: plan.id }, include: { steps: { orderBy: { position: "asc" } } } });
    expect(started.status).toBe("OPEN");
    expect(started.steps.map((step) => [step.position, step.label, step.owner])).toEqual([
      [1, "Call the three largest", "PERSON"],
      [2, first!.label, "VANE"],
    ]);
    expect(await prisma.vanePlanStep.count({ where: { id: second!.id } })).toBe(0);
    expect(await startPlan(prisma, { companyId: made.company, userId: made.user, planId: plan.id })).toMatchObject({ status: 409 });
  });

  it("runs Vane's steps as jobs one at a time on the tick, and waits for the person's", async () => {
    const { plan } = await drafted();
    const [list, find, call] = plan.steps;
    await startPlan(prisma, { companyId: made.company, userId: made.user, planId: plan.id });

    await advancePlans(prisma, new Date(), { companyId: made.company });
    const job = await prisma.vaneJob.findUniqueOrThrow({ where: { companyId_key: { companyId: made.company, key: stepJobKey(list!.id) } } });
    expect(job).toMatchObject({ kind: "plan-step", status: "QUEUED", trigger: "SCHEDULE", requestedById: made.user, label: list!.label });
    expect(job.request).toContain("Do step 1 only: List each quote that has waited more than two weeks");
    expect(job.request).toContain("Get every quote that has waited more than two weeks answered or closed by Friday.");
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: list!.id } })).toMatchObject({ status: "NOW" });
    // Still running: nothing more is queued.
    await advancePlans(prisma, new Date(), { companyId: made.company });
    expect(await prisma.vaneJob.count({ where: { companyId: made.company, kind: "plan-step" } })).toBe(1);

    await finish(list!.id, "35 quotes have waited more than two weeks. The oldest is QT-0102.");
    await advancePlans(prisma, new Date(), { companyId: made.company });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: list!.id } })).toMatchObject({
      status: "DONE",
      progressLabel: "35 quotes have waited more than two weeks. The oldest is QT-0102.",
    });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: find!.id } })).toMatchObject({ status: "NOW" });

    await finish(find!.id, "4 of their customers were in touch since.");
    await advancePlans(prisma, new Date(), { companyId: made.company });
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: call!.id } })).toMatchObject({ status: "NOW" });
    // The person's step waits for that person: the runner queues nothing for it, and a colleague cannot tick it.
    expect(await prisma.vaneJob.count({ where: { companyId: made.company, key: stepJobKey(call!.id) } })).toBe(0);
    expect(await tickPlanStep(prisma, { companyId: made.company, userId: made.colleague, planId: plan.id, stepId: call!.id, done: true })).toMatchObject({
      status: 403,
    });
    expect(await tick(plan.id, call!.id, true)).toEqual({ ok: true, planDone: true });
  });
});
