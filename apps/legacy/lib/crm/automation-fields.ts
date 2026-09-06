/**
 * What an automation rule is allowed to look at and change.
 *
 * The builder used to take the field name and the value as free text. Typing
 * `estimatedvalue` instead of `estimatedValue` produced a rule that saved
 * cleanly and then never matched anything, and typing a stage as "Quoted"
 * rather than `QUOTED` did the same — a rule that looks configured and does
 * nothing is worse than one that refuses to save. Every option that names a
 * field, an enum value or a person is picked from a list now, and this is the
 * list.
 *
 * Deliberately a hand-written catalogue rather than something derived from the
 * Prisma schema: not every column on a lead is a sensible thing to automate
 * on, and the labels here are the words the sales team uses, not the column
 * names.
 */
import type { CrmAutomationTrigger } from "@corelithzw/db";

import { CRM_LEAD_STAGES, CRM_STAGE_LABELS } from "@/lib/crm/pipeline";
import { CRM_TASK_TYPE_LABELS } from "@/lib/crm/tasks";

export type FieldKind = "text" | "number" | "enum" | "user" | "date" | "boolean";

export type AutomationField = {
  /** The path `readField` walks, e.g. `client.name`. */
  path: string;
  label: string;
  kind: FieldKind;
  /** For `enum`, the values and how to say them. */
  options?: Array<{ value: string; label: string }>;
  /** Whether a rule may write to it, as opposed to only test it. */
  writable?: boolean;
};

const LEAD_CHANNELS = [
  "MANUAL",
  "WEB_FORM",
  "WHATSAPP",
  "PHONE",
  "EMAIL",
  "WALK_IN",
  "REFERRAL",
  "SOCIAL",
  "API",
] as const;

const CHANNEL_LABELS: Record<string, string> = {
  MANUAL: "Entered by hand",
  WEB_FORM: "Web form",
  WHATSAPP: "WhatsApp",
  PHONE: "Phone",
  EMAIL: "Email",
  WALK_IN: "Walk-in",
  REFERRAL: "Referral",
  SOCIAL: "Social",
  API: "API",
};

const stageOptions = CRM_LEAD_STAGES.map((stage) => ({
  value: stage,
  label: CRM_STAGE_LABELS[stage],
}));

const channelOptions = LEAD_CHANNELS.map((channel) => ({
  value: channel,
  label: CHANNEL_LABELS[channel] ?? channel,
}));

const LEAD_FIELDS: AutomationField[] = [
  { path: "stage", label: "Stage", kind: "enum", options: stageOptions },
  { path: "estimatedValue", label: "Estimated value", kind: "number", writable: true },
  { path: "currency", label: "Currency", kind: "text" },
  { path: "probability", label: "Probability", kind: "number", writable: true },
  { path: "sourceChannel", label: "Channel", kind: "enum", options: channelOptions },
  { path: "source", label: "Source", kind: "text", writable: true },
  { path: "assignedToId", label: "Owner", kind: "user", writable: true },
  { path: "title", label: "Title", kind: "text" },
  { path: "contactName", label: "Contact name", kind: "text" },
  { path: "contactPhone", label: "Contact phone", kind: "text" },
  { path: "contactEmail", label: "Contact email", kind: "text" },
  { path: "client.name", label: "Company name", kind: "text" },
  { path: "client.city", label: "Company city", kind: "text" },
  { path: "firstContactAt", label: "First contacted", kind: "date" },
  { path: "createdAt", label: "Created", kind: "date" },
];

const DEAL_FIELDS: AutomationField[] = [
  { path: "value", label: "Value", kind: "number", writable: true },
  { path: "currency", label: "Currency", kind: "text" },
  { path: "probability", label: "Probability", kind: "number", writable: true },
  {
    path: "status",
    label: "Status",
    kind: "enum",
    options: [
      { value: "OPEN", label: "Open" },
      { value: "WON", label: "Won" },
      { value: "LOST", label: "Lost" },
    ],
  },
  {
    path: "forecastCategory",
    label: "Forecast",
    kind: "enum",
    writable: true,
    options: [
      { value: "PIPELINE", label: "Pipeline" },
      { value: "BEST_CASE", label: "Best case" },
      { value: "COMMIT", label: "Commit" },
      { value: "CLOSED", label: "Closed" },
    ],
  },
  { path: "stage.name", label: "Stage name", kind: "text" },
  { path: "assignedToId", label: "Owner", kind: "user", writable: true },
  { path: "title", label: "Title", kind: "text" },
  { path: "expectedCloseDate", label: "Expected close", kind: "date", writable: true },
  { path: "client.name", label: "Company name", kind: "text" },
  { path: "createdAt", label: "Created", kind: "date" },
];

/**
 * Which record a trigger hands to the rule. `RECORD_IDLE` can be pointed at
 * either, so its fields are the ones both share — offering a lead-only field
 * on a rule that might run against a deal is how you get a rule that silently
 * half-works.
 */
export function fieldsForTrigger(trigger: CrmAutomationTrigger): AutomationField[] {
  switch (trigger) {
    case "LEAD_CREATED":
    case "LEAD_STAGE_CHANGED":
      return LEAD_FIELDS;
    case "DEAL_CREATED":
    case "DEAL_STAGE_CHANGED":
    case "DOCUMENT_APPROVED":
    case "PAYMENT_RECEIVED":
      return DEAL_FIELDS;
    case "RECORD_IDLE":
    case "TASK_OVERDUE":
    default: {
      const shared = new Set(DEAL_FIELDS.map((field) => field.path));
      return LEAD_FIELDS.filter((field) => shared.has(field.path));
    }
  }
}

export function writableFieldsForTrigger(trigger: CrmAutomationTrigger): AutomationField[] {
  return fieldsForTrigger(trigger).filter((field) => field.writable);
}

export function findField(
  trigger: CrmAutomationTrigger,
  path: string,
): AutomationField | undefined {
  return fieldsForTrigger(trigger).find((field) => field.path === path);
}

/** Which triggers care about a landing stage, and so should offer the picker. */
export function triggerUsesStage(trigger: CrmAutomationTrigger): boolean {
  return trigger === "LEAD_STAGE_CHANGED" || trigger === "DEAL_STAGE_CHANGED";
}

export function triggerUsesIdle(trigger: CrmAutomationTrigger): boolean {
  return trigger === "RECORD_IDLE";
}

export const LEAD_STAGE_OPTIONS = stageOptions;

export const TASK_TYPE_OPTIONS = Object.entries(CRM_TASK_TYPE_LABELS).map(
  ([value, label]) => ({ value, label }),
);

/**
 * Operators that make sense for a kind of field. Offering "contains" on a
 * number, or "is more than" on a stage, produces rules that never match —
 * which reads as the automation being broken rather than misconfigured.
 */
export function operatorsForKind(kind: FieldKind) {
  switch (kind) {
    case "number":
    case "date":
      return ["equals", "not_equals", "greater_than", "less_than", "is_empty", "is_not_empty"] as const;
    case "enum":
    case "user":
    case "boolean":
      return ["equals", "not_equals", "is_empty", "is_not_empty"] as const;
    case "text":
    default:
      return ["equals", "not_equals", "contains", "is_empty", "is_not_empty"] as const;
  }
}

/** Operators that take no value — the value box should disappear for these. */
export function operatorNeedsValue(operator: string): boolean {
  return operator !== "is_empty" && operator !== "is_not_empty";
}
