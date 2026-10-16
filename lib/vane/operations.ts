import { z } from "zod";

import { prisma } from "@/lib/prisma";

import { tickPlanStep } from "./lists";
import type { Operation } from "@/lib/operations/types";
import { OperationRefused } from "@/lib/operations/types";

const tickStep = {
  key: "vane.plan.tick_step",
  name: "Tick a step in a plan",
  risk: "change",
  product: "vane",
  description:
    "Mark a person's step in one of Vane's plans done, when what it asks has been done (a return filed, a run approved). Vane's own steps are Vane's; this is for a person's.",
  input: z.object({
    planId: z.string().min(1),
    stepId: z.string().min(1),
    step: z.string().min(1).describe("The step's words, as the plan shows them."),
    plan: z.string().min(1).describe("The plan's title."),
  }),
  fields: [],
  verb: () => "Mark it done",
  title: (p) => `Mark "${p.step}" done in ${p.plan}`,
  target: (p) => `/vane/plans/${p.planId}`,
  authorize: () => null,
  async run(context, p) {
    const outcome = await tickPlanStep(prisma, { companyId: context.companyId, userId: context.userId }, { planId: p.planId, stepId: p.stepId, done: true });
    if (outcome === "not-found") throw new OperationRefused("That step is not in the plan any more.");
    if (outcome === "vane-owns-it") throw new OperationRefused("That step is Vane's; it ticks it when its job finishes.");
    return `"${p.step}" is done.`;
  },
} satisfies Operation<{ planId: string; stepId: string; step: string; plan: string }>;

export const VANE_OWN_OPERATIONS = [tickStep] as const;
