/**
 * Plans that wait for Start, against the database. A plan Vane lays out waits
 * for Start, which only the person whose plan it is presses, once, with the
 * steps as they left them; nothing runs or ticks before then. Started, the
 * runner queues Vane's steps one at a time as jobs, ticks each when its job
 * finishes, and stops at a person's step.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { jobLine } from "./status";
import { listVanePlans, tickPlanStep } from "./lists";
import { advancePlans, startPlan, stepJobKey } from "./plans";
import { callTool } from "./tools";

const suffix = randomUUID().slice(0, 8);
const made = { company: "", other: "", user: "", colleague: "" };

const tick = (planId: string, stepId: string, done: boolean, userId = made.user) =>
  tickPlanStep(prisma, { companyId: made.company, userId }, { planId, stepId, done });

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

/** A person's job, and the plan Vane lays out from it through its own tool. */
async function drafted(by = made.user) {
  const job = await prisma.vaneJob.create({
    data: {
      companyId: made.company,
      key: `test:${randomUUID()}`,
      kind: "person",
      // A job keeps the person's whole request in its label.
      label: "Get every quote that has waited more than two weeks answered or closed by Friday.",
      trigger: "PERSON",
      requestedById: by,
      status: "DONE",
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
  it("waits for Start and keeps the job it came from; nothing runs or ticks before then", async () => {
    const { job, plan } = await drafted();
    expect(plan).toMatchObject({ status: "WAITING", jobId: job.id });
    const [mine] = (await listVanePlans(prisma, { companyId: made.company, userId: made.user })).filter((p) => p.id === plan.id);
    expect(mine).toMatchObject({ status: "waiting", canStart: true, whose: null });
    const [theirs] = (await listVanePlans(prisma, { companyId: made.company, userId: made.colleague })).filter((p) => p.id === plan.id);
    expect(theirs).toMatchObject({ status: "waiting", canStart: false, whose: "Rudo" });
    expect(await advancePlans(prisma, new Date(), { companyId: made.company })).toMatch(/0 steps queued/);
    expect(await tick(plan.id, plan.steps[2]!.id, true)).toBe("not-started");
    expect(await prisma.vanePlanStep.findUniqueOrThrow({ where: { id: plan.steps[2]!.id } })).toMatchObject({ status: "TODO" });
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
    expect(job).toMatchObject({ kind: "plan-step", status: "QUEUED", trigger: "SCHEDULE", requestedById: made.user });
    // The pages show the step; Claude reads the whole instruction.
    expect(jobLine(job.label)).toBe(list!.label);
    expect(job.label).toContain("Do step 1 only: List each quote that has waited more than two weeks");
    expect(job.label).toContain("What the person asked for: Get every quote that has waited more than two weeks answered or closed by Friday.");
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
    // The person's step waits for a person: the runner queues nothing for it.
    expect(await prisma.vaneJob.count({ where: { companyId: made.company, key: stepJobKey(call!.id) } })).toBe(0);
    expect(await tick(plan.id, call!.id, true)).toBe("ticked");
    expect(await prisma.vanePlan.findUniqueOrThrow({ where: { id: plan.id } })).toMatchObject({ status: "DONE" });
  });
});
