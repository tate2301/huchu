import { z } from "zod";

import type { CrmLeadStage } from "@prisma/client";

import { createCrmTask, CrmTaskRefused } from "@/lib/crm/create-task";
import { DealStageRefused, moveDealStage } from "@/lib/crm/deal-stage";
import { ActivityRefused, logCrmActivity } from "@/lib/crm/log-activity";
import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";
import { applyRecordBulk, BulkRefused, type BulkResult } from "@/lib/crm/registers/server/bulk";
import { DEAL_BULK, LEAD_BULK } from "@/lib/crm/registers/server/record-bulk";
import { CRM_TASK_TYPES } from "@/lib/crm/tasks";

import { listOf, longDay, refuseUnlessRoute } from "./gate";
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

const dealStage = {
  kind: "crm.deal.stage",
  module: "crm",
  description:
    "Move one deal to another stage of its pipeline: a deal the customer has signed to Won, one gone quiet past its close date to Lost with the reason. The stage's own gates still apply: a missing required field stops it, and the result says what is missing.",
  params: z.object({
    dealId: z.string().min(1),
    deal: z.string().min(1).describe('The deal as people know it: "Pomona Offices, fit-out".'),
    stageId: z.string().min(1),
    stage: z.string().min(1).describe("The stage's name."),
    lostReason: z.string().trim().max(500).optional().describe("Moving to a lost stage: why, in the customer's words where you have them."),
  }),
  fields: [],
  verb: (p) => `Move to ${p.stage}`,
  title: (p) => `Move ${p.deal} to ${p.stage}${p.lostReason ? `: ${p.lostReason}` : ""}`,
  target: (p) => `/crm/deals/${p.dealId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/crm/deals"),
  async run(context, p) {
    try {
      const moved = await moveDealStage(context.session, p.dealId, { stageId: p.stageId, lostReason: p.lostReason });
      return moved.moved ? `${p.deal} moved from ${moved.from} to ${moved.to}.` : `${p.deal} was already in ${moved.to}.`;
    } catch (error) {
      if (error instanceof DealStageRefused) throw new VaneActionError(error.blockers ? `Not moved. ${error.blockers.join(" ")}` : error.message);
      throw error;
    }
  },
} satisfies VaneActionKind<{ dealId: string; deal: string; stageId: string; stage: string; lostReason?: string }>;

const leadStage = {
  kind: "crm.lead.stage",
  module: "crm",
  description: `Move one or more leads to a stage (${CRM_LEAD_STAGES.join(", ")}). Past Contacted a lead becomes a deal, as on the board. Lost needs lostReason.`,
  params: z
    .object({
      leadIds: z.array(z.string().min(1)).min(1).max(50),
      leads: z.array(z.string().min(1)).min(1).max(50).describe("Each lead's title, in the same order."),
      stage: z.enum(CRM_LEAD_STAGES as [CrmLeadStage, ...CrmLeadStage[]]),
      lostReason: z.string().trim().max(500).optional(),
    })
    .refine((p) => p.stage !== "LOST" || Boolean(p.lostReason), { message: "Say why they were lost.", path: ["lostReason"] }),
  fields: [],
  verb: (p) => `Move to ${CRM_STAGE_LABELS[p.stage]}`,
  title: (p) => `Move ${listOf(p.leads)} to ${CRM_STAGE_LABELS[p.stage]}${p.lostReason ? `: ${p.lostReason}` : ""}`,
  target: (p) => (p.leadIds.length === 1 ? `/crm/leads/${p.leadIds[0]}` : `/crm/leads?stage=${p.stage}`),
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/crm/leads/bulk"),
  async run(context, p) {
    const result = await bulkOrSay(() => applyRecordBulk(LEAD_BULK, context.session, { action: "status", ids: p.leadIds, value: p.stage, reason: p.lostReason }));
    return bulkWords(result, { one: "lead", many: "leads" }, `moved to ${CRM_STAGE_LABELS[p.stage]}`, `in ${CRM_STAGE_LABELS[p.stage]}`);
  },
} satisfies VaneActionKind<{ leadIds: string[]; leads: string[]; stage: CrmLeadStage; lostReason?: string }>;

const RECORDS = { deals: { one: "deal", many: "deals", spec: DEAL_BULK }, leads: { one: "lead", many: "leads", spec: LEAD_BULK } } as const;

const assignOwner = {
  kind: "crm.owner.assign",
  module: "crm",
  description:
    "Give deals or leads an owner: unassigned ones, or those left with someone who has gone. Only records the approving person may edit move; the rest are left and the result says why.",
  params: z.object({
    records: z.enum(["deals", "leads"]),
    ids: z.array(z.string().min(1)).min(1).max(50),
    names: z.array(z.string().min(1)).min(1).max(50).describe("Each record's title, in the same order."),
    ownerId: z.string().min(1),
    owner: z.string().min(1).describe("The new owner's name."),
  }),
  fields: [],
  verb: (p) => `Give ${p.ids.length === 1 ? "it" : `all ${p.ids.length}`} to ${p.owner.split(/\s+/)[0]}`,
  title: (p) => `Give ${listOf(p.names)} to ${p.owner}`,
  target: (p) => (p.ids.length === 1 ? `/crm/${p.records}/${p.ids[0]}` : `/crm/${p.records}?owner=${encodeURIComponent(p.ownerId)}`),
  refuse: (context, p) => refuseUnlessRoute(context, `/api/v2/crm/${p.records}/bulk`),
  async run(context, p) {
    const record = RECORDS[p.records];
    const result = await bulkOrSay(() => applyRecordBulk(record.spec, context.session, { action: "assign", ids: p.ids, value: p.ownerId }));
    return bulkWords(result, record, `given to ${p.owner}`, `with ${p.owner}`);
  },
} satisfies VaneActionKind<{ records: "deals" | "leads"; ids: string[]; names: string[]; ownerId: string; owner: string }>;

const ACTIVITY_TYPES = ["NOTE", "CALL", "EMAIL", "WHATSAPP", "MEETING"] as const;
const ACTIVITY_WORD: Record<(typeof ACTIVITY_TYPES)[number], string> = { NOTE: "note", CALL: "call", EMAIL: "email", WHATSAPP: "WhatsApp", MEETING: "meeting" };

const logNote = {
  kind: "crm.note.log",
  module: "crm",
  description:
    "Log a note, call, email, WhatsApp or meeting on a deal, lead, company or person, so its history says what happened: a customer's reply Vane found, what was agreed. It moves the record's last contacted date.",
  params: z
    .object({
      type: z.enum(ACTIVITY_TYPES).default("NOTE"),
      subject: z.string().trim().min(1).max(200),
      body: z.string().trim().max(4000).optional(),
      about: z.string().min(1).max(120).describe('The record, in words: "Pomona Offices".'),
      dealId: z.string().uuid().optional(),
      leadId: z.string().uuid().optional(),
      clientId: z.string().uuid().optional(),
      personId: z.string().uuid().optional(),
    })
    .refine((p) => Boolean(p.dealId || p.leadId || p.clientId || p.personId), { message: "Name the record it goes on." }),
  fields: [
    { name: "subject", label: "Subject", type: "text" },
    { name: "body", label: "Note", type: "text", multiline: true },
  ],
  verb: () => "Log it",
  title: (p) => `Log a ${ACTIVITY_WORD[p.type]} on ${p.about}: ${p.subject}`,
  target: (p) =>
    p.dealId ? `/crm/deals/${p.dealId}` : p.leadId ? `/crm/leads/${p.leadId}` : p.clientId ? `/crm/companies/${p.clientId}` : `/crm/people/${p.personId}`,
  refuse: (context) => refuseUnlessRoute(context, "/api/v2/crm/activities"),
  async run(context, p) {
    try {
      await logCrmActivity({ companyId: context.companyId, userId: context.userId }, p);
      return `Logged on ${p.about}.`;
    } catch (error) {
      if (error instanceof ActivityRefused) throw new VaneActionError(`${error.message}.`);
      throw error;
    }
  },
} satisfies VaneActionKind<{
  type: (typeof ACTIVITY_TYPES)[number];
  subject: string;
  body?: string;
  about: string;
  dealId?: string;
  leadId?: string;
  clientId?: string;
  personId?: string;
}>;

async function bulkOrSay(change: () => Promise<BulkResult>): Promise<BulkResult> {
  try {
    return await change();
  } catch (error) {
    if (error instanceof BulkRefused) throw new VaneActionError(`${error.message}.`);
    throw error;
  }
}

/** "3 leads moved to Qualified. 1 was left: they belong to someone else." */
function bulkWords(result: BulkResult, noun: { one: string; many: string }, done: string, already: string): string {
  const count = (n: number) => `${n} ${n === 1 ? noun.one : noun.many}`;
  if (result.updated === 0 && result.unchanged === 0) {
    throw new VaneActionError(result.skipped ? `None changed: ${result.skippedReason}.` : `None of those ${noun.many} is here any more.`);
  }
  const parts = [result.updated ? `${count(result.updated)} ${done}.` : `They were already ${already}.`];
  if (result.skipped) parts.push(`${count(result.skipped)} left: ${result.skippedReason}.`);
  if (result.notFound) parts.push(`${count(result.notFound)} not found.`);
  return parts.join(" ");
}

export const CRM_ACTIONS = [task, dealStage, leadStage, assignOwner, logNote] as const;
