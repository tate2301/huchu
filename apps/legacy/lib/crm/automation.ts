/**
 * Automation rules.
 *
 * Kept deliberately small: a handful of triggers, a handful of actions, and
 * conditions that are field comparisons rather than a scripting language. The
 * test of a rule engine isn't what it can express — it's whether the person who
 * wrote a rule six months ago can still tell what it does.
 *
 * Everything here is pure. The runner supplies the record and carries out the
 * actions; this file only decides whether and what.
 */
import type { CrmAutomationTrigger } from "@corelithzw/db";
import { z } from "zod";

export const AUTOMATION_TRIGGERS = [
  "LEAD_CREATED",
  "LEAD_STAGE_CHANGED",
  "DEAL_CREATED",
  "DEAL_STAGE_CHANGED",
  "TASK_OVERDUE",
  "RECORD_IDLE",
  "DOCUMENT_APPROVED",
  "PAYMENT_RECEIVED",
] as const;

export const TRIGGER_LABELS: Record<CrmAutomationTrigger, string> = {
  LEAD_CREATED: "A lead is created",
  LEAD_STAGE_CHANGED: "A lead moves stage",
  DEAL_CREATED: "A deal is created",
  DEAL_STAGE_CHANGED: "A deal moves stage",
  TASK_OVERDUE: "A task goes overdue",
  RECORD_IDLE: "Nothing happens on a record for a while",
  DOCUMENT_APPROVED: "A customer approves a document",
  PAYMENT_RECEIVED: "A payment comes in",
};

export const CONDITION_OPERATORS = [
  "equals",
  "not_equals",
  "contains",
  "is_empty",
  "is_not_empty",
  "greater_than",
  "less_than",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "is",
  not_equals: "is not",
  contains: "contains",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  greater_than: "is more than",
  less_than: "is less than",
};

export const conditionSchema = z.object({
  field: z.string().min(1).max(60),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type AutomationCondition = z.infer<typeof conditionSchema>;

export const ACTION_TYPES = [
  "CREATE_TASK",
  "ASSIGN_OWNER",
  "NOTIFY",
  "ADD_TAG",
  "SET_FIELD",
] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_LABELS: Record<ActionType, string> = {
  CREATE_TASK: "Create a task",
  ASSIGN_OWNER: "Assign an owner",
  NOTIFY: "Send a notification",
  ADD_TAG: "Add a tag",
  SET_FIELD: "Set a field",
};

export const actionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CREATE_TASK"),
    title: z.string().trim().min(1).max(200),
    taskType: z.string().max(40).optional(),
    /** Days from now. Zero means today. */
    dueInDays: z.number().int().min(0).max(365).default(1),
    /** Null assigns to whoever owns the record. */
    assignedToId: z.string().uuid().nullable().optional(),
  }),
  z.object({
    type: z.literal("ASSIGN_OWNER"),
    /** Null means "pick by the assignment rule". */
    assignedToId: z.string().uuid().nullable(),
  }),
  z.object({
    type: z.literal("NOTIFY"),
    /** Empty means the record's owner. */
    recipientIds: z.array(z.string().uuid()).max(20).default([]),
    message: z.string().trim().min(1).max(300),
  }),
  z.object({ type: z.literal("ADD_TAG"), tag: z.string().trim().min(1).max(40) }),
  z.object({
    type: z.literal("SET_FIELD"),
    field: z.string().trim().min(1).max(60),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
]);
export type AutomationAction = z.infer<typeof actionSchema>;

export const triggerConfigSchema = z.object({
  /** LEAD_STAGE_CHANGED / DEAL_STAGE_CHANGED: only when it lands here. */
  stage: z.string().max(60).optional(),
  /** RECORD_IDLE: how much silence counts as idle. */
  idleDays: z.number().int().min(1).max(365).optional(),
  /** RECORD_IDLE: which record type to watch. */
  entity: z.enum(["LEAD", "DEAL"]).optional(),
});
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const automationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  trigger: z.enum(AUTOMATION_TRIGGERS),
  triggerConfig: triggerConfigSchema.optional(),
  conditions: z.array(conditionSchema).max(10).default([]),
  actions: z.array(actionSchema).min(1).max(10),
  isEnabled: z.boolean().default(true),
});

/** Read a possibly-nested field off a record, e.g. "client.name". */
export function readField(record: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value === null || value === undefined || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, record);
}

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

export function evaluateCondition(
  record: Record<string, unknown>,
  condition: AutomationCondition,
): boolean {
  const actual = readField(record, condition.field);

  switch (condition.operator) {
    case "is_empty":
      return isBlank(actual);
    case "is_not_empty":
      return !isBlank(actual);
    case "contains": {
      const needle = String(condition.value ?? "").toLowerCase();
      if (Array.isArray(actual)) {
        return actual.some((item) => String(item).toLowerCase() === needle);
      }
      return String(actual ?? "").toLowerCase().includes(needle);
    }
    case "equals":
      // Compared as strings so "5" from a settings form matches the number 5.
      return String(actual ?? "") === String(condition.value ?? "");
    case "not_equals":
      return String(actual ?? "") !== String(condition.value ?? "");
    case "greater_than": {
      const left = toNumber(actual);
      const right = toNumber(condition.value);
      // An unanswered comparison is false, never true — a rule must not fire
      // on a field that isn't there.
      return left !== null && right !== null && left > right;
    }
    case "less_than": {
      const left = toNumber(actual);
      const right = toNumber(condition.value);
      return left !== null && right !== null && left < right;
    }
    default:
      return false;
  }
}

/** All conditions must hold. No conditions means the trigger is enough. */
export function matchesConditions(
  record: Record<string, unknown>,
  conditions: AutomationCondition[],
): boolean {
  return conditions.every((condition) => evaluateCondition(record, condition));
}

/**
 * Whether a rule should fire for this event, before conditions are checked.
 * Stage triggers are scoped to one stage when the rule names one, so "when a
 * deal is won" doesn't fire on every move.
 */
export function matchesTrigger(
  rule: { trigger: CrmAutomationTrigger; triggerConfig?: TriggerConfig | null },
  event: { trigger: CrmAutomationTrigger; stage?: string | null },
): boolean {
  if (rule.trigger !== event.trigger) return false;
  const wanted = rule.triggerConfig?.stage;
  if (!wanted) return true;
  return wanted === event.stage;
}

export function dueDateFromDays(days: number, now: Date = new Date()): Date {
  const due = new Date(now);
  due.setDate(due.getDate() + days);
  // Tasks land at nine in the morning rather than at whatever second the rule
  // happened to run.
  due.setHours(9, 0, 0, 0);
  return due;
}

/**
 * How a rule reads in the settings list. Written out rather than shown as
 * JSON, because a rule nobody can read is a rule nobody dares change.
 */
export function describeAutomation(rule: {
  trigger: CrmAutomationTrigger;
  triggerConfig?: TriggerConfig | null;
  conditions?: AutomationCondition[] | null;
  actions: AutomationAction[];
}): string {
  const parts: string[] = [];

  let when = TRIGGER_LABELS[rule.trigger];
  if (rule.triggerConfig?.stage) when += ` to ${rule.triggerConfig.stage}`;
  if (rule.trigger === "RECORD_IDLE" && rule.triggerConfig?.idleDays) {
    when = `Nothing happens on a ${(rule.triggerConfig.entity ?? "LEAD").toLowerCase()} for ${rule.triggerConfig.idleDays} days`;
  }
  parts.push(when);

  for (const condition of rule.conditions ?? []) {
    const operator = OPERATOR_LABELS[condition.operator];
    parts.push(
      condition.operator === "is_empty" || condition.operator === "is_not_empty"
        ? `and ${condition.field} ${operator}`
        : `and ${condition.field} ${operator} ${condition.value}`,
    );
  }

  const actions = rule.actions.map((action) => {
    switch (action.type) {
      case "CREATE_TASK":
        return `create "${action.title}" due in ${action.dueInDays} day${action.dueInDays === 1 ? "" : "s"}`;
      case "ASSIGN_OWNER":
        return action.assignedToId ? "assign a specific owner" : "assign by the usual rule";
      case "NOTIFY":
        return `notify ${action.recipientIds.length ? `${action.recipientIds.length} people` : "the owner"}`;
      case "ADD_TAG":
        return `tag it "${action.tag}"`;
      case "SET_FIELD":
        return `set ${action.field} to ${action.value === null ? "nothing" : action.value}`;
    }
  });

  return `${parts.join(", ")} → ${actions.join(", then ")}.`;
}

/** Fields a rule may write with SET_FIELD, per record type. */
export const SETTABLE_FIELDS: Record<string, string[]> = {
  LEAD: ["probability", "source", "lostReason", "estimatedValue"],
  DEAL: ["probability", "value", "lostReason"],
};

export function isSettableField(entity: string, field: string): boolean {
  return (SETTABLE_FIELDS[entity] ?? []).includes(field);
}
