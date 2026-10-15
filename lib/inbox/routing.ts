import type { NotificationType } from "@prisma/client";

import { isInboxModule, needsYou, type InboxModule } from "./describe";

/**
 * Management → Notifications (MgmtNotifications): who hears about what, for
 * the whole workspace. Who is told is decided where each notification is sent
 * (managers and owners for approvals, the person named or given the work, the
 * people on a record); each person then turns kinds and email off for
 * themselves (`UserNotificationPreference`). So this reads what happened: the
 * people each kind reached in the app in the last 30 days, and which of them
 * also get it by email today. Nothing here is a setting yet: a kind × channel
 * setting needs a table (see NOTES.md, Notifications).
 */

export type RoutingGroup = "needs" | "updates";
export type Category = "HR" | "OPS" | "CRM";

export type RoutingKind = {
  key: string;
  group: RoutingGroup;
  label: string;
  note: string;
  /** Feature prefixes that make the kind possible here; null when every workspace has it. */
  features: string[] | null;
};

export const ROUTING_KINDS: RoutingKind[] = [
  { key: "approvals", group: "needs", label: "Approvals", note: "Pay runs, disbursements, requisitions, prices and deliveries", features: null },
  { key: "mentions", group: "needs", label: "Mentions", note: "When someone names a person on a record", features: ["crm."] },
  { key: "assigned", group: "needs", label: "Work handed over", note: "Leads, tasks, follow-ups and counts given to someone", features: ["crm.", "retail."] },
  { key: "vane", group: "needs", label: "Vane’s issues", note: "Things Vane found that need a person", features: null },
  { key: "permits", group: "needs", label: "Permits", note: "A permit about to expire, or expired", features: ["compliance."] },
  { key: "decisions", group: "updates", label: "Decisions", note: "Approved, rejected or cancelled, back to whoever asked", features: null },
  { key: "payments", group: "updates", label: "Payments in", note: "Invoices paid, by any method", features: ["accounting."] },
  { key: "records", group: "updates", label: "Your records", note: "Comments, activity, quotes and new leads on records people are on", features: ["crm."] },
  { key: "incidents", group: "updates", label: "Incidents and work orders", note: "Reported, moved on or closed", features: ["compliance.", "maintenance.", "hr."] },
  { key: "tills", group: "updates", label: "Tills and cash-ups", note: "A till closes short or over, and its sign-off", features: ["retail."] },
  { key: "stock", group: "updates", label: "Stock and staff", note: "Transfers on their way, and messages to staff", features: ["retail."] },
  { key: "notices", group: "updates", label: "School notices", note: "Notices to parents, pupils and teachers", features: ["schools."] },
];

const KIND_OF_TYPE: Record<NotificationType, string> = {
  HR_PAYROLL_SUBMITTED: "approvals",
  HR_PAYROLL_APPROVED: "decisions",
  HR_PAYROLL_REJECTED: "decisions",
  HR_DISBURSEMENT_SUBMITTED: "approvals",
  HR_DISBURSEMENT_APPROVED: "decisions",
  HR_DISBURSEMENT_REJECTED: "decisions",
  HR_ADJUSTMENT_SUBMITTED: "approvals",
  HR_ADJUSTMENT_APPROVED: "decisions",
  HR_ADJUSTMENT_REJECTED: "decisions",
  HR_COMP_PROFILE_SUBMITTED: "approvals",
  HR_COMP_PROFILE_APPROVED: "decisions",
  HR_COMP_PROFILE_REJECTED: "decisions",
  HR_COMP_RULE_SUBMITTED: "approvals",
  HR_COMP_RULE_APPROVED: "decisions",
  HR_COMP_RULE_REJECTED: "decisions",
  HR_GOLD_PAYOUT_SUBMITTED: "approvals",
  HR_GOLD_PAYOUT_APPROVED: "decisions",
  HR_GOLD_PAYOUT_REJECTED: "decisions",
  HR_DISCIPLINARY_SUBMITTED: "approvals",
  HR_DISCIPLINARY_APPROVED: "decisions",
  HR_DISCIPLINARY_REJECTED: "decisions",
  HR_INCIDENT_CREATED: "incidents",
  HR_INCIDENT_STATUS_CHANGED: "incidents",
  OPS_INCIDENT_CREATED: "incidents",
  OPS_INCIDENT_STATUS_CHANGED: "incidents",
  OPS_PERMIT_EXPIRING: "permits",
  OPS_PERMIT_EXPIRED: "permits",
  OPS_WORK_ORDER_OPENED: "incidents",
  OPS_WORK_ORDER_IN_PROGRESS: "incidents",
  CRM_LEAD_ASSIGNED: "assigned",
  CRM_LEAD_CREATED: "records",
  CRM_DOCUMENT_APPROVED: "records",
  CRM_DOCUMENT_DECLINED: "records",
  CRM_FOLLOW_UP_DUE: "assigned",
  CRM_TASK_ASSIGNED: "assigned",
  CRM_TASK_DUE: "assigned",
  CRM_MENTIONED: "mentions",
  CRM_COMMENT_ADDED: "records",
  CRM_REQUISITION_SUBMITTED: "approvals",
  CRM_REQUISITION_DECIDED: "decisions",
  CRM_REQUISITION_CANCELLED: "decisions",
  CRM_REQUISITION_QUESTION: "assigned",
  CRM_DAILY_REPORT_READY: "records",
  CRM_RECORD_ACTIVITY: "records",
  SCHOOL_NOTICE_ALL: "notices",
  SCHOOL_NOTICE_PARENTS: "notices",
  SCHOOL_NOTICE_STUDENTS: "notices",
  SCHOOL_NOTICE_TEACHERS: "notices",
  RETAIL_COUNT_ASSIGNED: "assigned",
  RETAIL_COUNT_SUBMITTED: "approvals",
  RETAIL_TRANSFER_SENT: "stock",
  RETAIL_TRANSFER_CANCELLED: "stock",
  RETAIL_PRICE_APPROVAL: "approvals",
  RETAIL_PRICE_DECIDED: "decisions",
  RETAIL_PIN_LOCKED: "assigned",
  RETAIL_SUPPORT: "assigned",
  RETAIL_STAFF_MESSAGE: "stock",
  RETAIL_SHIFT_DIFFERENCE: "tills",
  RETAIL_SHIFT_SIGNED_OFF: "tills",
  RETAIL_ORDER_FOLLOW_UP: "assigned",
  RETAIL_DELIVERY_TO_CHECK: "approvals",
};

/** Kinds the NotificationType enum has no value for carry their module in the payload. */
const KIND_OF_MODULE: Partial<Record<InboxModule, string>> = { vane: "vane", books: "payments" };

export type Received = { userId: string; type: string; payload: Record<string, unknown> | null };

/** The kind a notification is, by the module its payload names first, then its type. */
export function kindOf(n: Pick<Received, "type" | "payload">): string {
  const named = n.payload?.module;
  const byModule = isInboxModule(named) ? KIND_OF_MODULE[named] : undefined;
  if (byModule) return byModule;
  const byType = (KIND_OF_TYPE as Record<string, string | undefined>)[n.type];
  if (byType) return byType;
  return needsYou({ type: n.type, payload: n.payload }) ? "approvals" : "records";
}

/** The switch a type answers to (`lib/notifications.ts`): HR, operations (the shop's too) or CRM. */
export function categoryOf(type: string): Category {
  if (type.startsWith("HR_")) return "HR";
  if (type.startsWith("CRM_")) return "CRM";
  return "OPS";
}

export type Preference = {
  emailEnabled: boolean;
  hrEnabled: boolean;
  opsEnabled: boolean;
  crmEnabled: boolean;
};

const DEFAULT_PREFERENCE: Preference = { emailEnabled: true, hrEnabled: true, opsEnabled: true, crmEnabled: true };

function emails(preference: Preference | undefined, type: string) {
  const pref = preference ?? DEFAULT_PREFERENCE;
  if (!pref.emailEnabled) return false;
  const category = categoryOf(type);
  return category === "HR" ? pref.hrEnabled : category === "CRM" ? pref.crmEnabled : pref.opsEnabled;
}

export type Reach = { count: number; names: string[] };

export type RoutingRow = {
  key: string;
  group: RoutingGroup;
  label: string;
  note: string;
  /** Who it reached in the app in the period. */
  inApp: Reach;
  /** Of those, who has it emailed too, by their own switches today. */
  email: Reach;
};

export type Routing = {
  rows: RoutingRow[];
  /** Kinds that reached anyone in the period. */
  heard: number;
  days: number;
};

const runs = (features: readonly string[], prefixes: string[] | null) =>
  prefixes === null || prefixes.some((prefix) => features.some((feature) => feature.startsWith(prefix)));

/**
 * The rows the page lists: every kind the workspace can have, and any other
 * kind that reached someone anyway, each with the people it reached.
 */
export function buildRouting(input: {
  received: Received[];
  names: Map<string, string>;
  preferences: Map<string, Preference>;
  enabledFeatures: readonly string[];
  days: number;
}): Routing {
  const byKind = new Map<string, { inApp: Set<string>; email: Set<string> }>();
  for (const n of input.received) {
    const kind = kindOf(n);
    const entry = byKind.get(kind) ?? { inApp: new Set<string>(), email: new Set<string>() };
    entry.inApp.add(n.userId);
    if (emails(input.preferences.get(n.userId), n.type)) entry.email.add(n.userId);
    byKind.set(kind, entry);
  }
  const reach = (ids: Set<string> | undefined): Reach => {
    const names = [...(ids ?? [])].map((id) => input.names.get(id) ?? "Someone who has left").sort((a, b) => a.localeCompare(b));
    return { count: names.length, names };
  };
  const rows = ROUTING_KINDS.filter((kind) => byKind.has(kind.key) || runs(input.enabledFeatures, kind.features)).map((kind) => ({
    key: kind.key,
    group: kind.group,
    label: kind.label,
    note: kind.note,
    inApp: reach(byKind.get(kind.key)?.inApp),
    email: reach(byKind.get(kind.key)?.email),
  }));
  return { rows, heard: rows.filter((row) => row.inApp.count > 0).length, days: input.days };
}

/** "Floorcode heard about 6 kinds of thing in the last 30 days, in up to 2 places." */
export function routingFinding(routing: Routing, workspace: string): string {
  if (routing.heard === 0) return `Nobody at ${workspace} was notified in the last ${routing.days} days.`;
  const kinds = routing.heard === 1 ? "1 kind of thing" : `${routing.heard} kinds of thing`;
  return `${workspace} heard about ${kinds} in the last ${routing.days} days, in up to 2 places.`;
}

/** "4 people", "1 person". */
export function peopleLabel(count: number): string {
  return count === 1 ? "1 person" : `${count} people`;
}
