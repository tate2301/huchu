import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

/**
 * Changes to Vane's plans that a person makes (PageVanePlan). Every one is a
 * signed-in person's press through `/api/vane/plans/…`; Vane's own steps tick
 * only as its jobs finish.
 */

type Db = Pick<PrismaClient, "vanePlan" | "vanePlanStep" | "$transaction">;

export const tickStepSchema = z.object({ done: z.boolean() });

export type TickOutcome =
  | { ok: true; planDone: boolean }
  | { ok: false; status: 404 | 403 | 409; message: string };

/**
 * A person ticks their own step done, or not done. Only a person's step can
 * be ticked this way, only on a plan that has started, and only in the
 * person's own workspace. When the last step is done the plan is done; a step
 * ticked back opens it again.
 */
export async function tickPlanStep(
  db: Db,
  { companyId, planId, stepId, done }: { companyId: string; userId: string; planId: string; stepId: string; done: boolean },
  now: Date = new Date(),
): Promise<TickOutcome> {
  const step = await db.vanePlanStep.findFirst({
    where: { id: stepId, planId, plan: { companyId } },
    select: { id: true, owner: true, status: true, plan: { select: { status: true } } },
  });
  if (!step) return { ok: false, status: 404, message: "That step is not in this plan" };
  if (step.owner !== "PERSON") return { ok: false, status: 403, message: "Vane's steps tick as its jobs finish" };
  if (step.plan.status !== "OPEN" && step.plan.status !== "DONE") {
    return { ok: false, status: 409, message: "This plan has not started" };
  }

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
