import { z } from "zod";

import { createCrmTask, CrmTaskRefused } from "@/lib/crm/create-task";
import { CRM_TASK_TYPES } from "@/lib/crm/tasks";

import { longDay, refuseUnlessRoute } from "./gate";
import { VaneActionError, type VaneActionKind } from "./types";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Write it as a day, like 2026-10-30.");

const task = {
  kind: "crm.task.create",
  module: "crm",
  description:
    "Raise a CRM task, filed against a deal, lead, company or person, for the person approving or for someone else (that needs their permission to assign others). Use for a follow-up that a person must do: ring a customer, chase a quote.",
  params: z.object({
    title: z.string().trim().min(1).max(200),
    dueOn: day,
    type: z.enum(CRM_TASK_TYPES).default("GENERAL"),
    assignedToId: z.string().min(1).optional(),
    assignedToName: z.string().min(1).optional(),
    dealId: z.string().min(1).optional(),
    leadId: z.string().min(1).optional(),
    clientId: z.string().min(1).optional(),
    personId: z.string().min(1).optional(),
    about: z.string().max(120).optional().describe('What it is filed against, in words: "Pomona Offices".'),
  }),
  fields: [
    { name: "title", label: "Task", type: "text" },
    { name: "dueOn", label: "Due on", type: "date" },
  ],
  verb: () => "Raise the task",
  title: (p) => `${p.title}${p.about ? `, for ${p.about}` : ""}, due ${longDay(p.dueOn)}${p.assignedToName ? `, for ${p.assignedToName}` : ""}`,
  target: (p) => (p.dealId ? `/crm/deals/${p.dealId}` : p.leadId ? `/crm/leads/${p.leadId}` : "/crm/tasks"),
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/crm/tasks"),
  async run(context, p) {
    try {
      const created = await createCrmTask(context.session, {
        title: p.title,
        type: p.type,
        dueAt: new Date(`${p.dueOn}T00:00:00Z`).toISOString(),
        hasDueTime: false,
        assignedToId: p.assignedToId ?? null,
        dealId: p.dealId ?? null,
        leadId: p.leadId ?? null,
        clientId: p.clientId ?? null,
        personId: p.personId ?? null,
      });
      return `Raised "${created.title}" for ${created.assignedTo?.name ?? "you"}, due ${longDay(p.dueOn)}.`;
    } catch (error) {
      if (error instanceof CrmTaskRefused) throw new VaneActionError(error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{
  title: string;
  dueOn: string;
  type: (typeof CRM_TASK_TYPES)[number];
  assignedToId?: string;
  assignedToName?: string;
  dealId?: string;
  leadId?: string;
  clientId?: string;
  personId?: string;
  about?: string;
}>;

export const CRM_ACTIONS = [task] as const;
