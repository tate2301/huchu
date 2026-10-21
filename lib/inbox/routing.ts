import type { NotificationType } from "@prisma/client";

import { isInboxModule, needsYou, type InboxModule } from "./describe";

/**
 * The kinds of notification, as Management → Notifications and My account →
 * Notifications list them (MgmtNotifications), and the kind each notification
 * is. Who is told is decided where each notification is sent (managers and
 * owners for approvals, the person named or given the work, the people on a
 * record); whether a kind reaches them, and where, is `settings.ts`.
 */

export type RoutingGroup = "needs" | "updates";

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
  { key: "team", group: "needs", label: "Team", note: "Seat requests, ownership offers, jobs handed over and requests to see a record", features: null },
  { key: "vane", group: "needs", label: "Vane’s issues", note: "Things Vane found that need a person", features: null },
  { key: "permits", group: "needs", label: "Permits", note: "A permit about to expire, or expired", features: ["compliance."] },
  { key: "decisions", group: "updates", label: "Decisions", note: "Approved, rejected or cancelled, back to whoever asked", features: null },
  { key: "payments", group: "updates", label: "Payments in", note: "Invoices paid, by any method", features: ["accounting."] },
  { key: "records", group: "updates", label: "Your records", note: "Comments, activity, quotes and new leads on records people are on", features: ["crm."] },
  { key: "incidents", group: "updates", label: "Incidents and work orders", note: "Reported, moved on or closed", features: ["compliance.", "maintenance.", "hr."] },
  { key: "tills", group: "updates", label: "Tills and cash-ups", note: "A till closes short or over, and its sign-off", features: ["retail."] },
  { key: "stock", group: "updates", label: "Stock and staff", note: "Transfers on their way, and messages to staff", features: ["retail."] },
  { key: "notices", group: "updates", label: "School notices", note: "Notices to parents, pupils and teachers", features: ["schools."] },
  { key: "reports", group: "updates", label: "Reports sent", note: "A scheduled report or question went out", features: null },
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
  BOOKS_INVOICE_PAID: "payments",
  BOOKS_PAYMENT_RECEIVED: "payments",
  HR_LEAVE_SUBMITTED: "approvals",
  HR_LEAVE_APPROVED: "decisions",
  HR_LEAVE_REJECTED: "decisions",
  REPORT_SENT: "reports",
  VANE_ISSUE_RAISED: "vane",
  TEAMS_SEAT_REQUEST: "team",
  TEAMS_OWNERSHIP_OFFER: "team",
  TEAMS_RECORD_HANDED_OVER: "team",
  TEAMS_ACCESS_REQUEST: "team",
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
