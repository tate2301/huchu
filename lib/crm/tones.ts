import type { BadgeTone } from "@corelithzw/react";

import type { CanonicalUiStatus } from "@/lib/ui/status-map";

/**
 * What colour each piece of CRM vocabulary is.
 *
 * Two rules, applied consistently, which is the whole point of gathering them
 * in one file rather than letting each screen invent its own map:
 *
 *   - A **state** is coloured. Won is green, blocked is red, awaiting a
 *     decision is amber. The colour is doing work — it is how you find the row
 *     that needs you without reading every row.
 *   - A **category** is not. "Contractor", "Site contact", "Sales rep" are
 *     facts about a record, not judgements on it, and colouring them spends
 *     the reader's attention on something that never needs acting on. Those
 *     stay neutral on purpose; the page is not monochrome by accident, it is
 *     monochrome everywhere the colour would mean nothing.
 *
 * Anything that is genuinely a state and is still rendering grey is a bug.
 */

/** How likely two records are the same. A near-certain duplicate is a problem. */
export const DUPLICATE_CONFIDENCE_TONE: Record<string, BadgeTone> = {
  HIGH: "danger",
  MEDIUM: "warn",
  LOW: "neutral",
};

/** Task priority. Normal and low are not worth a colour — that is what normal means. */
export const TASK_PRIORITY_TONE: Record<string, BadgeTone> = {
  LOW: "neutral",
  NORMAL: "neutral",
  HIGH: "warn",
  URGENT: "danger",
};

/** A pipeline stage's terminal outcome, as configured in settings. */
export const STAGE_OUTCOME_TONE: Record<string, BadgeTone> = {
  OPEN: "neutral",
  WON: "success",
  LOST: "danger",
};

/**
 * Where a job has got to. Canonical UI statuses rather than badge tones,
 * because these render through `StatusChip`.
 */
export const WORK_ORDER_STATUS: Record<string, CanonicalUiStatus> = {
  DRAFT: "inactive",
  SCHEDULED: "pending",
  IN_PROGRESS: "in_progress",
  BLOCKED: "failing",
  COMPLETED: "passing",
  CANCELLED: "inactive",
};

/** A quote, invoice or receipt's standing. */
export const DOCUMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SENT: { label: "Sent", tone: "info" },
  ISSUED: { label: "Issued", tone: "info" },
  ACCEPTED: { label: "Accepted", tone: "success" },
  PAID: { label: "Paid", tone: "success" },
  RECEIVED: { label: "Received", tone: "success" },
  EXPIRED: { label: "Expired", tone: "warn" },
  VOIDED: { label: "Voided", tone: "neutral" },
  MISSING: { label: "No paperwork", tone: "danger" },
};

/** A site visit's standing. */
export const VISIT_STATUS: Record<string, CanonicalUiStatus> = {
  SCHEDULED: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "passing",
  CANCELLED: "inactive",
  NO_SHOW: "failing",
};

/**
 * The dot beside a stage in a picker, on a board column, anywhere the stage
 * is named. A hue per stage rather than per outcome: in a list of six stages
 * the reader is telling them apart, not judging them, and six shades of the
 * same amber does that worse than six distinct hues.
 *
 * Deliberately the ramp tokens rather than the semantic ones, except at the
 * two ends where won and lost genuinely are success and failure.
 */
export const LEAD_STAGE_DOT: Record<string, string> = {
  NEW: "bg-[var(--tone-info)]",
  CONTACTED: "bg-[var(--accent-500)]",
  QUALIFIED: "bg-[var(--brand)]",
  SITE_VISIT: "bg-[var(--warning-400)]",
  QUOTED: "bg-[var(--tone-warn)]",
  INVOICED: "bg-[var(--warning-600)]",
  WON: "bg-[var(--tone-success)]",
  LOST: "bg-[var(--tone-danger)]",
};

/** A configurable pipeline stage's dot, keyed by its terminal outcome. */
export const DEAL_STAGE_DOT: Record<string, string> = {
  OPEN: "bg-[var(--brand)]",
  WON: "bg-[var(--tone-success)]",
  LOST: "bg-[var(--tone-danger)]",
};

/**
 * A stage's colour, resolved from the token stored on the pipeline stage.
 *
 * Two classes per colour rather than one: a dot for the header and a band for
 * the rule that runs along the top of the column. The band is what makes the
 * colour readable down a board — a dot alone is four pixels the eye has to
 * find twice, once per column.
 *
 * Unknown tokens fall back to the brand rather than to nothing, so a stage
 * somebody coloured with a token we have since renamed still reads as a stage.
 */
export const STAGE_COLOR: Record<string, { dot: string; band: string }> = {
  "status-info-border": { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  "status-success-border": { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  "status-warning-border": { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  "status-error-border": { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
  brand: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  accent: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
};

export function stageColor(token: string | null | undefined) {
  return (token && STAGE_COLOR[token]) || STAGE_COLOR.brand;
}

/** The fixed lead stages, in the same two-class shape as `stageColor`. */
export const LEAD_STAGE_COLOR: Record<string, { dot: string; band: string }> = {
  NEW: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  CONTACTED: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  QUALIFIED: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  SITE_VISIT: { dot: "bg-[var(--warning-400)]", band: "bg-[var(--warning-400)]" },
  QUOTED: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  INVOICED: { dot: "bg-[var(--warning-600)]", band: "bg-[var(--warning-600)]" },
  WON: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  LOST: { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
};

/**
 * Contact types, for the people board. A hue each so the columns are told
 * apart at a glance; no judgement in any of them, because a site contact is
 * not better or worse than a finance contact.
 */
export const CONTACT_TYPE_COLOR: Record<string, { dot: string; band: string }> = {
  CUSTOMER: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  DECISION_MAKER: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  SITE_CONTACT: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  FINANCE_CONTACT: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  SUPPLIER_CONTACT: { dot: "bg-[var(--warning-600)]", band: "bg-[var(--warning-600)]" },
  REFERRAL_PARTNER: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  OTHER: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
};

/**
 * Lead channels, for the setup page's channel cards and its source rows.
 *
 * A hue each and no judgement in any of them: a walk-in is not worth less than
 * a paid click, and colouring them as though it were would put a verdict on a
 * page whose only job is to say where enquiries came from. `OTHER` is
 * deliberately the subtle ink — it is the absence of an answer, not an answer.
 */
export const CRM_CHANNEL_COLOR: Record<string, { dot: string; band: string }> = {
  MANUAL: { dot: "bg-[var(--brand)]", band: "bg-[var(--brand)]" },
  WEB_FORM: { dot: "bg-[var(--tone-info)]", band: "bg-[var(--tone-info)]" },
  WEBHOOK: { dot: "bg-[var(--accent-500)]", band: "bg-[var(--accent-500)]" },
  SOCIAL: { dot: "bg-[var(--warning-400)]", band: "bg-[var(--warning-400)]" },
  ADS: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  REFERRAL: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  OTHER: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
};

/** Company account standing. Here the colour *is* a judgement, so it is semantic. */
export const ACCOUNT_STATUS_COLOR: Record<string, { dot: string; band: string }> = {
  ACTIVE: { dot: "bg-[var(--tone-success)]", band: "bg-[var(--tone-success)]" },
  ON_HOLD: { dot: "bg-[var(--tone-warn)]", band: "bg-[var(--tone-warn)]" },
  INACTIVE: { dot: "bg-[var(--text-subtle)]", band: "bg-[var(--text-subtle)]" },
  BLACKLISTED: { dot: "bg-[var(--tone-danger)]", band: "bg-[var(--tone-danger)]" },
};
