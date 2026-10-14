import type { BadgeTone } from "@corelithzw/react";

/**
 * A workspace's standing: the one word for "can they use it, and why not".
 *
 * The database answers that with three things — `Company.tenantStatus`, the
 * latest `CompanySubscription`, and its plan's grace days — and the tenant app
 * reads them through `getSubscriptionHealth`. This is the same reading, done in
 * one place for the portal, over rows a list has already loaded, so a page of
 * workspaces costs one query rather than one per row. The rules are the ones
 * `getSubscriptionHealth` applies, so the portal and the product cannot
 * disagree about who is read-only.
 */

export const STANDINGS = ["Setting up", "Trial", "Active", "Past due", "Read-only", "Suspended", "Closed"] as const;
export type Standing = (typeof STANDINGS)[number];

export const STANDING_TONE: Record<Standing, BadgeTone> = {
  "Setting up": "info",
  Trial: "info",
  Active: "neutral",
  "Past due": "warn",
  "Read-only": "danger",
  Suspended: "danger",
  Closed: "neutral",
};

/** Subscription statuses that block outright, whatever the dates say. */
const BLOCKING_STATUSES = new Set(["CANCELED", "CANCELLED", "EXPIRED"]);

const DAY_MS = 24 * 60 * 60 * 1000;

export type StandingInput = {
  tenantStatus: string;
  subscription: {
    status: string;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
    graceDays: number;
  } | null;
};

export type StandingReading = {
  standing: Standing;
  /** The date the standing turns on: the trial's end, the period's end, or when grace runs out. */
  until: Date | null;
  /** Whole days left before `until`, or overdue past it (negative). */
  days: number | null;
};

export function readStanding(input: StandingInput, now = new Date()): StandingReading {
  switch (input.tenantStatus) {
    case "PROVISIONING":
      return { standing: "Setting up", until: null, days: null };
    case "SUSPENDED":
      return { standing: "Suspended", until: null, days: null };
    case "DISABLED":
      return { standing: "Closed", until: null, days: null };
  }

  const subscription = input.subscription;
  if (!subscription) return { standing: "Read-only", until: null, days: null };

  const end = subscription.currentPeriodEnd ?? subscription.trialEndsAt;
  const days = end ? Math.ceil((end.getTime() - now.getTime()) / DAY_MS) : null;

  if (BLOCKING_STATUSES.has(subscription.status)) return { standing: "Read-only", until: end, days };

  if (end && days !== null && days < 0) {
    const graceEnds = new Date(end.getTime() + subscription.graceDays * DAY_MS);
    return graceEnds > now
      ? { standing: "Past due", until: graceEnds, days }
      : { standing: "Read-only", until: graceEnds, days };
  }

  if (subscription.status === "PAST_DUE") return { standing: "Past due", until: end, days };
  if (subscription.status === "TRIALING") return { standing: "Trial", until: end, days };
  return { standing: "Active", until: end, days };
}

const SHORT_DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Harare" });

/** "Trial, 4 days left", "Past due, read-only from 15 Oct" — the badge says the state, `detail` says when it turns. */
export function standingDetail(reading: StandingReading): string | null {
  const { standing, until, days } = reading;
  if (!until || days === null) return null;
  if (standing === "Trial") return days <= 0 ? "ends today" : `${days} ${days === 1 ? "day" : "days"} left`;
  if (standing === "Past due") return `read-only from ${SHORT_DATE.format(until)}`;
  if (standing === "Active") return `paid to ${SHORT_DATE.format(until)}`;
  if (standing === "Read-only") return `since ${SHORT_DATE.format(until)}`;
  return null;
}

