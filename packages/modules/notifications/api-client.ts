/**
 * The notification centre's client: what the browser asks of `/api/notifications`.
 */
import { buildQuery, fetchJson, type PaginationMeta } from "@corelithzw/platform/api-client";

export type NotificationType =
  | "HR_PAYROLL_SUBMITTED"
  | "HR_PAYROLL_APPROVED"
  | "HR_PAYROLL_REJECTED"
  | "HR_DISBURSEMENT_SUBMITTED"
  | "HR_DISBURSEMENT_APPROVED"
  | "HR_DISBURSEMENT_REJECTED"
  | "HR_ADJUSTMENT_SUBMITTED"
  | "HR_ADJUSTMENT_APPROVED"
  | "HR_ADJUSTMENT_REJECTED"
  | "HR_COMP_PROFILE_SUBMITTED"
  | "HR_COMP_PROFILE_APPROVED"
  | "HR_COMP_PROFILE_REJECTED"
  | "HR_COMP_RULE_SUBMITTED"
  | "HR_COMP_RULE_APPROVED"
  | "HR_COMP_RULE_REJECTED"
  | "HR_GOLD_PAYOUT_SUBMITTED"
  | "HR_GOLD_PAYOUT_APPROVED"
  | "HR_GOLD_PAYOUT_REJECTED"
  | "HR_DISCIPLINARY_SUBMITTED"
  | "HR_DISCIPLINARY_APPROVED"
  | "HR_DISCIPLINARY_REJECTED"
  | "HR_INCIDENT_CREATED"
  | "HR_INCIDENT_STATUS_CHANGED"
  | "OPS_INCIDENT_CREATED"
  | "OPS_INCIDENT_STATUS_CHANGED"
  | "OPS_PERMIT_EXPIRING"
  | "OPS_PERMIT_EXPIRED"
  | "OPS_WORK_ORDER_OPENED"
  | "OPS_WORK_ORDER_IN_PROGRESS";

export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

export type NotificationEntityType =
  | "PAYROLL_RUN"
  | "DISBURSEMENT_BATCH"
  | "ADJUSTMENT_ENTRY"
  | "COMPENSATION_PROFILE"
  | "COMPENSATION_RULE"
  | "GOLD_SHIFT_ALLOCATION"
  | "DISCIPLINARY_ACTION"
  | "HR_INCIDENT"
  | "INCIDENT"
  | "PERMIT"
  | "WORK_ORDER";

export type NotificationAction = {
  key: string;
  label: string;
  kind: "api" | "link";
  href: string;
  method?: "POST" | "PATCH" | "DELETE";
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost";
  confirmMessage?: string;
};

export type NotificationListItem = {
  id: string;
  recipientId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  summary: string;
  payload: Record<string, unknown> | null;
  entityType?: NotificationEntityType | null;
  entityId?: string | null;
  sourceAction?: string | null;
  createdAt: string;
  isRead: boolean;
  readAt?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  actionTaken?: string | null;
  actedAt?: string | null;
  actions: NotificationAction[];
};

export type NotificationListResponse = {
  data: NotificationListItem[];
  pagination: PaginationMeta;
  unreadCount: number;
};

export type UserNotificationPreferences = {
  userId: string;
  inAppEnabled: boolean;
  webPushEnabled: boolean;
  hrEnabled: boolean;
  opsEnabled: boolean;
  crmEnabled: boolean;
};

export async function fetchNotifications(
  params: {
    unreadOnly?: boolean;
    includeArchived?: boolean;
    type?: NotificationType;
    severity?: NotificationSeverity;
    page?: number;
    limit?: number;
  } = {},
) {
  const query = buildQuery(params);
  return fetchJson<NotificationListResponse>(`/api/notifications${query}`);
}

export async function markNotificationsRead(input: {
  recipientIds: string[];
  actionTaken?: string;
}) {
  return fetchJson<{ updated: number }>("/api/notifications/read", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function archiveNotifications(input: { recipientIds: string[] }) {
  return fetchJson<{ updated: number }>("/api/notifications/archive", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchNotificationPreferences() {
  return fetchJson<UserNotificationPreferences>("/api/notifications/preferences");
}

export async function updateNotificationPreferences(
  input: Partial<
    Pick<
      UserNotificationPreferences,
      "inAppEnabled" | "webPushEnabled" | "hrEnabled" | "opsEnabled" | "crmEnabled"
    >
  >,
) {
  return fetchJson<UserNotificationPreferences>("/api/notifications/preferences", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function saveWebPushSubscription(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
}) {
  return fetchJson("/api/notifications/push-subscriptions", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeWebPushSubscription(input: { endpoint: string }) {
  return fetchJson<{ updated: number }>("/api/notifications/push-subscriptions", {
    method: "DELETE",
    body: JSON.stringify(input),
  });
}
