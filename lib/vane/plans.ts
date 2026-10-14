import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Vane's plans once they are laid out (PageVanePlan, PageVaneJob).
 *
 * A plan Vane drafts waits (`WAITING`) until a person presses Start; the
 * server refuses anything else on it before then. Started, it is `OPEN`: the
 * runner on the scheduled-jobs tick (`advancePlans`, in `VANE_JOBS`) queues
 * Vane's next step as a job of its own, ticks it when that job finishes, and
 * stops at a person's step, which waits for that person to tick it. A plan
 * made from a person's job is that person's: they start it and tick its
 * steps. One with no person behind it (the nightly look's) is anyone's in the
 * workspace.
 *
 * Every change here other than the runner's is a signed-in person's press
 * through `/api/vane/plans/…`.
 */

type Db = Pick<PrismaClient, "vanePlan" | "vanePlanStep" | "vaneJob" | "$transaction">;

export type PlanRefusal = { ok: false; status: 404 | 403 | 409; message: string };

/** Whose plan it is: the person whose job laid it out, if a person's. */
function ownerRefusal(plan: { job: { requestedById: string | null; requestedBy: { name: string } | null } | null }, userId: string): PlanRefusal | null {
  const owner = plan.job?.requestedById;
  if (!owner || owner === userId) return null;
  const name = plan.job?.requestedBy?.name.trim().split(/\s+/)[0] || "The person who gave Vane the job";
  return { ok: false, status: 403, message: `${name} gave Vane this job, so the plan is theirs` };
}

const OWNER_SELECT = { select: { requestedById: true, requestedBy: { select: { name: true } } } } as const;

// ---------------------------------------------------------------------------
// A person ticks their own step.

export const tickStepSchema = z.object({ done: z.boolean() });

export type TickOutcome = { ok: true; planDone: boolean } | PlanRefusal;

/**
 * A person ticks their own step done, or not done. Only a person's step can
 * be ticked this way, only on a plan that has started, only in the person's
 * own workspace, and only by the person whose plan it is. When the last step
 * is done the plan is done; a step ticked back opens it again.
 */
export async function tickPlanStep(
  db: Db,
  { companyId, userId, planId, stepId, done }: { companyId: string; userId: string; planId: string; stepId: string; done: boolean },
  now: Date = new Date(),
): Promise<TickOutcome> {
  const step = await db.vanePlanStep.findFirst({
    where: { id: stepId, planId, plan: { companyId } },
    select: { id: true, owner: true, status: true, plan: { select: { status: true, job: OWNER_SELECT } } },
  });
  if (!step) return { ok: false, status: 404, message: "That step is not in this plan" };
  if (step.owner !== "PERSON") return { ok: false, status: 403, message: "Vane's steps tick as its jobs finish" };
  if (step.plan.status !== "OPEN" && step.plan.status !== "DONE") {
    return { ok: false, status: 409, message: step.plan.status === "WAITING" ? "Press Start first" : "This plan has stopped" };
  }
  const notYours = ownerRefusal(step.plan, userId);
  if (notYours) return notYours;

  return db.$transaction(async (tx) => {
    await tx.vanePlanStep.update({
      where: { id: step.id },
      data: done ? { status: "DONE", doneAt: now } : { status: "TODO", doneAt: null },
    });
    const left = await tx.vanePlanStep.count({ where: { planId, status: { not: "DONE" } } });
    await tx.vanePlan.update({
      where: { id: planId },
      data: left === 0 ? { status: "DONE", doneAt: now } : { status: "OPEN", doneAt: null },
    });
    return { ok: true, planDone: left === 0 } as const;
  });
}

// ---------------------------------------------------------------------------
// Start, with the steps as the person left them.

export const startPlanSchema = z.object({
  /**
   * Change the steps: the steps to keep, in order, with their words. Each
   * keeps its owner; a step left out is dropped. Omitted, the plan starts as
   * Vane laid it out.
   */
  steps: z
    .array(z.object({ id: z.string().min(1), label: z.string().trim().min(1).max(160) }))
    .min(1)
    .max(20)
    .optional(),
});

export type StartOutcome = { ok: true } | PlanRefusal;

/** Start: a waiting plan begins. The runner takes Vane's first step on the next tick. */
export async function startPlan(
  db: Db,
  { companyId, userId, planId, steps }: { companyId: string; userId: string; planId: string; steps?: Array<{ id: string; label: string }> },
): Promise<StartOutcome> {
  const plan = await db.vanePlan.findFirst({
    where: { id: planId, companyId },
    select: { id: true, status: true, job: OWNER_SELECT, steps: { select: { id: true } } },
  });
  if (!plan) return { ok: false, status: 404, message: "That plan is not in this workspace" };
  if (plan.status !== "WAITING") return { ok: false, status: 409, message: "This plan has already started" };
  const notYours = ownerRefusal(plan, userId);
  if (notYours) return notYours;
  if (steps) {
    const known = new Set(plan.steps.map((step) => step.id));
    if (steps.some((step) => !known.has(step.id)) || new Set(steps.map((step) => step.id)).size !== steps.length) {
      return { ok: false, status: 409, message: "The steps changed since you opened the plan" };
    }
  }

  return db.$transaction(async (tx) => {
    // Only a waiting plan starts, once: a second press finds it started.
    const { count } = await tx.vanePlan.updateMany({ where: { id: planId, status: "WAITING" }, data: { status: "OPEN" } });
    if (count === 0) return { ok: false, status: 409, message: "This plan has already started" } as const;
    if (steps) {
      const kept = new Set(steps.map((step) => step.id));
      await tx.vanePlanStep.deleteMany({ where: { planId, id: { notIn: [...kept] } } });
      // Positions are unique in a plan: move them out of the way, then number them again.
      await tx.vanePlanStep.updateMany({ where: { planId }, data: { position: { increment: 1000 } } });
      for (const [index, step] of steps.entries()) {
        await tx.vanePlanStep.update({ where: { id: step.id }, data: { position: index + 1, label: step.label } });
      }
    }
    return { ok: true } as const;
  });
}

// ---------------------------------------------------------------------------
// The runner, on the scheduled-jobs tick.

/** The key of the job that runs one of Vane's steps: a step runs once. */
export const stepJobKey = (stepId: string) => `plan-step:${stepId}`;

/** A job's short name: its first line, cut at 120 characters. */
function shortLabel(text: string): string {
  const line = text.trim().split(/\n/)[0]!.trim();
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/** The first sentence of a job's answer, for under its step. */
function answerLine(text: string | null): string | null {
  const line = text?.trim().split(/\n/)[0]?.trim();
  if (!line) return null;
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

type PlanForStep = {
  title: string;
  dueOn: Date | null;
  job: { request: string | null; label: string } | null;
  steps: Array<{ id: string; position: number; label: string; owner: "VANE" | "PERSON"; status: string }>;
};

/** What Vane is asked when it runs one step: the plan, where the step sits in it, and the person's request. */
export function stepInstructions(plan: PlanForStep, stepId: string): string {
  const lines = plan.steps.map((step) => {
    const whose = step.owner === "VANE" ? "yours" : "a person's";
    const where = step.id === stepId ? "this step" : step.status === "DONE" ? "done" : "to come";
    return `${step.position}. ${step.label} (${whose}, ${where})`;
  });
  const step = plan.steps.find((candidate) => candidate.id === stepId)!;
  const request = plan.job?.request?.trim() || plan.job?.label;
  return [
    `You are working on one step of a plan a person started: "${plan.title}"${plan.dueOn ? `, due ${plan.dueOn.toISOString().slice(0, 10)}` : ""}.`,
    request ? `What the person asked for: ${request}` : null,
    `The steps, in order:\n${lines.join("\n")}`,
    `Do step ${step.position} only: ${step.label}`,
    "Read what you need, and raise a card for anything a person must act on. Do not lay out another plan. When you are done, say in one sentence what you found or did: it is shown under the step.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Moves every started plan on as far as it can go: a finished step job ticks
 * its step, Vane's next step is queued as a job, and a person's step is
 * marked as theirs to do now. A plan whose steps are all done is done. Plans
 * in a paused workspace wait.
 */
export async function advancePlans(db: Db, now: Date, options: { companyId?: string } = {}): Promise<string> {
  const plans = await db.vanePlan.findMany({
    where: {
      status: "OPEN",
      companyId: options.companyId,
      company: { OR: [{ vaneSettings: null }, { vaneSettings: { paused: false } }] },
    },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      companyId: true,
      title: true,
      dueOn: true,
      job: { select: { request: true, label: true, requestedById: true } },
      steps: { orderBy: { position: "asc" }, select: { id: true, position: true, label: true, owner: true, status: true } },
    },
  });
  let queued = 0;
  let ticked = 0;
  let finished = 0;
  for (const plan of plans) {
    for (const step of plan.steps) {
      if (step.status === "DONE") continue;
      if (step.owner === "PERSON") {
        if (step.status !== "NOW") await db.vanePlanStep.update({ where: { id: step.id }, data: { status: "NOW" } });
        break;
      }
      const key = stepJobKey(step.id);
      const job = await db.vaneJob.findUnique({
        where: { companyId_key: { companyId: plan.companyId, key } },
        select: { status: true, result: true, finishedAt: true },
      });
      if (!job) {
        await db.vaneJob.create({
          data: {
            companyId: plan.companyId,
            key,
            kind: "plan-step",
            label: shortLabel(step.label),
            request: stepInstructions(plan, step.id),
            trigger: "SCHEDULE",
            requestedById: plan.job?.requestedById ?? null,
            runAfter: now,
          },
        });
        await db.vanePlanStep.update({ where: { id: step.id }, data: { status: "NOW" } });
        queued += 1;
        break;
      }
      if (job.status !== "DONE") {
        if (step.status !== "NOW") await db.vanePlanStep.update({ where: { id: step.id }, data: { status: "NOW" } });
        break;
      }
      await db.vanePlanStep.update({
        where: { id: step.id },
        data: { status: "DONE", doneAt: job.finishedAt ?? now, progressLabel: answerLine(job.result) },
      });
      step.status = "DONE";
      ticked += 1;
    }
    if (plan.steps.every((step) => step.status === "DONE")) {
      await db.vanePlan.update({ where: { id: plan.id }, data: { status: "DONE", doneAt: now } });
      finished += 1;
    }
  }
  return `${plans.length} plans: ${queued} steps queued, ${ticked} ticked, ${finished} done`;
}
