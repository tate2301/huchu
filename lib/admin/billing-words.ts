import type { SubscriptionStatus } from "@prisma/client";

/** A subscription's statuses, in the words billing uses. Safe for the browser. */

export const SUBSCRIPTION_STATUSES = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"] as const satisfies readonly SubscriptionStatus[];

export const SUBSCRIPTION_STATUS_LABEL: Record<SubscriptionStatus, string> = {
  TRIALING: "On a trial",
  ACTIVE: "Active",
  PAST_DUE: "Past due",
  CANCELED: "Cancelled",
  EXPIRED: "Expired",
};

/** What each status does to the workspace, for the operator choosing one. */
export const SUBSCRIPTION_STATUS_EFFECT: Record<SubscriptionStatus, string> = {
  TRIALING: "Open until the trial ends.",
  ACTIVE: "Open while it is paid up.",
  PAST_DUE: "Open for its grace days, then read-only.",
  CANCELED: "Read-only at once. The data is kept.",
  EXPIRED: "Read-only at once. The data is kept.",
};
