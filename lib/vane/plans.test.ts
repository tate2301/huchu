/**
 * A person's changes to Vane's plans, against the database: a person ticks
 * their own step done and back; Vane's steps, another workspace's plans and
 * plans that have not started are refused; the last step done finishes the
 * plan, and a step ticked back opens it again.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma";

import { tickPlanStep } from "./plans";

const suffix = randomUUID().slice(0, 8);
const made = { company: "", other: "", user: "" };

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
