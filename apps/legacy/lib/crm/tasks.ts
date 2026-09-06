/**
 * Generic CRM tasks.
 *
 * What separates this from a reminder list is the outcome: completing a call
 * task asks what happened, and that answer is what makes "we rang them twice
 * and they never picked up" visible rather than folklore.
 */
import type {
  CrmRecurrence,
  CrmTaskOutcome,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTaskType,
  Prisma,
} from "@corelithzw/db";
import { z } from "zod";

export const CRM_TASK_TYPES = [
  "CALL",
  "EMAIL",
  "WHATSAPP",
  "MEETING",
  "VISIT_PREP",
  "DOCUMENT_FOLLOW_UP",
  "PAYMENT_FOLLOW_UP",
  "GENERAL",
] as const;

export const CRM_TASK_TYPE_LABELS: Record<CrmTaskType, string> = {
  CALL: "Call",
  EMAIL: "Email",
  WHATSAPP: "WhatsApp",
  MEETING: "Meeting",
  VISIT_PREP: "Site visit prep",
  DOCUMENT_FOLLOW_UP: "Document follow-up",
  PAYMENT_FOLLOW_UP: "Payment follow-up",
  GENERAL: "General",
};

export const CRM_TASK_PRIORITY_LABELS: Record<CrmTaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

export const CRM_TASK_OUTCOME_LABELS: Record<CrmTaskOutcome, string> = {
  ANSWERED: "Answered",
  NO_ANSWER: "No answer",
  CALL_BACK_LATER: "Call back later",
  QUALIFIED: "Qualified",
  NOT_INTERESTED: "Not interested",
  REPLIED: "Replied",
  NO_REPLY: "No reply",
  ATTENDED: "Attended",
  NO_SHOW: "Didn't show",
  DONE: "Done",
};

/**
 * Which outcomes a task type can end with. A task type with no entry here is
 * completed without being asked — most general tasks are just done.
 */
const OUTCOMES_BY_TYPE: Partial<Record<CrmTaskType, CrmTaskOutcome[]>> = {
  CALL: ["ANSWERED", "NO_ANSWER", "CALL_BACK_LATER", "QUALIFIED", "NOT_INTERESTED"],
  EMAIL: ["REPLIED", "NO_REPLY"],
  WHATSAPP: ["REPLIED", "NO_REPLY"],
  MEETING: ["ATTENDED", "NO_SHOW", "CALL_BACK_LATER"],
  DOCUMENT_FOLLOW_UP: ["REPLIED", "NO_REPLY", "CALL_BACK_LATER"],
  PAYMENT_FOLLOW_UP: ["ANSWERED", "NO_ANSWER", "CALL_BACK_LATER"],
};

export function outcomesForType(type: CrmTaskType): CrmTaskOutcome[] {
  return OUTCOMES_BY_TYPE[type] ?? [];
}

export function requiresOutcome(type: CrmTaskType): boolean {
  return outcomesForType(type).length > 0;
}

/**
 * Outcomes that mean the conversation isn't finished. Completing a task with
 * one of these is the natural moment to offer the next one.
 */
const FOLLOW_UP_OUTCOMES = new Set<CrmTaskOutcome>([
  "NO_ANSWER",
  "CALL_BACK_LATER",
  "NO_REPLY",
  "NO_SHOW",
]);

export function suggestsFollowUp(outcome: CrmTaskOutcome | null | undefined): boolean {
  return Boolean(outcome && FOLLOW_UP_OUTCOMES.has(outcome));
}

export const taskRecordSchema = z.object({
  leadId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  personId: z.string().uuid().nullable().optional(),
  siteId: z.string().uuid().nullable().optional(),
});

export const createTaskSchema = taskRecordSchema.extend({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
  type: z.enum(CRM_TASK_TYPES).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueAt: z.string().datetime(),
  hasDueTime: z.boolean().optional(),
  remindAt: z.string().datetime().nullable().optional(),
  assignedToId: z.string().uuid().nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]).optional(),
  recurrenceInterval: z.number().int().min(1).max(52).optional(),
});

export const completeTaskSchema = z.object({
  outcome: z.enum(Object.keys(CRM_TASK_OUTCOME_LABELS) as [CrmTaskOutcome, ...CrmTaskOutcome[]]).nullable().optional(),
  outcomeNotes: z.string().trim().max(2000).nullable().optional(),
});

export type TaskQueue =
  /** Everything on the record, open or done — what a record page's tab wants. */
  | "ALL"
  | "MINE"
  | "TODAY"
  | "OVERDUE"
  | "UPCOMING"
  | "COMPLETED"
  | "TEAM"
  | "UNASSIGNED";

export const TASK_QUEUE_LABELS: Record<TaskQueue, string> = {
  ALL: "All",
  MINE: "My tasks",
  TODAY: "Today",
  OVERDUE: "Overdue",
  UPCOMING: "Upcoming",
  COMPLETED: "Completed",
  TEAM: "Team",
  UNASSIGNED: "Unassigned",
};

/** Start and end of the local day containing `now`, in UTC terms. */
function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * The where clause behind each queue. "Today" deliberately includes anything
 * already overdue — a task from last week is still today's problem.
 */
export function taskQueueWhere(
  queue: TaskQueue,
  params: { companyId: string; userId: string; now?: Date },
): Prisma.CrmTaskWhereInput {
  const now = params.now ?? new Date();
  const { end } = dayBounds(now);
  const base: Prisma.CrmTaskWhereInput = { companyId: params.companyId };

  switch (queue) {
    case "ALL":
      return base;
    case "MINE":
      return { ...base, assignedToId: params.userId, status: "OPEN" };
    case "TODAY":
      return {
        ...base,
        assignedToId: params.userId,
        status: "OPEN",
        dueAt: { lt: end },
      };
    case "OVERDUE":
      return { ...base, assignedToId: params.userId, status: "OPEN", dueAt: { lt: now } };
    case "UPCOMING":
      return { ...base, assignedToId: params.userId, status: "OPEN", dueAt: { gte: end } };
    case "COMPLETED":
      return { ...base, assignedToId: params.userId, status: "COMPLETED" };
    case "TEAM":
      return { ...base, status: "OPEN", assignedToId: { not: null } };
    case "UNASSIGNED":
      return { ...base, status: "OPEN", assignedToId: null };
    default:
      return base;
  }
}

/** When the next occurrence of a recurring task falls. */
export function nextOccurrence(
  dueAt: Date,
  recurrence: CrmRecurrence,
  interval: number,
): Date | null {
  if (recurrence === "NONE") return null;
  const next = new Date(dueAt);
  const step = Math.max(1, interval);

  if (recurrence === "DAILY") next.setDate(next.getDate() + step);
  else if (recurrence === "WEEKLY") next.setDate(next.getDate() + step * 7);
  else if (recurrence === "MONTHLY") {
    // Keep the day of month where possible; a task due on the 31st recurs on
    // the last day of a shorter month rather than skipping into the next one.
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + step);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }

  return next;
}

export function isTaskOverdue(
  task: { dueAt: Date | string; status: CrmTaskStatus },
  now: Date = new Date(),
): boolean {
  if (task.status !== "OPEN") return false;
  const due = typeof task.dueAt === "string" ? new Date(task.dueAt) : task.dueAt;
  return due.getTime() < now.getTime();
}

/** The record a task hangs off, for links and grouping. */
export function taskRecordRef(task: {
  leadId?: string | null;
  dealId?: string | null;
  clientId?: string | null;
  personId?: string | null;
  siteId?: string | null;
}): { kind: string; id: string; href: string } | null {
  if (task.dealId) return { kind: "deal", id: task.dealId, href: `/crm/deals/${task.dealId}` };
  if (task.leadId) return { kind: "lead", id: task.leadId, href: `/crm/leads/${task.leadId}` };
  if (task.clientId) {
    return { kind: "company", id: task.clientId, href: `/crm/companies/${task.clientId}` };
  }
  if (task.personId) {
    return { kind: "person", id: task.personId, href: `/crm/people/${task.personId}` };
  }
  if (task.siteId) return { kind: "site", id: task.siteId, href: `/crm/sites/${task.siteId}` };
  return null;
}
